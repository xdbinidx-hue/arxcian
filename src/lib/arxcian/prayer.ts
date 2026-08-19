import { fetchAndCache } from './cache'
import { DEFAULT_LOCATION } from './weather'
import { todayISOHelsinki } from './time'
import { PRAYERS, addDays, type PrayerDay, type PrayerKey } from './prayerLogic'

/**
 * Islamilaiset rukousajat Helsingin aikaan hubin etusivulle.
 *
 * Lähde on Aladhanin julkinen API (api.aladhan.com) — ei API-avainta eikä
 * kiintiötä, sama periaate kuin YouTuben RSS-syötteillä. Aikoja ei lasketa
 * itse: laskenta vaatisi auringon deklinaation ja tuntikulman kullekin
 * hetkelle sekä korkean leveysasteen erityissäännöt, eli käytännössä oman
 * kirjaston. Rajapinta hoitaa saman ilman uutta riippuvuutta.
 *
 * Rukouslista, tyypit ja "mikä on seuraava" ovat prayerLogic.ts:ssä, jotta ne
 * ovat testattavissa ilman verkkoa. Ne viedään täältä eteenpäin, joten
 * kutsujien ei tarvitse tietää jaosta.
 */

export {
  PRAYERS,
  nextPrayer,
  type PrayerKey,
  type PrayerDay,
  type NextPrayer,
} from './prayerLogic'

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

export async function getPrayerTimes(force = false) {
  // force on cronia varten: TTL on 6 h mutta cron ajaa 4 h välein, joten
  // ilman lippua osa ajoista palauttaisi tuoreen välimuistin tekemättä hakua
  // ja raportoisi silti onnistuneensa (ks. CLAUDE.md, hub-channels).
  return fetchAndCache({ key: PRAYER_CACHE_KEY, ttl: TTL_SECONDS, force }, fetchPrayerDays)
}
