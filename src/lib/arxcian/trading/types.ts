export type AssetClass = 'forex' | 'crypto' | 'index' | 'commodity' | 'stock'

export type Quote = {
  symbol: string
  price: number
  change: number
  changePercent: number
  /** Unix ms, milloin kurssi haettiin */
  timestamp: number
}

export type WatchlistData = {
  quotes: Record<string, Quote | null>
  fetchedAt: number
}

export type Sentiment = {
  value: number
  classification: string
  timestamp: number
}

export type IctVideo = {
  id: string
  title: string
  link: string
  thumbnail: string
  publishedAt: number | null
}

export type AlertCondition = 'above' | 'below'

export type Alert = {
  id: string
  symbol: string
  label: string
  condition: AlertCondition
  threshold: number
  createdAt: number
  createdBy: string
  /** Asetetaan kun hälytys on lauennut. Ei poisteta automaattisesti — käyttäjä kuittaa. */
  triggeredAt: number | null
}
