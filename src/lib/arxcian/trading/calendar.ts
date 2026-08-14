import { readCached, writeCached } from '../cache'
import type { CalendarEvent, CalendarImpact } from './types'

const CACHE_KEY = 'trading:calendar'

/**
 * ForexFactoryn viikkokalenteri FairEconomyn syötteenä.
 *
 * **Lähde on rate-limitattu ja Cloudflaren takana.** Kuusi hakua parin
 * minuutin sisällä riitti tuottamaan `429`-vastauksen ja `retry-after: 300`
 * -otsakkeen (mitattu 12.8.2026). Siksi tässä ei ole `fetchAndCache`-apuria
 * lainkaan: haun saa tehdä **vain cron**, ja sivut lukevat `getCalendar()`illa
 * pelkkää välimuistia — sama ratkaisu kuin quotes.ts:ssä Yahoon kanssa.
 *
 * Kalenterin lukeminen ei kärsi harvasta hausta: syöte sisältää koko viikon
 * tapahtumat kellonaikoineen, joten lähtölaskenta lasketaan renderissä
 * välimuistin datasta eikä se vanhene hakujen välissä. Vain ennusteluvut
 * päivittyvät neljä kertaa vuorokaudessa.
 *
 * Tunnetut rajat, jotka näkyvät myös käyttöliittymässä:
 * - Vain kuluva viikko. `nextweek`, `today` ja `lastweek` vastaavat 404.
 * - Ei `actual`-kenttää: julkaisun jälkeen tiedämme että luku tuli, emme lukua.
 */
const FEED_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'

// Sama tahti kuin muilla ajastetuilla hauilla (4x/pv).
const TTL_SECONDS = 6 * 60 * 60

// Vanhentunut kalenteri on poikkeuksellisen käyttökelpoinen: tapahtuma-ajat
// eivät muutu jälkikäteen, joten viikon vanhakin haku kertoo yhä oikein mitä
// on tulossa. Siksi stale-ikkuna on viikko eikä oletuksen vuorokausi.
const STALE_SECONDS = 7 * 24 * 60 * 60

/** Tapahtuma näkyy vielä tämän verran julkaisunsa jälkeen. */
export const RELEASED_WINDOW_MS = 2 * 60 * 60 * 1000

/** Tätä lähempänä oleva tapahtuma on "kohta" — hälytyksen varsinainen tarkoitus. */
export const IMMINENT_MS = 60 * 60 * 1000

const IMPACTS: readonly string[] = ['High', 'Medium', 'Low', 'Holiday']

type RawEvent = {
  title?: unknown
  country?: unknown
  date?: unknown
  impact?: unknown
  forecast?: unknown
  previous?: unknown
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toImpact(value: unknown): CalendarImpact | null {
  const raw = text(value)
  return IMPACTS.includes(raw) ? (raw as CalendarImpact) : null
}

/**
 * Jäsentää syötteen ja pudottaa vajaat rivit hiljaa.
 *
 * Yksittäinen tunnistamaton rivi ei saa kaataa koko kalenteria — lähde on
 * kolmannen osapuolen eikä sen kenttävalikoima ole sopimus. Tyhjä tulos sen
 * sijaan heitetään, koska se tarkoittaa ettei vastaus ollut kalenteri
 * lainkaan (esim. Cloudflaren välisivu).
 */
function parseEvents(raw: unknown): CalendarEvent[] {
  if (!Array.isArray(raw)) throw new Error('Talouskalenteri: odotettiin taulukkoa')

  const events: CalendarEvent[] = []

  for (const item of raw as RawEvent[]) {
    const impact = toImpact(item.impact)
    const title = text(item.title)
    // Aikaleimassa on vyöhykesiirtymä (…-04:00), joten tämä on absoluuttinen
    // hetki ilman omaa kesäaikalogiikkaa. Sitä ei siis saa korjata käsin.
    const time = Date.parse(text(item.date))

    if (!impact || !title || Number.isNaN(time)) continue

    events.push({
      title,
      currency: text(item.country),
      time,
      impact,
      forecast: text(item.forecast),
      previous: text(item.previous),
    })
  }

  if (events.length === 0) throw new Error('Talouskalenteri: ei yhtään kelvollista tapahtumaa')

  return events.sort((a, b) => a.time - b.time)
}

async function fetchCalendar(): Promise<CalendarEvent[]> {
  // Selainmaiset otsakkeet samasta syystä kuin ict.ts:ssä ja channels.ts:ssä:
  // Cloudflaren takana oleva lähde kohtelee konesalista tulevaa bottikutsua
  // eri tavalla kuin selainta.
  const res = await fetch(FEED_URL, {
    // Nextin 14:n fetch on oletuksena force-cache, joten ilman tätä vastaus
    // jäisi Data Cacheen ja cron kirjoittaisi Redisiin joka kerta saman
    // jäätyneen viikon — viikonvaihteen jälkeen jo menneitä tapahtumia.
    // Cron-reitin `dynamic = 'force-dynamic'` estää sen tällä hetkellä, mutta
    // se takuu on toisessa tiedostossa: kutsu mistä tahansa muualta menisi
    // välimuistiin hiljaa, kirjaamatta virhettä. Sama vika kuin @vercel/kv:n
    // oletusasiakkaassa (ks. lib/arxcian/kv.ts).
    cache: 'no-store',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })

  // 429 on tässä odotettavissa oleva vastaus eikä yllätys, joten se sanotaan
  // erikseen: cronin lokista pitää näkyä ero "lähde kaatui" ja "haettiin liian
  // tiheään" välillä.
  if (res.status === 429) throw new Error('Talouskalenteri: 429, haku rate-limitattu')
  if (!res.ok) throw new Error(`Talouskalenteri: HTTP ${res.status}`)

  return parseEvents(await res.json())
}

/** Ajetaan cronista — ainoa paikka joka hakee lähteestä. */
export async function refreshCalendar(): Promise<CalendarEvent[]> {
  const events = await fetchCalendar()
  await writeCached(CACHE_KEY, events, TTL_SECONDS, STALE_SECONDS)
  return events
}

/** Sivut lukevat tätä. Ei koskaan hae lähteestä — ks. rate limit yllä. */
export async function getCalendar() {
  return readCached<CalendarEvent[]>(CACHE_KEY)
}

/**
 * Punaiset tapahtumat hälytysikkunassa: juuri julkaistut ja kaikki tulevat.
 *
 * Jo julkaistut pidetään hetken mukana, koska "pysyn ajan tasalla" tarkoittaa
 * myös sitä että äsken ohi mennyt CPI näkyy vielä ruudulla — muuten tunnin
 * poissaolo riittäisi siihen ettei tapahtumaa koskaan huomannut.
 */
export function highImpactEvents(events: CalendarEvent[], now: number): CalendarEvent[] {
  return events.filter(e => e.impact === 'High' && e.time > now - RELEASED_WINDOW_MS)
}
