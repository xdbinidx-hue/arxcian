import { headers } from 'next/headers'
import { currentUser, currentOwner } from '@/lib/session'
import { getHabits } from '@/lib/arxcian/personal/habits'
import { getGoals } from '@/lib/arxcian/personal/goals'
import { getCalendarStatus } from '@/lib/arxcian/personal/calendar/events'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function requestOrigin(): string {
  const h = headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

function isToday(ms: number): boolean {
  const d = new Date(ms)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

/**
 * Päivän fokus-rivi tervehdyksen alla: kolme lukua omasta datasta
 * (rutiinit, tavoitteet, tapahtumat) — ei keksittyjä prosentteja.
 */
export async function DailyFocus() {
  const user = await currentUser()
  const owner = await currentOwner()
  const today = todayISO()

  const [habits, goals, calendar] = await Promise.all([
    getHabits(user),
    getGoals(user),
    owner ? getCalendarStatus(owner, requestOrigin()) : Promise.resolve({ state: 'disconnected' as const }),
  ])

  const habitsDone = habits.filter(h => h.completedDates.includes(today)).length
  const activeGoals = goals.filter(g => !g.done).length
  const eventsToday = calendar.state === 'connected' ? calendar.events.filter(e => isToday(e.start)).length : null

  const stats = [
    { label: 'rutiinia tehty tänään', value: `${habitsDone}/${habits.length}` },
    { label: 'tavoitetta käynnissä', value: String(activeGoals) },
    ...(eventsToday !== null ? [{ label: 'tapahtumaa tänään', value: String(eventsToday) }] : []),
  ]

  if (habits.length === 0 && goals.length === 0 && eventsToday === null) return null

  return (
    <div className="ax-rise mt-3 flex flex-wrap gap-x-6 gap-y-1.5" style={{ animationDelay: '0.08s' }}>
      {stats.map(s => (
        <div key={s.label} className="flex items-baseline gap-1.5">
          <span className="font-mono text-[15px] font-medium text-ax-accent">{s.value}</span>
          <span className="text-[12px] text-ax-faint">{s.label}</span>
        </div>
      ))}
    </div>
  )
}
