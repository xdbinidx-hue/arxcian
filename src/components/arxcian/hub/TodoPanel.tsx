import Link from 'next/link'
import { currentUser } from '@/lib/session'
import { getTodos } from '@/lib/arxcian/personal/todos'
import { groupOf, GROUP_LABELS } from '@/lib/arxcian/personal/todoGroups'
import { todayISOHelsinki } from '@/lib/arxcian/time'
import { Panel } from '@/components/arxcian/Panel'
import type { Todo } from '@/lib/arxcian/personal/types'

/**
 * TO-DO. Lista on Personal-osion **päivätehtävät**, ei tavoitteet.
 *
 * Paneeli näytti aiemmin kesken olevia tavoitteita, ja sen perustelu oli että
 * toinen rinnakkainen lista tarkoittaisi omaa tallennustaan ja kahta paikkaa
 * jossa sama asia voi olla kesken. Perustelu oli oikea silloin kun tavoitteet
 * olivat ainoa lista — mutta 12.8.2026 rakennettiin oikea tehtävälista
 * ([todos.ts](src/lib/arxcian/personal/todos.ts)) päivineen ja
 * muistutuksineen, eikä paneelia päivitetty. Lopputulos oli pahempi kuin se
 * mitä perustelu esti: kaksi listaa, ja etusivu näytti niistä sen jonka
 * otsikko ei ollut "Tehtävät".
 *
 * Tavoitteet eivät katoa etusivulta — TÄNÄÄN-paneeli laskee avoimet
 * tavoitteet omana lukunaan. Ne vain eivät esiinny enää tehtävinä.
 *
 * Rivit eivät ole valintaruutuja vaan linkkejä: valmiiksi merkitseminen
 * kuuluu sinne missä tehtävä elää, eikä hubin pitäisi olla toinen
 * kirjoituspiste samaan dataan.
 *
 * **Päivä luetaan Helsingin aikavyöhykkeeltä, ei selaimesta.** Paneeli
 * renderöidään palvelimella, joten selaimen paikallinen päivä ei ole
 * saatavilla — ja pelkkä UTC näyttäisi Suomen aikaa klo 00–03 eilistä.
 * `todayISOHelsinki()` on sama valinta kuin TÄNÄÄN-paneelissa.
 */

const MAX_ROWS = 5

/**
 * Ajankohta lyhyeen muotoon: myöhässä, tänään ja huomenna sanoina, muut
 * päivämääränä. "Myöhemmin" olisi hubilla liian epämääräinen — viiden päivän
 * ja viiden viikon päässä oleva tehtävä näyttäisi samalta.
 */
function whenLabel(todo: Todo, today: string): string {
  const group = groupOf(todo, today)
  if (group === 'joskus') return ''
  if (group === 'myohemmin') {
    return new Date(`${todo.date}T12:00:00`).toLocaleDateString('fi-FI', {
      day: 'numeric',
      month: 'short',
    })
  }
  return GROUP_LABELS[group]
}

export async function TodoPanel({ delay }: { delay?: number }) {
  const user = await currentUser()
  const todos = await getTodos(user)
  const today = todayISOHelsinki()

  // Lista on jo järjestyksessä (sortTodos tallennuksessa): ajoitetut ensin
  // päivän ja kellonajan mukaan, päivättömät perään, tehdyt viimeisenä.
  const open = todos.filter(t => !t.done)
  const rows = open.slice(0, MAX_ROWS)
  const myohassa = open.filter(t => groupOf(t, today) === 'myohassa').length

  return (
    <Panel
      title="To-do"
      meta={myohassa > 0 ? `${myohassa} myöhässä` : undefined}
      action={
        <Link
          href="/arxcian/personal"
          className="text-[10px] text-ax-accent transition-colors hover:text-ax-text"
        >
          + Lisää uusi
        </Link>
      }
      delay={delay}
      empty="Ei avoimia tehtäviä — lisää Personal-osiossa."
    >
      {rows.length > 0 ? (
        <>
          <ul className="space-y-2.5">
            {rows.map(todo => {
              const group = groupOf(todo, today)
              return (
                <li key={todo.id}>
                  <Link
                    href="/arxcian/personal"
                    className="grid grid-cols-[16px_1fr_auto] items-center gap-2.5 transition-colors hover:text-ax-text"
                  >
                    <span aria-hidden="true" className="h-4 w-4 rounded border border-ax-line/50" />
                    <span className="truncate text-[12px] text-ax-dim">{todo.title}</span>
                    <span
                      className={`shrink-0 font-mono text-[10px] ${
                        group === 'myohassa' ? 'text-ax-down' : 'text-ax-faint'
                      }`}
                    >
                      {whenLabel(todo, today)}
                      {todo.remindAt ? ` ${todo.remindAt}` : ''}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>

          <Link
            href="/arxcian/personal"
            className="mt-3 inline-block text-[11px] text-ax-faint transition-colors hover:text-ax-accent"
          >
            {open.length > MAX_ROWS ? `Kaikki ${open.length} tehtävää →` : 'Kaikki tehtävät →'}
          </Link>
        </>
      ) : null}
    </Panel>
  )
}
