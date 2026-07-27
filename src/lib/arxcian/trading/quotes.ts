import { readCached, writeCached } from '../cache'
import { WATCHLIST } from './symbols'
import type { Quote, WatchlistData } from './types'

const CACHE_KEY = 'trading:quotes'
// Watchlist päivittyy samassa tahdissa kuin uutiset (4x/pv) — Twelve
// Datan ilmaistason 8 krediitin/min raja tekisi tiheämmästä päivityksestä
// kalliin (yksi täysi haku vie jo ~2 min erien välisten viiveiden takia).
const TTL_SECONDS = 6 * 60 * 60

// Twelve Datan ilmaistaso sanoo "8 krediittiä/min", mutta havaittu käytännössä:
// krypto- ja hyödykesymbolit (BTC/USD, ETH/USD, XAU/USD) painavat enemmän kuin
// forex/osakkeet — 8 symbolin sekoitettu erä palautti niille osittaisen
// virheen vaikka loput 5 onnistuivat samassa erässä. Pienempi eräkoko +
// uusinta osittaisellekin epäonnistumiselle antaa marginaalia.
const TWELVEDATA_BATCH_SIZE = 6
const TWELVEDATA_BATCH_DELAY_MS = 60_000

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

type TwelveDataQuote = { symbol: string; close: string; percent_change?: string; change?: string }
type TwelveDataError = { code: number; message: string; status: 'error' }

function isError(v: unknown): v is TwelveDataError {
  return !!v && typeof v === 'object' && 'status' in v && (v as TwelveDataError).status === 'error'
}

async function fetchTwelveDataBatch(symbols: string[]): Promise<Record<string, Quote | null>> {
  const key = process.env.TWELVE_DATA_API_KEY
  const out: Record<string, Quote | null> = {}
  if (!key) {
    symbols.forEach(s => (out[s] = null))
    return out
  }

  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols.join(','))}&apikey=${key}`
  const res = await fetch(url)
  // Yhden symbolin pyyntö palauttaa suoran TwelveDataQuote-objektin, ei symboli-avaimin.
  const data = (await res.json()) as TwelveDataQuote | Record<string, TwelveDataQuote | TwelveDataError> | TwelveDataError

  if (isError(data)) {
    console.error('[quotes] Twelve Data -erä epäonnistui', data.message)
    symbols.forEach(s => (out[s] = null))
    return out
  }

  const bySymbol: Record<string, TwelveDataQuote | TwelveDataError> =
    symbols.length === 1 ? { [symbols[0]]: data as TwelveDataQuote } : (data as Record<string, TwelveDataQuote | TwelveDataError>)

  for (const symbol of symbols) {
    const entry = bySymbol[symbol]
    if (!entry || isError(entry) || entry.close == null) {
      out[symbol] = null
      continue
    }
    out[symbol] = {
      symbol,
      price: Number(entry.close),
      change: Number(entry.change ?? 0),
      changePercent: Number(entry.percent_change ?? 0),
      timestamp: Date.now(),
    }
  }
  return out
}

/** Hakee Twelve Data -symbolit erissä krediittirajan (8/min) puitteissa. */
async function fetchTwelveData(symbols: string[]): Promise<Record<string, Quote | null>> {
  const out: Record<string, Quote | null> = {}
  for (let i = 0; i < symbols.length; i += TWELVEDATA_BATCH_SIZE) {
    const batch = symbols.slice(i, i + TWELVEDATA_BATCH_SIZE)
    if (i > 0) await sleep(TWELVEDATA_BATCH_DELAY_MS)

    let result = await fetchTwelveDataBatch(batch)
    // Yksi uusinta myös osittaiselle epäonnistumiselle — krediittiraja voi
    // osua vain osaan erän symboleista (ks. yllä), ei vain koko erään.
    const failed = Object.entries(result).filter(([, q]) => q === null).map(([s]) => s)
    if (failed.length > 0) {
      await sleep(20_000)
      const retry = await fetchTwelveDataBatch(failed)
      Object.assign(result, retry)
    }
    Object.assign(out, result)
  }
  return out
}

type YahooChartResponse = {
  chart: { result: [{ meta: { regularMarketPrice: number; previousClose?: number; chartPreviousClose?: number } }] | null }
}

/**
 * Yahoo Financen dokumentoimaton chart-API. Käytetään vain neljälle
 * symbolille joita Twelve Datan ilmaistaso ei tue (öljy, indeksit, DXY).
 * Ei virallista tukea, ei SLA:ta — jos tämä alkaa epäonnistua toistuvasti,
 * kerro käyttäjälle älä yritä paikata hiljaa.
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
  const twelveDataSymbols = WATCHLIST.filter(w => w.quoteProvider === 'twelvedata').map(w => w.quoteSymbol)
  const yahooSymbols = WATCHLIST.filter(w => w.quoteProvider === 'yahoo').map(w => w.quoteSymbol)

  const [twelveData, yahooResults] = await Promise.all([
    fetchTwelveData(twelveDataSymbols),
    Promise.all(yahooSymbols.map(fetchYahooQuote)),
  ])

  const quotes: Record<string, Quote | null> = { ...twelveData }
  yahooSymbols.forEach((symbol, i) => {
    quotes[symbol] = yahooResults[i]
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
