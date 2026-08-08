import { getQuotes } from '@/lib/arxcian/trading/quotes'
import { WATCHLIST } from '@/lib/arxcian/trading/symbols'
import { SYMBOL_VENUE, VENUES, type VenueId } from './venues'
import type { GlobeLayer, GlobePoint, PointTone } from './types'

/** Perusnäkymä ilman datapisteitä. */
export function worldLayer(): GlobeLayer {
  return {
    id: 'world',
    label: 'Maailma',
    points: [],
    source: { name: 'staattinen', fetchedAt: null },
  }
}

function toneFor(changePercent: number): PointTone {
  if (changePercent > 0.05) return 'up'
  if (changePercent < -0.05) return 'down'
  return 'neutral'
}

function fmtPercent(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2).replace('.', ',')} %`
}

/**
 * Markets-kerros: watchlistin instrumentit ryhmiteltynä kaupankäyntipaikkoihin.
 *
 * Luetaan välimuistista kuten muutkin näkymät — maapallo ei koskaan odota
 * Yahoo Financen vastausta.
 */
export async function marketsLayer(): Promise<GlobeLayer> {
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
    id: 'markets',
    label: 'Markkinat',
    points,
    source: { name: 'Yahoo Finance', fetchedAt: cached?.data.fetchedAt ?? null },
    caveat:
      `Valuuttaparit on sijoitettu vastavaluutan kotikeskukseen — valuuttakauppa on ` +
      `OTC-markkina eikä sillä ole yhtä pörssiä. ${cryptoCount} kryptoa jätetty pois: ` +
      `ne käyvät kauppaa ympäri vuorokauden ilman sijaintia.`,
  }
}
