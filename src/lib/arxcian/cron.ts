import { currentUser } from '@/lib/session'
import { CATEGORIES } from './news/types'
import { refreshCategory, cacheKeyFor } from './news/fetchNews'
import { getSentiment } from './trading/sentiment'
import { getIctVideos } from './trading/ict'
import { refreshQuotes } from './trading/quotes'
import { checkAlerts } from './trading/alerts'

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
    id: 'trading-quotes',
    description: 'Trading: watchlist-kurssit',
    run: async () => {
      const data = await refreshQuotes()
      await checkAlerts(data.quotes)
      return { key: 'trading:quotes', items: Object.keys(data.quotes).length }
    },
  },
]

/** Rekisteri: uusi ajastettu työ lisätään tähän, cron-reittiä ei tarvitse muuttaa. */
export const JOBS: readonly CronJob[] = [...newsJobs, ...tradingJobs]

export function jobsFor(schedule: string | null): readonly CronJob[] {
  if (!schedule) return JOBS
  return JOBS.filter(job => !job.schedules || job.schedules.includes(schedule))
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
  if (user && user !== 'guest') return { ok: true, via: 'user' }

  return { ok: false }
}
