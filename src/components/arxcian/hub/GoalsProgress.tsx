import Link from 'next/link'
import { currentUser } from '@/lib/session'
import { getGoals } from '@/lib/arxcian/personal/goals'
import { GOAL_AREAS, GOAL_AREA_LABELS } from '@/lib/arxcian/personal/types'
import { Panel } from '@/components/arxcian/Panel'

/** Tavoitteiden edistyminen elämänalueittain — valmiit/kaikki, ei keksittyä prosenttia. */
export async function GoalsProgress({ delay }: { delay?: number }) {
  const user = await currentUser()
  const goals = await getGoals(user)

  const byArea = GOAL_AREAS.map(area => {
    const inArea = goals.filter(g => g.area === area)
    return { area, done: inArea.filter(g => g.done).length, total: inArea.length }
  }).filter(a => a.total > 0)

  return (
    <Panel
      title="Tavoitteet"
      meta={goals.length > 0 ? `${goals.filter(g => g.done).length}/${goals.length}` : undefined}
      delay={delay}
      empty="Ei vielä tavoitteita — lisää Personal-osiossa."
    >
      {byArea.length > 0 ? (
        <>
          <ul className="space-y-3">
            {byArea.map(({ area, done, total }) => (
              <li key={area}>
                <div className="mb-1 flex items-baseline justify-between text-[12px]">
                  <span className="text-ax-text">{GOAL_AREA_LABELS[area]}</span>
                  <span className="font-mono text-ax-faint">{done}/{total}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-ax-panel-hi">
                  <div
                    className="h-full rounded-full bg-ax-accent transition-all"
                    style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/arxcian/personal"
            className="mt-3 inline-block text-[11px] text-ax-faint transition-colors hover:text-ax-accent"
          >
            Kaikki tavoitteet →
          </Link>
        </>
      ) : null}
    </Panel>
  )
}
