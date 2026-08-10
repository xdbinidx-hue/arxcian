import { fetchAndCache, readCached } from '../cache'
import type { Sentiment } from './types'

const CACHE_KEY = 'trading:sentiment'
const TTL_SECONDS = 60 * 60 // Fear & Greed -indeksi päivittyy kerran päivässä

type FngResponse = {
  data: { value: string; value_classification: string; timestamp: string }[]
}

async function fetchFearGreed(): Promise<Sentiment> {
  const res = await fetch('https://api.alternative.me/fng/?limit=1')
  if (!res.ok) throw new Error(`alternative.me: HTTP ${res.status}`)
  const data = (await res.json()) as FngResponse
  const point = data.data[0]
  if (!point) throw new Error('Fear & Greed -indeksi ei palauttanut dataa')

  return {
    value: Number(point.value),
    classification: point.value_classification,
    timestamp: Number(point.timestamp) * 1000,
  }
}

export async function getSentiment() {
  return fetchAndCache({ key: CACHE_KEY, ttl: TTL_SECONDS }, fetchFearGreed)
}

/** Vain välimuistista, ei hakua lähteestä — assistentti ei saa laukaista ulkoisia hakuja. */
export async function readCachedSentiment() {
  return readCached<Sentiment>(CACHE_KEY)
}

/** Suomennos + väri UI:ta varten. */
export function describeSentiment(classification: string): { label: string; tone: 'down' | 'warn' | 'neutral' | 'up' } {
  const table: Record<string, { label: string; tone: 'down' | 'warn' | 'neutral' | 'up' }> = {
    'Extreme Fear': { label: 'Äärimmäinen pelko', tone: 'down' },
    Fear: { label: 'Pelko', tone: 'warn' },
    Neutral: { label: 'Neutraali', tone: 'neutral' },
    Greed: { label: 'Ahneus', tone: 'up' },
    'Extreme Greed': { label: 'Äärimmäinen ahneus', tone: 'up' },
  }
  return table[classification] ?? { label: classification, tone: 'neutral' }
}
