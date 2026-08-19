import type { Owner } from '@/lib/session'

/**
 * Uuden sisällön seurannan tyypit.
 *
 * "Seuraa lähdelistaa ja tee jotain uusille" on sama tarve kolmessa osiossa,
 * ja `lista`-kenttä on juuri se mikä tekee tästä yhden mekanismin eikä
 * kolmea. Osiot käyttävät tätä, eivät toteuta omaansa.
 */

export type WatchList = 'trading' | 'personal' | 'uutiset'

export type WatchType = 'youtube' | 'rss'

/**
 * Mitä uudelle sisällölle tehdään.
 *
 * **Uutuus ja ilmoitus ovat eri asioita.** `watch` kertoo mikä on uutta;
 * tämä kertoo mitä sille tehdään. ICT-videot pidetään vain tuoreina,
 * self-growth-kanavat ilmoitetaan, uutiset tiivistetään.
 */
export type WatchAction = 'tiivista' | 'ilmoita' | 'ei mitään'

export type WatchSource = {
  lista: WatchList
  nimi: string
  tyyppi: WatchType
  /** YouTube-kanavan ID tai syötteen URL */
  tunniste: string
  toiminto: WatchAction
  /**
   * Kentän nimi on `owner` eikä `omistaja`, jotta `visibleTo()` ja `canView()`
   * kelpaavat sellaisenaan — CLAUDE.md: jokainen henkilökohtainen tietue saa
   * `owner`-kentän. Taulukon sarakeotsikko on silti `omistaja`.
   */
  owner: Owner
  aktiivinen: boolean
}

/** Yksi löydetty sisältö, normalisoituna lähteen tyypistä riippumatta. */
export type WatchItem = {
  /** Pysyvä tunniste: YouTuben videoId tai artikkelin linkki. */
  id: string
  lista: WatchList
  /** Lähteen näyttönimi, ei syötteen oma julkaisijakenttä. */
  source: string
  title: string
  link: string
  publishedAt: number | null
  owner: Owner
}

/** Inboxiin tallennettu rivi. `addedAt` on löytöhetki, ei julkaisuhetki. */
export type InboxEntry = WatchItem & { addedAt: number }

export type WatchResult = {
  lista: WatchList
  /** Montako lähdettä saatiin haettua */
  ok: number
  /** Lähteiden nimet jotka kaatuivat */
  failed: string[]
  /** Montako sisältöä oli aidosti uutta */
  uusia: number
  /** Montako niistä päätyi inboxiin (toiminto = ilmoita) */
  inboxiin: number
  /**
   * Mistä lähdelista tuli.
   *
   * `fallback` = taulukkoa ei ole konfiguroitu, mikä on kelvollinen tila.
   * `fallback-virhe` = taulukko on olemassa mutta rikki. Ne **eivät saa
   * näyttää samalta**: jälkimmäinen vaatii korjausta, ja pelkkä lokirivi
   * jäisi huomaamatta.
   */
  sourcesFrom: 'network' | 'cache' | 'stale' | 'fallback' | 'fallback-virhe'
}
