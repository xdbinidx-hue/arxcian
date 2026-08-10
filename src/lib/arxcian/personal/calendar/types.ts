/** Lähteestä riippumaton tapahtuma. Google Calendar on nyt ainoa lähde,
 *  mutta näkymät eivät tiedä siitä mitään. */
export type CalendarEvent = {
  /** Uniikki koko yhdistetyssä listassa: `${accountId}:${Googlen id}`.
   *  Pelkkä Googlen id ei riitä — sama kokous kahdessa tilissä saa Googlelta
   *  saman id:n, jolloin Reactin key-avaimet törmäisivät. */
  id: string
  title: string
  /** Unix ms */
  start: number
  end: number
  allDay: boolean
  location: string | null
  /** Kalenterin nimi jos tapahtuma tulee muusta kuin oletuskalenterista */
  calendarName: string | null
  htmlLink: string | null
  /** Lähdetili, CalendarAccount.id */
  accountId: string
  /** Lähdetilin osoite rusetiksi näkymiin. Leimataan yhdistämishetkellä. */
  accountEmail: string | null
  /** Väri-indeksi. Leimataan yhdistämishetkellä, ei haussa, jotta tilin
   *  värin vaihto näkyy heti eikä vasta välimuistin vanhennuttua. */
  accountColorIndex: number
}

/** Välimuotoon tallennettava tapahtuma. Tilikohtaiset näyttökentät
 *  leimataan vasta luettaessa, joten niitä ei kirjoiteta välimuistiin. */
export type StoredEvent = Omit<CalendarEvent, 'accountEmail' | 'accountColorIndex'>

/** Liitetty Google-tili. EI koskaan sisällä tokeneita — tämä tyyppi
 *  serialisoidaan selaimeen asti. */
export type CalendarAccount = {
  /** Vakaa tunniste: Googlen id_tokenin `sub`, tai 'legacy' migratoidulla
   *  tilillä. Sähköposti ei kelpaa tunnisteeksi, koska Workspace-osoite voi
   *  vaihtua ja tili katoaisi. Esiintyy Redis-avaimissa ja disconnectissa. */
  id: string
  /** Näytettävä osoite. null vain migratoidulla tilillä ennen ensimmäistä
   *  onnistunutta hakua. */
  email: string | null
  /** Käyttäjän antama nimi, esim. "Työ". null = näytetään email. */
  label: string | null
  /** Unix ms */
  addedAt: number
  /** 'v1' = siirretty vanhasta yhden tilin mallista. */
  migratedFrom?: 'v1'
}

/** ok = tapahtumat mukana (voi olla vanhentunutta dataa)
 *  reauth = lupa peruttu tai vanhentunut, tokenit poistettu, liitettävä uudelleen
 *  error = ohimenevä virhe, tokenit säästetty */
export type CalendarAccountState = 'ok' | 'reauth' | 'error'

export type CalendarAccountStatus = CalendarAccount & {
  /** Väri-indeksi = tilin järjestysnumero listassa. Johdetaan luettaessa,
   *  ei tallenneta, jotta paletti pysyy järjestyksen mukaisena. */
  colorIndex: number
  state: CalendarAccountState
  /** Unix ms jolloin tämän tilin tapahtumat haettiin. null jos haku ei ole
   *  onnistunut kertaakaan. */
  fetchedAt: number | null
  /** true kun data tulee stale-ikkunasta eikä tuoreesta hausta */
  stale: boolean
  /** Virheen syy kun state === 'error' */
  message: string | null
  /** Montako tapahtumaa tästä tilistä on yhdistetyssä listassa */
  eventCount: number
}

export type CalendarStatus =
  | { state: 'not-configured' }
  | { state: 'disconnected'; accounts: CalendarAccountStatus[] }
  | { state: 'connected'; events: CalendarEvent[]; fetchedAt: number; accounts: CalendarAccountStatus[] }
  | { state: 'error'; message: string }

/** Jaettu vakio, jotta 'disconnected' rakennetaan yhdellä tavalla. */
export const CALENDAR_DISCONNECTED: CalendarStatus = { state: 'disconnected', accounts: [] }

/**
 * Tilikohtaiset värit .arxcian-rootin muuttujina (globals.css): sininen,
 * keltainen, vihreä, violetti. Väri johdetaan tilin järjestysnumerosta
 * listassa, ei sähköpostista — paletti kiertää jos tilejä on enemmän kuin
 * värejä.
 */
export const CALENDAR_ACCOUNT_COLORS = ['--ax-cal-1', '--ax-cal-2', '--ax-cal-3', '--ax-cal-4'] as const

export function accountColorVar(colorIndex: number): string {
  return CALENDAR_ACCOUNT_COLORS[colorIndex % CALENDAR_ACCOUNT_COLORS.length]
}

/** Väri aksenttina: reunapalkki, piste ja chipin kehys. Ei taustan täyttö,
 *  jotta teksti pysyy luettavana tummalla pinnalla. */
export function accountAccent(colorIndex: number) {
  const v = accountColorVar(colorIndex)
  return {
    solid: `rgb(var(${v}))`,
    soft: `rgb(var(${v}) / 0.15)`,
    line: `rgb(var(${v}) / 0.45)`,
  }
}

/** Tilin näyttönimi: käyttäjän antama nimi, sähköposti, tai migratoidun
 *  tilin väliaikainen teksti ennen kuin osoite on selvinnyt. */
export function accountLabel(account: CalendarAccount): string {
  return account.label ?? account.email ?? 'Google-tili'
}

export type CalendarView = 'agenda' | 'paiva' | 'viikko' | 'kuukausi' | 'vuosi'

export const CALENDAR_VIEWS: readonly CalendarView[] = ['agenda', 'paiva', 'viikko', 'kuukausi', 'vuosi']

export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = {
  agenda: 'Agenda',
  paiva: 'Päivä',
  viikko: 'Viikko',
  kuukausi: 'Kuukausi',
  vuosi: 'Vuosi',
}
