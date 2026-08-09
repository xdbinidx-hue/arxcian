import { getQuotes } from '@/lib/arxcian/trading/quotes'
import { WATCHLIST } from '@/lib/arxcian/trading/symbols'
import { getCityWeather, describeWeatherCode } from '@/lib/arxcian/weather'
import { SYMBOL_VENUE, VENUES, type VenueId } from './venues'
import type { GlobeData, GlobePoint, GlobeSource, PointTone } from './types'

function toneFor(changePercent: number): PointTone {
  if (changePercent > 0.05) return 'up'
  if (changePercent < -0.05) return 'down'
  return 'neutral'
}

function fmtPercent(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2).replace('.', ',')} %`
}

type Part = { points: GlobePoint[]; source: GlobeSource; caveat?: string }

/**
 * Markkinapisteet: watchlistin instrumentit ryhmiteltynä kaupankäyntipaikkoihin.
 *
 * Luetaan välimuistista kuten muukin ulkoinen data — maapallo ei koskaan odota
 * Yahoo Financen vastausta.
 */
async function marketPoints(): Promise<Part> {
  const cached = await getQuotes()
  const quotes = cached?.data.quotes ?? {}

  // Ryhmitellään symbolit paikoittain ja lasketaan keskimääräinen muutos.
  const grouped = new Map<VenueId, { labels: string[]; changes: number[] }>()
  for (const sym of WATCHLIST) {
    const venue = SYMBOL_VENUE[sym.quoteSymbol]
    if (!venue) continue // kryptot: ei sijaintia
    const quote = quotes[sym.quoteSymbol]
    if (!quote) continue // ei kurssia tällä kierroksella

    const entry = grouped.get(venue) ?? { labels: [], changes: [] }
    entry.labels.push(sym.label)
    entry.changes.push(quote.changePercent)
    grouped.set(venue, entry)
  }

  const maxCount = Math.max(1, ...Array.from(grouped.values(), g => g.labels.length))

  const points: GlobePoint[] = Array.from(grouped.entries()).map(([venueId, g]) => {
    const avg = g.changes.reduce((a, b) => a + b, 0) / g.changes.length
    const venue = VENUES[venueId]
    return {
      id: venueId,
      kind: 'markets',
      lat: venue.lat,
      lng: venue.lng,
      label: venue.label,
      // Koko skaalautuu instrumenttien määrän mukaan, mutta pohja-arvo pitää
      // pienimmätkin paikat näkyvinä.
      weight: 0.35 + 0.65 * (g.labels.length / maxCount),
      tone: toneFor(avg),
      meta: `${g.labels.length} instrumenttia · ${fmtPercent(avg)}`,
      href: '/arxcian/trading',
    }
  })

  const cryptoCount = WATCHLIST.filter(s => !SYMBOL_VENUE[s.quoteSymbol]).length

  return {
    points,
    source: { name: 'Yahoo Finance', fetchedAt: cached?.data.fetchedAt ?? null },
    caveat:
      `Valuuttaparit on sijoitettu vastavaluutan kotikeskukseen — valuuttakauppa on ` +
      `OTC-markkina eikä sillä ole yhtä pörssiä. ${cryptoCount} kryptoa jätetty pois: ` +
      `ne käyvät kauppaa ympäri vuorokauden ilman sijaintia.`,
  }
}

/** Säätunnukset jotka ansaitsevat huomiovärin: ukkonen, rankkasade, raju lumi. */
const SEVERE_CODES = new Set([65, 75, 82, 95, 96, 99])

/**
 * Sääpisteet: nykysää kaupungeittain.
 *
 * Kaikki kaupungit haetaan yhdellä Open-Meteo-kutsulla, ja tulos kulkee saman
 * fetchAndCache-apurin läpi kuin muukin ulkoinen data.
 */
async function weatherPoints(): Promise<Part> {
  // getCityWeather heittää jos haku epäonnistuu EIKÄ välimuistissa ole mitään.
  // Hub-sivu ei saa kaatua siihen, joten pisteet palautetaan tyhjinä ja syy
  // näytetään käyttäjälle.
  let cached: Awaited<ReturnType<typeof getCityWeather>>
  try {
    cached = await getCityWeather()
  } catch (e) {
    console.error('[globe] sään haku epäonnistui', e)
    return {
      points: [],
      source: { name: 'Open-Meteo', fetchedAt: null },
      caveat: 'Säätietoja ei saatu haettua. Seuraava ajastettu haku yrittää uudelleen.',
    }
  }

  const points: GlobePoint[] = cached.data.map(city => {
    const { label } = describeWeatherCode(city.weatherCode)
    const celsius = Math.round(city.temperature)
    return {
      id: `weather-${city.name}`,
      kind: 'weather',
      lat: city.lat,
      lng: city.lon,
      label: city.name,
      // Kaikki pisteet samankokoisia: lämpötila ei ole määrä, joten koon
      // sitominen siihen antaisi harhaanjohtavan vaikutelman.
      weight: 0.5,
      tone: SEVERE_CODES.has(city.weatherCode) ? 'warn' : 'neutral',
      meta: `${celsius} °C · ${label}`,
      // Kutsuviivan päähän piirretään pelkkä lämpötila. Kaupungin nimi tulee
      // viivan toisesta päästä, joten sitä ei toisteta.
      callout: `${celsius}°`,
    }
  })

  return { points, source: { name: 'Open-Meteo', fetchedAt: cached.fetchedAt } }
}

/**
 * Koko maapallon data yhtenä näkymänä: markkinapaikat ja kaupunkien sää
 * samalla kartalla. Molemmat haut rinnakkain — kumpikin lukee omasta
 * välimuististaan eikä toisen hitaus viivytä toista.
 */
export async function hubData(): Promise<GlobeData> {
  const parts = await Promise.all([marketPoints(), weatherPoints()])

  return {
    points: parts.flatMap(p => p.points),
    sources: parts.map(p => p.source),
    caveats: parts.flatMap(p => (p.caveat ? [p.caveat] : [])),
  }
}
