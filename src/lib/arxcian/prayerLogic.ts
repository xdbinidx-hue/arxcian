// Rukousaikojen puhdas logiikka: tyypit, rukouslista ja "mikä on seuraava".
//
// ⚠️ Tässä tiedostossa EI SAA OLLA ajonaikaisia importteja (`import type` on
// ok, se katoaa käännöksessä). Syy on sama kuin shiftSchedule.ts:ssä: testit
// ajetaan `node --test`illä suoraan TypeScriptiä vastaan, eikä Noden
// ESM-resolveri osaa extensiotonta `./polku`-muotoa jota Next taas vaatii.
// Siksi myös kellonajan jäsennys on täällä omana apurinaan eikä lainattuna
// time.ts:stä — hinta itsenäisyydestä, sama kauppa jonka rjmob.ts ja
// cronAccess.ts tekevät.
//
// Haku, välimuisti ja Aladhan-rajapinta ovat prayer.ts:ssä, joka
// uudelleenvie nämä eteenpäin.

/**
 * Viisi rukousta. Shuruq (auringonnousu) ei ole rukous vaan Fajrin ajan
 * päätepiste, ja se näkyy jo aurinkopaneelissa — siksi sitä ei toisteta
 * tässä listassa.
 */
export const PRAYERS = [
  { key: 'Fajr', label: 'Fajr', gloss: 'aamu' },
  { key: 'Dhuhr', label: 'Dhuhr', gloss: 'keskipäivä' },
  { key: 'Asr', label: 'Asr', gloss: 'iltapäivä' },
  { key: 'Maghrib', label: 'Maghrib', gloss: 'auringonlasku' },
  { key: 'Isha', label: 'Isha', gloss: 'ilta' },
] as const

export type PrayerKey = (typeof PRAYERS)[number]['key']

export type PrayerDay = {
  /** YYYY-MM-DD Helsingin aikaa */
  date: string
  /** Kellonajat muodossa HH:MM, Helsingin aikaa */
  timings: Record<PrayerKey, string>
  /** Hijri-päiväys näytettäväksi, esim. "28 Safar 1448" */
  hijri: string
}

export type NextPrayer = { key: PrayerKey; time: string; tomorrow: boolean }

/** "05:26" → minuutteja keskiyöstä. null jos muoto ei kelpaa. */
function kelloMinuutteina(clock: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(clock)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

/**
 * Päivä eteenpäin ISO-päiväyksestä.
 *
 * Laskenta tehdään UTC-keskiyöstä eikä nykyhetkeen lisätyistä 24 tunnista:
 * kesäajan vaihtopäivinä vuorokausi on 23 tai 25 tuntia, jolloin lisäys
 * osuisi joko samaan tai ylihuomiseen päivään.
 */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/**
 * Seuraava rukous annetusta hetkestä. Palauttaa huomisen Fajrin kun päivän
 * kaikki rukoukset ovat menneet, ja null jos kumpaakaan päivää ei löydy
 * datasta.
 *
 * Isha voi olla pienin luvuista, ei suurin. Korkean leveysasteen sääntö,
 * jota Helsingissä on pakko käyttää, vie Ishan kesällä keskiyön yli:
 * 21.6.2026 Maghrib 22:50 mutta Isha 00:16 eli seuraavan vuorokauden
 * puolella. Suora `minutes > nowMinutes` -vertailu ei löydä sitä lainkaan,
 * jolloin paneeli väitti klo 23 että päivän rukoukset ovat ohi — noin
 * 25.5.–28.7. eli kahtena kuukautena vuodesta. Järjestykseen lajittelu ei
 * korjaa tätä, koska Ishan arvo 16 on aidosti pienempi kuin Fajrin 143.
 */
export function nextPrayer(days: PrayerDay[], today: string, nowMinutes: number): NextPrayer | null {
  const day = days.find(d => d.date === today)
  if (!day) return null

  const maghrib = kelloMinuutteina(day.timings.Maghrib)
  const isha = kelloMinuutteina(day.timings.Isha)
  const ishaYliKeskiyon = maghrib !== null && isha !== null && isha < maghrib

  // Aamuyö ennen keskiyön yli mennyttä Ishaa. Kyseessä on tarkkaan ottaen
  // eilisen rivin Isha, mutta tämän päivän rivi kelpaa: kesäkuussa ajat
  // siirtyvät alle minuutin vuorokaudessa, ja vaihtoehtona olisi kolmas
  // hakukutsu pelkästään tätä kuudentoista minuutin ikkunaa varten.
  if (ishaYliKeskiyon && isha !== null && nowMinutes < isha) {
    return { key: 'Isha', time: day.timings.Isha, tomorrow: false }
  }

  for (const prayer of PRAYERS) {
    // Keskiyön yli mennyt Isha on vuorokauden viimeinen eikä ensimmäinen,
    // joten sitä ei saa poimia tästä silmukasta aamun rukousten tilalle.
    if (prayer.key === 'Isha' && ishaYliKeskiyon) continue
    const minutes = kelloMinuutteina(day.timings[prayer.key])
    if (minutes !== null && minutes > nowMinutes) {
      return { key: prayer.key, time: day.timings[prayer.key], tomorrow: false }
    }
  }

  // Maghribin jälkeen illalla: Isha on yhä edessä, vaikka sen kellonaika on
  // pienempi kuin nykyhetken.
  if (ishaYliKeskiyon) {
    return { key: 'Isha', time: day.timings.Isha, tomorrow: false }
  }

  const next = days.find(d => d.date === addDays(today, 1))
  if (!next) return null
  // Rikkinäinen vastaus jäsentyy viivaksi; "huomenna Fajr —" ei kerro mitään.
  if (next.timings.Fajr === '—') return null
  return { key: 'Fajr', time: next.timings.Fajr, tomorrow: true }
}
