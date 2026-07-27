import { headers } from 'next/headers'
import { currentUser, currentOwner } from '@/lib/session'
import { getGoals } from '@/lib/arxcian/personal/goals'
import { getHabits } from '@/lib/arxcian/personal/habits'
import { getNotes } from '@/lib/arxcian/personal/notes'
import { getCalendarStatus } from '@/lib/arxcian/personal/calendar/events'
import { GoalsPanel } from '@/components/arxcian/personal/GoalsPanel'
import { HabitTracker } from '@/components/arxcian/personal/HabitTracker'
import { NotesInbox } from '@/components/arxcian/personal/NotesInbox'
import { CalendarPanel } from '@/components/arxcian/personal/calendar/CalendarPanel'
import type { CalendarStatus } from '@/lib/arxcian/personal/calendar/types'

export const metadata = { title: 'Personal · arxcian' }
export const dynamic = 'force-dynamic'

/** OAuthin uudelleenohjaus vaatii saman originin kuin valtuutuspyyntö. */
function requestOrigin(): string {
  const h = headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export default async function PersonalPage({
  searchParams,
}: {
  searchParams: { kalenteri?: string }
}) {
  const owner = await currentOwner()
  const user = await currentUser()

  const [goals, habits, notes, calendar] = await Promise.all([
    getGoals(user),
    getHabits(user),
    getNotes(user),
    owner
      ? getCalendarStatus(owner, requestOrigin())
      : Promise.resolve<CalendarStatus>({ state: 'disconnected' }),
  ])

  return (
    <div className="mx-auto max-w-6xl">
      <header className="ax-rise pb-6 pt-2">
        <h1 className="text-2xl font-light tracking-tight text-ax-text">Personal</h1>
        <p className="mt-1 text-[13px] text-ax-dim">Kalenteri, tavoitteet ja rutiinit</p>
      </header>

      <div className="mb-4">
        <CalendarPanel status={calendar} notice={searchParams.kalenteri} />
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        {owner && <GoalsPanel initialGoals={goals} currentUser={owner} />}
        {owner && <HabitTracker initialHabits={habits} currentUser={owner} />}
      </div>

      <div className="mb-4">{owner && <NotesInbox initialNotes={notes} currentUser={owner} />}</div>
    </div>
  )
}
