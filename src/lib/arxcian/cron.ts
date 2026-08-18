import { currentUser } from '@/lib/session'
import { CATEGORIES } from './news/types'
import { refreshCategory, cacheKeyFor } from './news/fetchNews'
import { getSentiment } from './trading/sentiment'
import { getIctVideos } from './trading/ict'
import { refreshQuotes } from './trading/quotes'
import { checkAlerts } from './trading/alerts'
import { refreshCalendar } from './trading/calendar'
import { planAllUsers } from './push/schedule'
import { getCityWeather, CITIES_CACHE_KEY } from './weather'
import { getChannelVideos, CHANNELS_CACHE_KEY } from './channels'
import { refreshRjMobSummaries, RJMOB_SUMMARY_KEY } from './rjmobSummary'
import { refreshRjMobInsights, RJMOB_INSIGHTS_KEY } from './rjmobInsights'
import { importWinposReports } from '@/lib/winpos/kassamyynti'

/**
 * Ajastettujen hakujen rekisteri.
 *
 * Vaiheet 1–3 lisäävät tähän omat työnsä. Cron-reitti ajaa ne eikä
 * sitä tarvitse muuttaa uusia lähteitä lisätessä.
 */

export type JobResult = {
  /** Välimuistiavain jota työ päivitti */
  key: string
  /** Montako tietuetta haettiin, jos työ tuottaa listan */
  items?: number
}

export type CronJob = {
  id: string
  description: string
  /** Mihin ajoihin työ kuuluu. Tyhjä = kaikkiin. */
  schedules?: string[]
  /**
   * Työ ei kuulu joukkoajoon vaan käynnistetään aina yksin (`?job=<id>`).
   *
   * Cron-reitti ajaa työt `Promise.all`illa eli rinnakkain. Elävään
   * taulukkoon kirjoittava työ ei saa olla käynnissä samaan aikaan kuin
   * samaa taulukkoa lukevat työt: Winpos-tuonti tekee `values.clear`in ja
   * `values.update`n kahtena kutsuna, joten alue on hetken tyhjä ja
   * rinnakkainen lukija välimuistittaisi nollat.
   */
  soloOnly?: boolean
  run: () => Promise<JobResult>
}

const newsJobs: CronJob[] = CATEGORIES.map(category => ({
  id: `news-${category}`,
  description: `Uutiset: ${category}`,
  run: async () => {
    const result = await refreshCategory(category)
    return { key: cacheKeyFor(category), items: result.total }
  },
}))

const tradingJobs: CronJob[] = [
  {
    id: 'trading-sentiment',
    description: 'Trading: sentimenttimittari',
    run: async () => {
      await getSentiment()
      return { key: 'trading:sentiment' }
    },
  },
  {
    id: 'trading-ict',
    description: 'Trading: ICT-videot',
    run: async () => {
      const result = await getIctVideos()
      return { key: 'trading:ict-videos', items: result.data.length }
    },
  },
  {
    id: 'trading-calendar',
    description: 'Trading: talouskalenteri (ForexFactory) ja push-ilmoitusten suunnittelu',
    run: async () => {
      const events = await refreshCalendar()

      // Suunnittelu ajetaan tässä eikä omana työnään, koska cron-reitti ajaa
      // työt rinnakkain (Promise.all): erillinen työ voisi ajautua ennen
      // kalenterin päivitystä. ForexFactoryn syöte kattaa vain kuluvan viikon,
      // joten järjestys on olennainen — perjantaina ajettu suunnittelija ei
      // näe maanantain julkaisuja ennen kuin syöte on vaihtunut.
      //
      // Suunnittelu ei saa kaataa kalenterityötä: kalenteri on haettu ja
      // välimuistissa siinä vaiheessa, ja seuraava ajo yrittää suunnittelun
      // uudelleen.
      try {
        await planAllUsers()
      } catch (error) {
        console.error('[cron] push-suunnittelu epäonnistui', error)
      }

      return { key: 'trading:calendar', items: events.length }
    },
  },
  {
    id: 'trading-quotes',
    description: 'Trading: watchlist-kurssit',
    run: async () => {
      const data = await refreshQuotes()
      await checkAlerts(data.quotes)
      return { key: 'trading:quotes', items: Object.keys(data.quotes).length }
    },
  },
]

const globeJobs: CronJob[] = [
  {
    id: 'globe-weather',
    description: 'Maapallo: kaupunkien sää',
    run: async () => {
      const result = await getCityWeather()
      return { key: CITIES_CACHE_KEY, items: result.data.length }
    },
  },
]

const hubJobs: CronJob[] = [
  {
    id: 'hub-channels',
    description: 'Hub: seurattujen YouTube-kanavien tuoreimmat',
    run: async () => {
      const result = await getChannelVideos()
      return { key: CHANNELS_CACHE_KEY, items: result.data.length }
    },
  },
  {
    id: 'rjmob-summary',
    description: 'Hub: RJ-Mobin kuukausiyhteenveto (kuluva kuu + valmiit kuukaudet)',
    run: async () => {
      // items = montako kuukautta on välimuistissa, ei montako laskettiin:
      // valmis kuukausi lasketaan kerran ja ohitetaan sen jälkeen.
      const result = await refreshRjMobSummaries()
      return { key: RJMOB_SUMMARY_KEY, items: result.months.length }
    },
  },
]

const rjmobJobs: CronJob[] = [
  {
    id: 'rjmob-insights',
    description: 'RJ-Mob: tilanneyhteenveto ja poikkeamat',
    run: async () => {
      const result = await refreshRjMobInsights()
      return { key: RJMOB_INSIGHTS_KEY, items: result.data.huomiot.length }
    },
  },
  {
    id: 'winpos-import',
    description: 'RJ-Mob: Winpos-raporttien tuonti Kassamyynti-välilehdelle',
    // Yksin ajettava, ks. soloOnly. Workflow kutsuu tätä omana vaiheenaan
    // ennen joukkoajoa, jotta saman ajon rjmob-summary ja rjmob-insights
    // lukevat jo tuodut kassaluvut eivätkä edellisen kierroksen lukuja.
    soloOnly: true,
    run: async () => {
      const tulos = await importWinposReports()
      // items = montako raporttia tuotiin. Jo käsitellyt ohitetaan, joten
      // tavallinen ajo palauttaa nollan eikä kirjoita taulukkoon lainkaan.
      return { key: 'winpos:tuonti', items: tulos.tuodut.length }
    },
  },
]

/** Rekisteri: uusi ajastettu työ lisätään tähän, cron-reittiä ei tarvitse muuttaa. */
export const JOBS: readonly CronJob[] = [...newsJobs, ...tradingJobs, ...globeJobs, ...hubJobs, ...rjmobJobs]

/**
 * Joukkoajon työt. `soloOnly`-työt jäävät aina ulkopuolelle — ne ajetaan
 * yksin `?job=<id>`illä, ks. CronJob.soloOnly.
 */
export function jobsFor(schedule: string | null): readonly CronJob[] {
  const joukko = JOBS.filter(job => !job.soloOnly)
  if (!schedule) return joukko
  return joukko.filter(job => !job.schedules || job.schedules.includes(schedule))
}

/**
 * Cron-reitin pääsynhallinta.
 *
 * Vercel Cron lähettää CRON_SECRETin Authorization-otsakkeessa. Sallitaan
 * myös kirjautunut käyttäjä, jotta haun voi käynnistää käsin testatessa.
 */
export async function authorizeCron(req: Request): Promise<{ ok: true; via: 'cron' | 'user' } | { ok: false }> {
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('authorization')

  if (secret && header === `Bearer ${secret}`) return { ok: true, via: 'cron' }

  const user = await currentUser()
  if (user) return { ok: true, via: 'user' }

  return { ok: false }
}
