import { currentUser, currentOwner } from '@/lib/session'
import { getGoals } from '@/lib/arxcian/personal/goals'
import { getHabits } from '@/lib/arxcian/personal/habits'
import { getNotes } from '@/lib/arxcian/personal/notes'
import { GoalsPanel } from '@/components/arxcian/personal/GoalsPanel'
import { HabitTracker } from '@/components/arxcian/personal/HabitTracker'
import { NotesInbox } from '@/components/arxcian/personal/NotesInbox'
import { Panel } from '@/components/arxcian/Panel'

export const metadata = { title: 'Personal · arxcian' }
export const dynamic = 'force-dynamic'

export default async function PersonalPage() {
  const owner = await currentOwner()
  const user = await currentUser()

  const [goals, habits, notes] = await Promise.all([getGoals(user), getHabits(user), getNotes(user)])

  return (
    <div className="mx-auto max-w-6xl">
      <header className="ax-rise pb-6 pt-2">
        <h1 className="text-2xl font-light tracking-tight text-ax-text">Personal</h1>
        <p className="mt-1 text-[13px] text-ax-dim">Kalenteri, tavoitteet ja rutiinit</p>
      </header>

      <div className="mb-4">
        <Panel title="Kalenteri" meta="Google Calendar">
          <p className="py-6 text-center text-[13px] text-ax-faint">
            Google Calendar -synkronointi tulossa — vaatii OAuth-kytkennän omaan kalenteriisi.
          </p>
        </Panel>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        {owner && <GoalsPanel initialGoals={goals} currentUser={owner} />}
        {owner && <HabitTracker initialHabits={habits} currentUser={owner} />}
      </div>

      <div className="mb-4">{owner && <NotesInbox initialNotes={notes} currentUser={owner} />}</div>
    </div>
  )
}
