import Link from 'next/link'
import { currentUser } from '@/lib/session'
import { getGoals } from '@/lib/arxcian/personal/goals'
import { Panel } from '@/components/arxcian/Panel'

/**
 * TO-DO. Lista on **kesken olevat tavoitteet**, ei erillinen tehtävälista.
 *
 * Toinen rinnakkainen lista olisi tarkoittanut omaa tallennustaan, omaa
 * rajapintaansa ja kahta paikkaa jossa sama asia voi olla kesken. Tavoitteilla
 * on jo tarvittava muoto — otsikko, määräpäivä ja valmis-tila — joten hub
 * näyttää ne ja Personal-osio on yhä ainoa paikka jossa niitä muokataan.
 *
 * Rivit eivät siksi ole valintaruutuja vaan linkkejä: valmiiksi merkitseminen
 * kuuluu sinne missä tavoite elää, eikä hubin pitäisi olla toinen
 * kirjoituspiste samaan dataan.
 */

const MAX_ROWS = 5

/** Määräpäivä lyhyeen muotoon: tänään ja huomenna sanoina, muut päivämääränä. */
function dueLabel(targetDate: string | null): string {
  if (!targetDate) return ''

  const due = new Date(`${targetDate}T00:00:00`)
  if (Number.isNaN(due.getTime())) return ''

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)

  if (days === 0) return 'Tänään'
  if (days === 1) return 'Huomenna'
  if (days < 0) return 'Myöhässä'

  return due.toLocaleDateString('fi-FI', { day: 'numeric', month: 'short' })
}

export async function TodoPanel({ delay }: { delay?: number }) {
  const user = await currentUser()
  const goals = await getGoals(user)

  const open = goals
    .filter(g => !g.done)
    .sort((a, b) => {
      // Määräpäivälliset ensin, lähin ensimmäisenä.
      if (a.targetDate && b.targetDate) return a.targetDate.localeCompare(b.targetDate)
      if (a.targetDate) return -1
      if (b.targetDate) return 1
      return a.createdAt - b.createdAt
    })
    .slice(0, MAX_ROWS)

  return (
    <Panel
      title="To-do"
      meta={goals.length > 0 ? `${goals.filter(g => g.done).length}/${goals.length}` : undefined}
      delay={delay}
      empty="Ei avoimia tavoitteita — lisää Personal-osiossa."
    >
      {open.length > 0 ? (
        <>
          <ul className="space-y-2.5">
            {open.map(goal => {
              const due = dueLabel(goal.targetDate)
              return (
                <li key={goal.id}>
                  <Link
                    href="/arxcian/personal"
                    className="grid grid-cols-[16px_1fr_auto] items-center gap-2.5 transition-colors hover:text-ax-text"
                  >
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 rounded border border-ax-line/50"
                    />
                    <span className="truncate text-[12px] text-ax-dim">{goal.title}</span>
                    <span className="shrink-0 font-mono text-[10px] text-ax-faint">{due}</span>
                  </Link>
                </li>
              )
            })}
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
