import { fetchAndCache } from './cache'
import { DEFAULT_LOCATION } from './weather'
import { todayISOHelsinki, clockToMinutes } from './time'

/**
 * Islamilaiset rukousajat Helsingin aikaan hubin etusivulle.
 *
 * Lähde on Aladhanin julkinen API (api.aladhan.com) — ei API-avainta eikä
 * kiintiötä, sama periaate kuin YouTuben RSS-syötteillä. Aikoja ei lasketa
 * itse: laskenta vaatisi auringon deklinaation ja tuntikulman kullekin
 * hetkelle sekä korkean leveysasteen erityissäännöt, eli käytännössä oman
 * kirjaston. Rajapinta hoitaa saman ilman uutta riippuvuutta.
 */

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

export const PRAYER_CACHE_KEY = 'hub:prayer-times'

/**
 * Kuusi tuntia. Ajat eivät muutu päivän sisällä, joten haun tarkoitus on vain
 * varmistaa että välimuistissa on tämä päivä — ei tuoreus sinänsä.
 */
const TTL_SECONDS = 6 * 60 * 60

/**
 * Muslim World League (Fajr 18°, Isha 17°) ja kulmapohjainen korkean
 * leveysasteen sääntö.
 *
 * Korkeussääntö ei ole valinnainen Helsingissä: 60,2 °N:ssä aurinko ei
 * touko–heinäkuussa laske lainkaan 18 asteen taakse horisontin alle, jolloin
 * Fajrilla ja Ishalla ei ole laskennallista hetkeä. Ilman sääntöä rajapinta
 * palauttaisi niille arvon joka ei vastaa mitään todellista auringon asemaa.
 * Angle Based jakaa yön kulmien suhteessa, mikä on Pohjoismaissa vakiintunein
 * tapa. Menetelmän vaihto muuttaa näytettyjä aikoja — älä vaihda ilman pyyntöä.
 */
const METHOD = 3
const LATITUDE_ADJUSTMENT = 3

type AladhanResponse = {
  code: number
  data?: {
    timings?: Record<string, string>
    date?: {
      hijri?: {
        day?: string
        month?: { en?: string }
        year?: string
      }
    }
  }
}

/**
 * "03:14 (EEST)" → "03:14".
 *
 * Aladhan liittää vyöhykkeen sulkeisiin osassa vastauksista, joten kellonaika
 * poimitaan säännöllisellä lausekkeella eikä merkkijonon alusta.
 */
function hhmm(raw: string | undefined): string {
  const match = /(\d{1,2}):(\d{2})/.exec(raw ?? '')
  if (!match) return '—'
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

/**
 * Päivä eteenpäin ISO-päiväyksestä.
 *
 * Laskenta tehdään UTC-keskiyöstä eikä nykyhetkeen lisätyistä 24 tunnista:
 * kesäajan vaihtopäivinä vuorokausi on 23 tai 25 tuntia, jolloin lisäys
 * osuisi joko samaan tai ylihuomiseen päivään.
 */
function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

async function fetchDay(isoDate: string): Promise<PrayerDay> {
  const { lat, lon } = DEFAULT_LOCATION
  const [y, m, d] = isoDate.split('-')
  const url =
    `https://api.aladhan.com/v1/timings/${d}-${m}-${y}` +
    `?latitude=${lat}&longitude=${lon}&method=${METHOD}` +
    `&latitudeAdjustmentMethod=${LATITUDE_ADJUSTMENT}&timezonestring=Europe%2FHelsinki`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Aladhan: HTTP ${res.status}`)

  const body = (await res.json()) as AladhanResponse
  if (body.code !== 200 || !body.data?.timings) {
    throw new Error(`Aladhan: odottamaton vastaus (code ${body.code})`)
  }

  const timings = body.data.timings
  const hijri = body.data.date?.hijri

  return {
    date: isoDate,
    timings: {
      Fajr: hhmm(timings.Fajr),
      Dhuhr: hhmm(timings.Dhuhr),
      Asr: hhmm(timings.Asr),
      Maghrib: hhmm(timings.Maghrib),
      Isha: hhmm(timings.Isha),
    },
    hijri: [hijri?.day, hijri?.month?.en, hijri?.year].filter(Boolean).join(' '),
  }
}

/**
 * Tämä päivä ja huominen.
 *
 * Huominen haetaan kahdesta syystä: Ishan jälkeen "seuraava rukous" on
 * huomisen Fajr, ja vuorokauden vaihtuessa vanhentunut välimuisti sisältää
 * silti kuluvan päivän — jolloin lähteen ollessa alhaalla näytetään oikeat
 * ajat eikä eilisiä.
 */
async function fetchPrayerDays(): Promise<PrayerDay[]> {
  const today = todayISOHelsinki()
  return Promise.all([fetchDay(today), fetchDay(addDays(today, 1))])
}

export async function getPrayerTimes() {
  return fetchAndCache({ key: PRAYER_CACHE_KEY, ttl: TTL_SECONDS }, fetchPrayerDays)
}

export type NextPrayer = { key: PrayerKey; time: string; tomorrow: boolean }

/**
 * Seuraava rukous annetusta hetkestä. Palauttaa huomisen Fajrin kun päivän
 * kaikki rukoukset ovat menneet, ja null jos kumpaakaan päivää ei löydy
 * datasta.
 */
export function nextPrayer(days: PrayerDay[], today: string, nowMinutes: number): NextPrayer | null {
  const day = days.find(d => d.date === today)
  if (!day) return null

  for (const prayer of PRAYERS) {
    const minutes = clockToMinutes(day.timings[prayer.key])
    if (minutes !== null && minutes > nowMinutes) {
      return { key: prayer.key, time: day.timings[prayer.key], tomorrow: false }
    }
  }

  const next = days.find(d => d.date === addDays(today, 1))
  if (!next) return null
  return { key: 'Fajr', time: next.timings.Fajr, tomorrow: true }
}
