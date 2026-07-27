export type Category = 'bisnes' | 'ai' | 'sijoittaminen' | 'terveys' | 'teknologia' | 'historia'

export const CATEGORIES: readonly Category[] = [
  'bisnes',
  'ai',
  'sijoittaminen',
  'terveys',
  'teknologia',
  'historia',
]

export const CATEGORY_LABELS: Record<Category, string> = {
  bisnes: 'Bisnes',
  ai: 'AI',
  sijoittaminen: 'Sijoittaminen',
  terveys: 'Terveys',
  teknologia: 'Teknologia',
  historia: 'Historia',
}

export type FeedFormat = 'rss2' | 'atom'

export type Source = {
  id: string
  name: string
  url: string
  format: FeedFormat
  /** Erikseen merkitty lähde (esim. Mark Moss) näkyy kategorian sisällä omalla tägillään. */
  kind?: 'video'
}

/** Yksi syötteestä luettu raakauutinen, ennen AI-tiivistelmää. */
export type RawItem = {
  sourceId: string
  sourceName: string
  title: string
  link: string
  /** Feedin oma kuvaus/teksti, käytetään tiivistelmän pohjana */
  description: string
  publishedAt: number | null
}

/** Valmis, tiivistetty ja tägitetty artikkeli sellaisena kuin se näytetään käyttäjälle. */
export type Article = {
  /** Alkuperäinen linkki toimii uniikkina avaimena */
  id: string
  category: Category
  sourceId: string
  sourceName: string
  title: string
  link: string
  summary: string
  tags: string[]
  publishedAt: number | null
  summarizedAt: number
  kind: 'article' | 'video'
}
