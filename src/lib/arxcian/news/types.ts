export type Category = 'maailma' | 'konfliktit' | 'bisnes' | 'sijoittaminen' | 'teknologia' | 'ai'

export const CATEGORIES: readonly Category[] = [
  'maailma',
  'konfliktit',
  'bisnes',
  'sijoittaminen',
  'teknologia',
  'ai',
]

export const CATEGORY_LABELS: Record<Category, string> = {
  maailma: 'Maailma',
  konfliktit: 'Konfliktit',
  bisnes: 'Bisnes',
  sijoittaminen: 'Sijoittaminen',
  teknologia: 'Teknologia',
  ai: 'AI',
}

/**
 * Kategorian rajaus mallille, kun se valitsee tärkeimmät uutiset.
 *
 * Pelkkä lähdevalinta ei riitä pitämään kategorioita erillään: sama
 * teknologiajuttu voi tulla ehdokkaaksi neljään kategoriaan, jolloin
 * tekoälyuutiset valtaavat myös Bisneksen ja Sijoittamisen. Tässä kerrotaan
 * mikä kuuluu mihinkin ja mikä on jonkun toisen kategorian asia.
 */
export const CATEGORY_FOCUS: Record<Category, string> = {
  maailma:
    'Maailmanlaajuisesti merkittävät tapahtumat: politiikka, yhteiskunta, onnettomuudet ja ihmiset. Talous ja teknologia käsitellään omissa kategorioissaan — valitse niistä vain se mikä on iso uutinen myös niistä riippumatta.',
  konfliktit:
    'Aseelliset konfliktit, sotarikokset, humanitaariset kriisit ja luonnonkatastrofit. Valitse tapahtumia ja käänteitä, älä taustoittavia esseitä tai vuosipäiväjuttuja.',
  bisnes:
    'Yritys- ja talousuutiset: tulokset, yritysjärjestelyt, kiinteistömarkkinat, varallisuus ja makrotalous. Teknologiayhtiöistä valitse vain se mikä on olennaista liiketoiminnan tai talouden kannalta — tuotelanseeraukset ja mallijulkaisut kuuluvat Teknologiaan ja tekoälyyn.',
  sijoittaminen:
    'Sijoittajan näkökulma: osakkeet, korot, markkinaliikkeet ja sijoitusstrategia. Ohita yleiset yritysuutiset joista sijoittaja ei saa mitään uutta.',
  teknologia:
    'Teknologiatuotteet, -yhtiöt, tietoturva ja tutkimus. Tekoälymallit ja niiden ympärillä käytävä keskustelu kuuluvat AI-kategoriaan — valitse tänne muu teknologia.',
  ai: 'Tekoäly: mallit, tutkimus, sääntely, käyttöönotto ja vaikutukset.',
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
