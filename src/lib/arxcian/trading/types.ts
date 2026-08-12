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

/**
 * ForexFactoryn vaikutusluokka sellaisenaan. Käyttöliittymän "punainen"
 * tarkoittaa `High`ia — nimeä ei käännetä värilliseksi tietomallissa asti,
 * koska lähde voi lisätä luokkia eikä väri ole sen käsite.
 */
export type CalendarImpact = 'High' | 'Medium' | 'Low' | 'Holiday'

export type CalendarEvent = {
  /** Tapahtuman nimi, esim. "Core CPI m/m" */
  title: string
  /** Valuuttakoodi (USD, EUR…). Lähteen kenttä on `country`, mutta arvo on valuutta. */
  currency: string
  /** Unix ms. Lähteen aikaleimassa on vyöhykesiirtymä, joten tämä on absoluuttinen hetki. */
  time: number
  impact: CalendarImpact
  /** Ennuste ja edellinen sellaisenaan ("0.2%", "2.50T"). Tyhjä jos lähde ei anna. */
  forecast: string
  previous: string
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
