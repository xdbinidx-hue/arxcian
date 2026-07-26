import { NextRequest, NextResponse } from 'next/server'
import { authorizeCron, jobsFor } from '@/lib/arxcian/cron'

// Ulkoiset lähteet ovat hitaita, joten oletusaikaraja ei riitä.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * Ajaa ajastetut haut. Vercel Cron kutsuu tätä, ja kirjautunut käyttäjä
 * voi käynnistää haun käsin testatakseen.
 *
 * ?schedule=08 rajaa työt tiettyyn ajoon, ?job=<id> yksittäiseen työhön.
 */
export async function GET(req: NextRequest) {
  const auth = await authorizeCron(req)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Ei oikeutta' }, { status: 401 })
  }

  const schedule = req.nextUrl.searchParams.get('schedule')
  const jobId = req.nextUrl.searchParams.get('job')

  const selected = jobId
    ? jobsFor(null).filter(job => job.id === jobId)
    : jobsFor(schedule)

  if (jobId && selected.length === 0) {
    return NextResponse.json({ error: `Tuntematon työ: ${jobId}` }, { status: 404 })
  }

  const started = Date.now()

  // Yksi kaatuva lähde ei saa estää muita töitä.
  const results = await Promise.all(
    selected.map(async job => {
      const jobStarted = Date.now()
      try {
        const result = await job.run()
        return { id: job.id, ok: true as const, ...result, ms: Date.now() - jobStarted }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[cron] työ epäonnistui: ${job.id}`, error)
        return { id: job.id, ok: false as const, error: message, ms: Date.now() - jobStarted }
      }
    }),
  )

  const failed = results.filter(r => !r.ok).length

  return NextResponse.json({
    ok: failed === 0,
    via: auth.via,
    schedule: schedule ?? 'kaikki',
    jobs: results.length,
    failed,
    ms: Date.now() - started,
    results,
  })
}
