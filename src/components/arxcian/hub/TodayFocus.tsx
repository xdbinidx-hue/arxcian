import { currentUser } from '@/lib/session'
import { getHabits } from '@/lib/arxcian/personal/habits'
import { getGoals } from '@/lib/arxcian/personal/goals'
import { todayISOHelsinki } from '@/lib/arxcian/time'
import { Panel } from '@/components/arxcian/Panel'
import { ProgressRing } from './ProgressRing'

/**
 * TÄNÄÄN: päivän eteneminen yhtenä lukuna.
 *
 * Prosentti on **tehdyt rutiinit / kaikki rutiinit tänään** — ei koostettu
 * tunnusluku useasta lähteestä. Yksi selitettävä luku on hubille oikea
 * valinta: jos siihen sekoittaisi tavoitteet ja tapahtumat, kukaan ei tietäisi
 * mitä 82 % tarkoittaa eikä mitä pitäisi tehdä että se nousisi.
 *
 * Ilman rutiineja prosenttia ei ole olemassa, joten rengasta ei näytetä
 * nollassa — tyhjä tila kertoo mistä luku syntyisi.
 */
export async function TodayFocus({ delay }: { delay?: number }) {
  const user = await currentUser()
  const today = todayISOHelsinki()

  const [habits, goals] = await Promise.all([getHabits(user), getGoals(user)])

  const done = habits.filter(h => h.completedDates.includes(today)).length
  const total = habits.length
  const percent = total > 0 ? Math.round((done / total) * 100) : null
  const activeGoals = goals.filter(g => !g.done).length

  return (
    <Panel
      title="Tänään"
      delay={delay}
      empty={
        percent === null ? 'Ei vielä rutiineja — lisää ne Personal-osiossa.' : undefined
      }
    >
      {percent !== null ? (
        <div className="flex flex-col items-center py-3">
          <ProgressRing value={percent} />

          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ax-accent">
            Päivän fokus
          </p>
          <p className="mt-1 text-[13px] text-ax-dim">
            {done}/{total} rutiinia · {activeGoals} tavoitetta
          </p>
        </div>
      ) : null}
    </Panel>
  )
}
