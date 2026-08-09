import { getQuotes } from './quotes'
import { WATCHLIST } from './symbols'
import type { AssetClass } from './types'

export type SnapshotEntry = {
  symbol: string
  name: string
  assetClass: AssetClass
  price: number | null
  change: number | null
  changePercent: number | null
}

/**
 * Koko watchlist nykyhinnoin, yhdessä luettavassa muodossa. Lukee vain
 * välimuistista (getQuotes) — ei koskaan hae suoraan Yahoo Financesta, jonka
 * dokumentoimaton API ei siedä toistuvaa kutsuntaa.
 *
 * Tyhjä välimuisti ei ole virhetila: hinnat eivät ole vielä ehtineet
 * ensimmäiseen ajastettuun hakuun, sama tilanne kuin muillakin sivuilla.
 */
export async function watchlistSnapshot(): Promise<SnapshotEntry[]> {
  const cached = await getQuotes()
  if (!cached) return []

  const { quotes } = cached.data
  return WATCHLIST.map(w => {
    const quote = quotes[w.quoteSymbol]
    return {
      symbol: w.quoteSymbol,
      name: w.label,
      assetClass: w.assetClass,
      price: quote?.price ?? null,
      change: quote?.change ?? null,
      changePercent: quote?.changePercent ?? null,
    }
  })
}
