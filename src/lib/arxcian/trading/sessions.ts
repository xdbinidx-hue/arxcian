/**
 * Forex-istuntojen aukioloajat ja niiden tila juuri nyt.
 *
 * **Nämä ovat forex-istuntoja, eivät pörssien aukioloja.** Ero on iso eikä
 * kosmeettinen: New Yorkin forex-istunto alkaa 08.00 paikallista, mutta NYSE
 * avaa vasta 09.30. Watchlistilla on osakkeita, joten sekaannus olisi helppo —
 * siksi se sanotaan sekä täällä että käyttöliittymässä.
 *
 * Moduuli on tarkoituksella puhdas: ei välimuistia, ei verkkoa, ei `../cache`ia.
 * Aukioloajat ovat sääntöjä eivätkä dataa, joten tässä ei ole epäluotettavaa
 * lähdettä lainkaan — ja selainkomponentti voi importata tämän suoraan.
 *
 * Ajat on määritelty **paikallisena kellonaikana IANA-vyöhykkeessä**, ei
 * UTC-siirtymänä; miksi, ks. [zoneTime.ts](../zoneTime.ts) johon itse muunnos
 * on siirretty omien treidausaikojen tullessa mukaan.
 */

import { addDays, localDay, wallClockToInstant, weekday, type CalendarDay } from '../zoneTime'

export type SessionId = 'asia' | 'london' | 'new-york'

export type SessionDef = {
  id: SessionId
  label: string
  /** Mitä paikkaa aika edustaa. Näytetään käyttäjälle, koska "Aasia" ei ole kaupunki. */
  place: string
  zone: string
  /** Paikallinen avaus ja sulku minuutteina keskiyöstä. */
  openMinutes: number
  closeMinutes: number
}

const hm = (h: number, m = 0) => h * 60 + m

/**
 * Istunnot vakiintuneilla forex-ajoilla (Tokio/Lontoo/New York 9–18 ja 8–17
 * paikallista). Aasiaa edustaa Tokio: Sydney avaa aiemmin, mutta volyymi tulee
 * Tokiosta, ja kaksi aasialaista riviä kolmen istunnon näkymässä olisi
 * enemmän sekaannusta kuin tietoa.
 *
 * **Oletus: yksikään istunto ei ylitä keskiyötä.** Vuorokausiraja hoidettaisiin
 * eri tavalla, joten jos tähän joskus lisätään Sydney (22–07), `occurrences`
 * on kirjoitettava uusiksi eikä vain lisättävä riviä.
 */
export const SESSIONS: readonly SessionDef[] = [
  {
    id: 'asia',
    label: 'Aasia',
    place: 'Tokio',
    zone: 'Asia/Tokyo',
    openMinutes: hm(9),
    closeMinutes: hm(18),
  },
  {
    id: 'london',
    label: 'Lontoo',
    place: 'Lontoo',
    zone: 'Europe/London',
    openMinutes: hm(8),
    closeMinutes: hm(17),
  },
  {
    id: 'new-york',
    label: 'New York',
    place: 'New York',
    zone: 'America/New_York',
    openMinutes: hm(8),
    closeMinutes: hm(17),
  },
]

export function sessionById(id: SessionId): SessionDef | undefined {
  return SESSIONS.find(s => s.id === id)
}

export type SessionWindow = { open: number; close: number }

/**
 * Istunnon esiintymät ikkunassa eilisestä neljän päivän päähän.
 *
 * Neljä päivää eteenpäin on vähimmäismäärä joka riittää viikonlopun yli:
 * perjantai-illasta katsottuna seuraava avaus on vasta maanantaina. Eilinen on
 * mukana siksi, että Tokion istunto on Suomen aikaa aamuyöllä auki edellisen
 * paikallisen päivän puolella.
 */
export function sessionWindows(session: SessionDef, now: number): SessionWindow[] {
  const today: CalendarDay = localDay(session.zone, now)
  const result: SessionWindow[] = []

  for (let offset = -1; offset <= 4; offset++) {
    const day = addDays(today, offset)
    // Forex on kiinni viikonloppuisin. Viikonpäivä katsotaan istunnon omasta
    // paikallisesta päivästä, jolloin Tokion maanantaiaamu on maanantai vaikka
    // Suomessa ja New Yorkissa on vielä sunnuntai.
    const weekdayIndex = weekday(day)
    if (weekdayIndex === 0 || weekdayIndex === 6) continue

    result.push({
      open: wallClockToInstant(session.zone, day, session.openMinutes),
      close: wallClockToInstant(session.zone, day, session.closeMinutes),
    })
  }

  return result.sort((a, b) => a.open - b.open)
}

export type SessionState = {
  id: SessionId
  label: string
  place: string
  zone: string
  /** Auki juuri nyt. */
  open: boolean
  /** Seuraava tilanvaihdos: sulkeutuminen jos auki, avautuminen jos kiinni. */
  changesAt: number
  /** Tämänpäiväisen (tai seuraavan) istunnon avaus ja sulku näytettäväksi. */
  opensAt: number
  closesAt: number
}

/**
 * Kaikkien istuntojen tila annetulla hetkellä.
 *
 * Palauttaa aina kaikki kolme, myös kiinni olevat: "milloin Lontoo avautuu" on
 * yhtä lailla vastaus kuin "Lontoo on auki", ja rivin katoaminen näkymästä
 * olisi huonompi tapa kertoa se.
 */
export function sessionStates(now: number): SessionState[] {
  return SESSIONS.map(session => {
    const windows = sessionWindows(session, now)
    const current = windows.find(w => w.open <= now && now < w.close)
    const next = windows.find(w => w.open > now)

    // Varasuunnitelma on teoreettinen: neljän päivän ikkuna kattaa aina
    // viikonlopun, joten `next` on olemassa aina kun `current` ei ole.
    const active = current ?? next ?? windows[windows.length - 1]

    return {
      id: session.id,
      label: session.label,
      place: session.place,
      zone: session.zone,
      open: Boolean(current),
      changesAt: current ? current.close : active.open,
      opensAt: active.open,
      closesAt: active.close,
    }
  })
}

/**
 * Yhtä aikaa auki olevat istunnot.
 *
 * Päällekkäisyys on koko syy katsoa istuntoaikoja: Lontoo ja New York ovat auki
 * samaan aikaan noin 15–18 Suomen aikaa, ja siihen ikkunaan osuu suurin osa
 * vuorokauden volyymista. Yksittäisten avausaikojen listaaminen ilman tätä
 * jättäisi kertomatta sen mikä niistä seuraa.
 */
export function activeOverlap(states: SessionState[]): SessionState[] {
  const open = states.filter(s => s.open)
  return open.length >= 2 ? open : []
}
