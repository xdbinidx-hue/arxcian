import { NextRequest, NextResponse } from 'next/server'
import { authorizeCron, jobsFor, JOBS } from '@/lib/arxcian/cron'

// Ulkoiset lähteet ja AI-valinta ovat hitaita: kategoria hakee viisi
// syötettä ja tekee niiden päälle yhden mallikutsun, ja kategorioita on
// kuusi. 280 s jättää marginaalia alustan 300 s -kattoon.
export const maxDuration = 280
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

  // Yksittäinen työ etsitään koko rekisteristä: soloOnly-työt eivät ole
  // jobsForin joukkoajossa mutta niitä pitää voida ajaa nimellä.
  const selected = jobId
    ? JOBS.filter(job => job.id === jobId)
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
