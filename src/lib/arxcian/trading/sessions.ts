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
 * UTC-siirtymänä. Se on ainoa tapa saada kesäaika oikein: Lontoo ja New York
 * siirtyvät eri viikonloppuina, ja Tokio ei siirry lainkaan, joten kiinteä
 * UTC-taulukko olisi väärässä useita viikkoja vuodessa.
 */

export type SessionId = 'asia' | 'london' | 'new-york'

type SessionDef = {
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
const SESSIONS: readonly SessionDef[] = [
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

type CalendarDay = { year: number; month: number; day: number }

// Muotoilijoiden luonti on kallista ja näitä kutsutaan silmukassa, joten ne
// rakennetaan kerran vyöhykettä kohti.
const partsCache = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = partsCache.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      // h23 eikä hour12:false — jälkimmäinen tuottaa osassa ympäristöjä
      // keskiyöllä tunnin "24", joka rikkoisi laskennan hiljaa.
      hourCycle: 'h23',
    })
    partsCache.set(zone, formatter)
  }
  return formatter
}

/** Vyöhykkeen siirtymä UTC:stä millisekunteina annetulla hetkellä. */
function zoneOffset(zone: string, instant: number): number {
  // Sekunnin tarkkuuteen, koska formatToParts ei anna millisekunteja eikä
  // erotus muuten menisi tasan.
  const whole = Math.floor(instant / 1000) * 1000
  const parts = partsFormatter(zone).formatToParts(new Date(whole))
  const value = (type: string) => Number(parts.find(p => p.type === type)?.value)

  const asIfUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  )
  return asIfUtc - whole
}

/**
 * Paikallinen seinäkelloaika → absoluuttinen hetki.
 *
 * Käänteinen suunta ei ole suoraan saatavilla: `Date.UTC` antaa hetken jonka
 * *UTC*-esitys on haluttu, joten siitä vähennetään vyöhykkeen siirtymä. Siirtymä
 * riippuu itse hetkestä, joten arvausta tarkennetaan kerran — toinen kierros
 * riittää myös kesäajan vaihtoviikonloppuna, jolloin ensimmäinen arvaus voi
 * osua väärälle puolelle siirtymää.
 */
function wallClockToInstant(zone: string, day: CalendarDay, minutes: number): number {
  const naive = Date.UTC(day.year, day.month - 1, day.day, 0, minutes)
  let instant = naive - zoneOffset(zone, naive)
  instant = naive - zoneOffset(zone, instant)
  return instant
}

/** Hetken paikallinen kalenteripäivä annetussa vyöhykkeessä. */
function localDay(zone: string, instant: number): CalendarDay {
  const parts = partsFormatter(zone).formatToParts(new Date(instant))
  const value = (type: string) => Number(parts.find(p => p.type === type)?.value)
  return { year: value('year'), month: value('month'), day: value('day') }
}

function addDays(day: CalendarDay, count: number): CalendarDay {
  const shifted = new Date(Date.UTC(day.year, day.month - 1, day.day + count))
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

/** 0 = sunnuntai. Puhdasta kalenterilaskentaa, ei vyöhykettä. */
function weekday(day: CalendarDay): number {
  return new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay()
}

/**
 * Istunnon esiintymät ikkunassa eilisestä neljän päivän päähän.
 *
 * Neljä päivää eteenpäin on vähimmäismäärä joka riittää viikonlopun yli:
 * perjantai-illasta katsottuna seuraava avaus on vasta maanantaina. Eilinen on
 * mukana siksi, että Tokion istunto on Suomen aikaa aamuyöllä auki edellisen
 * paikallisen päivän puolella.
 */
function occurrences(session: SessionDef, now: number): { open: number; close: number }[] {
  const today = localDay(session.zone, now)
  const result: { open: number; close: number }[] = []

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
    const windows = occurrences(session, now)
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
