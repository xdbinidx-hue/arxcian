import type { Owner } from '@/lib/session'

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

/**
 * Käyttäjän oma toistuva treidausaika, esim. "London killzone 10.00".
 *
 * Aika on paikallinen kellonaika `zone`ssa eikä UTC-hetki, koska treidausajat
 * seuraavat markkinaa: killzone on kello 8 New Yorkissa riippumatta siitä onko
 * siellä kesäaika. Sama malli kuin forex-istunnoilla, ks. sessions.ts.
 *
 * `owner` on mukana koska Albin ja Arbnor käyttävät samaa sovellusta eivätkä
 * samoja aikoja — ja 'shared' on silti mahdollinen, jos jokin aika koskee
 * molempia.
 */
export type TradingTime = {
  id: string
  owner: Owner
  label: string
  /** IANA-vyöhyke, esim. 'America/New_York'. */
  zone: string
  /** Paikallinen kellonaika minuutteina keskiyöstä. */
  minutes: number
  /** Viikonpäivät 1 = maanantai … 7 = sunnuntai. Tyhjä lista = ei koskaan. */
  days: number[]
  /** Kuinka monta minuuttia ennen aikaa ilmoitetaan. 0 = tasan silloin. */
  leadMinutes: number
  enabled: boolean
  createdAt: number
  createdBy: string
}

/**
 * Ilmoitusasetukset. Käyttäjäkohtaiset: sama laite voi olla molempien
 * käytössä, joten asetusta ei voi säilyttää selaimessa.
 *
 * Kolme kanavaa on erikseen, koska ne epäonnistuvat eri tavoin: selainilmoitus
 * vaatii luvan ja voi olla käyttöjärjestelmän estämä, ääni vaatii käyttäjän
 * eleen, banneri toimii aina. Yksi yhteinen kytkin piilottaisi sen että kaksi
 * kolmesta ei tullut perille.
 */
export type NotifySettings = {
  /** Selainilmoitus (Notification API, service workerin kautta). */
  push: boolean
  /** Sovelluksen sisäinen banneri. */
  banner: boolean
  /** Äänimerkki. */
  sound: boolean
  /** Ilmoita istunnon avautuessa. */
  sessionOpen: boolean
  /** Ilmoita istunnon sulkeutuessa. */
  sessionClose: boolean
  /** Mitkä istunnot ilmoitetaan. */
  sessions: string[]
  /** Kuinka monta minuuttia ennen istunnon vaihdosta ilmoitetaan. */
  leadMinutes: number
}

export const DEFAULT_NOTIFY_SETTINGS: NotifySettings = {
  push: true,
  banner: true,
  sound: true,
  sessionOpen: true,
  // Sulkeutuminen on oletuksena pois: avaus on se hetki jolloin pitää olla
  // koneella, sulku vain toteaa että ei enää tarvitse.
  sessionClose: false,
  sessions: ['asia', 'london', 'new-york'],
  leadMinutes: 5,
}
