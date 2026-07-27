import { readCached, writeCached } from '../cache'
import { WATCHLIST } from './symbols'
import type { Quote, WatchlistData } from './types'

const CACHE_KEY = 'trading:quotes'
// Watchlist päivittyy samassa tahdissa kuin uutiset (4x/pv). Yahoo Financen
// haku itsessään on nopea (rinnakkain, ei krediittirajaa), TTL on silti
// sidottu ajastuksen väliin ettei sivu näytä vanhentunutta dataa turhaan.
const TTL_SECONDS = 6 * 60 * 60

type YahooChartResponse = {
  chart: { result: [{ meta: { regularMarketPrice: number; previousClose?: number; chartPreviousClose?: number } }] | null }
}

/**
 * Yahoo Financen dokumentoimaton chart-API. Kattaa kaikki watchlistin
 * omaisuusluokat yhdellä lähteellä (osakkeet, forex, krypto, indeksit,
 * hyödykkeet) — ei virallista tukea, ei SLA:ta. Jos tämä alkaa epäonnistua
 * toistuvasti, kerro käyttäjälle, älä yritä paikata hiljaa.
 */
async function fetchYahooQuote(symbol: string): Promise<Quote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; arxcian/1.0)' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as YahooChartResponse
    const meta = data.chart.result?.[0]?.meta
    if (!meta || typeof meta.regularMarketPrice !== 'number') return null

    const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice
    const change = meta.regularMarketPrice - prevClose

    return {
      symbol,
      price: meta.regularMarketPrice,
      change,
      changePercent: prevClose ? (change / prevClose) * 100 : 0,
      timestamp: Date.now(),
    }
  } catch (e) {
    console.error(`[quotes] Yahoo-haku epäonnistui: ${symbol}`, e)
    return null
  }
}

async function fetchAllQuotes(): Promise<WatchlistData> {
  const symbols = WATCHLIST.map(w => w.quoteSymbol)
  const results = await Promise.all(symbols.map(fetchYahooQuote))

  const quotes: Record<string, Quote | null> = {}
  symbols.forEach((symbol, i) => {
    quotes[symbol] = results[i]
  })

  return { quotes, fetchedAt: Date.now() }
}

/**
 * Ajetaan cronista — hakee koko watchlistin ja kirjoittaa välimuistiin.
 * Symboli jonka haku epäonnistuu tällä kierroksella säilyttää edellisen
 * onnistuneen kurssin sen sijaan että näyttäisi tyhjää — sama periaate
 * kuin fetchAndCache-apurissa muualla.
 */
export async function refreshQuotes(): Promise<WatchlistData> {
  const [data, previous] = await Promise.all([fetchAllQuotes(), getQuotes()])

  if (previous) {
    for (const [symbol, quote] of Object.entries(data.quotes)) {
      if (quote === null && previous.data.quotes[symbol]) {
        data.quotes[symbol] = previous.data.quotes[symbol]
      }
    }
  }

  await writeCached(CACHE_KEY, data, TTL_SECONDS)
  return data
}

/** Sivut lukevat tätä — ei koskaan hae suoraan lähteestä. */
export async function getQuotes() {
  return readCached<WatchlistData>(CACHE_KEY)
}
