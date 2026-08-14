/**
 * Muunnos paikallisen seinäkelloajan ja absoluuttisen hetken välillä
 * IANA-aikavyöhykkeessä.
 *
 * Erotettu `trading/sessions.ts`:stä kun omat treidausajat tulivat mukaan:
 * nekin määritellään paikallisena kellonaikana vyöhykkeessä, ja kaksi
 * rinnakkaista toteutusta ajautuisi erilleen juuri kesäajan
 * vaihtoviikonloppuna — eli silloin kun virhettä on vaikeinta huomata.
 *
 * **Miksi paikallinen kellonaika eikä kiinteä UTC-siirtymä.** Lontoo ja
 * New York siirtyvät kesäaikaan eri viikonloppuina eikä Tokio siirry
 * lainkaan, joten yksikin kovakoodattu siirtymä olisi väärässä useita
 * viikkoja vuodessa.
 *
 * Moduuli on puhdas: ei verkkoa, ei välimuistia, ei Node-riippuvuuksia.
 * Selainkomponentit importtaavat tämän suoraan.
 */

export type CalendarDay = { year: number; month: number; day: number }

// Muotoilijan luonti on kallista ja näitä kutsutaan silmukassa, joten ne
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
export function zoneOffset(zone: string, instant: number): number {
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
 * *UTC*-esitys on haluttu, joten siitä vähennetään vyöhykkeen siirtymä.
 * Siirtymä riippuu itse hetkestä, joten arvausta tarkennetaan kerran — toinen
 * kierros riittää myös kesäajan vaihtoviikonloppuna, jolloin ensimmäinen
 * arvaus voi osua väärälle puolelle siirtymää.
 *
 * Kesäaikaan siirryttäessä kello 03.00–04.00 paikallista ei ole olemassa;
 * tällainen aika kääntyy siirtymän jälkeiseksi hetkeksi eikä heitä virhettä.
 * Se on tarkoituksellista: hälytys on parempi antaa hieman siirtyneenä kuin
 * jättää antamatta kerran vuodessa.
 */
export function wallClockToInstant(zone: string, day: CalendarDay, minutes: number): number {
  const naive = Date.UTC(day.year, day.month - 1, day.day, 0, minutes)
  let instant = naive - zoneOffset(zone, naive)
  instant = naive - zoneOffset(zone, instant)
  return instant
}

/** Hetken paikallinen kalenteripäivä annetussa vyöhykkeessä. */
export function localDay(zone: string, instant: number): CalendarDay {
  const parts = partsFormatter(zone).formatToParts(new Date(instant))
  const value = (type: string) => Number(parts.find(p => p.type === type)?.value)
  return { year: value('year'), month: value('month'), day: value('day') }
}

export function addDays(day: CalendarDay, count: number): CalendarDay {
  const shifted = new Date(Date.UTC(day.year, day.month - 1, day.day + count))
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

/** 0 = sunnuntai. Puhdasta kalenterilaskentaa, ei vyöhykettä. */
export function weekday(day: CalendarDay): number {
  return new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay()
}

/**
 * 1 = maanantai … 7 = sunnuntai.
 *
 * Omat treidausajat tallentavat viikonpäivät tässä muodossa eikä `weekday`in
 * muodossa: käyttöliittymässä viikko alkaa maanantaista, ja jos tallennettu
 * arvo olisi 0-pohjainen, "ma–pe" olisi `[1,2,3,4,5]` yhdessä paikassa ja
 * `[1..5]` toisessa merkitsemässä eri päiviä.
 */
export function isoWeekday(day: CalendarDay): number {
  return weekday(day) === 0 ? 7 : weekday(day)
}
