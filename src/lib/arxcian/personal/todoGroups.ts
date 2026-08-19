// Päivätehtävien puhdas logiikka: päivämuunnokset, ryhmittely ja järjestys.
//
// Erotettu [todos.ts](src/lib/arxcian/personal/todos.ts):stä ja
// [TodoList.tsx](src/components/arxcian/personal/TodoList.tsx):stä siksi, että
// molemmat tarvitsevat saman ryhmittelyn ja kummankin oma toteutus ajautuisi
// erilleen — hubin paneeli laskisi "myöhässä" eri tavalla kuin Personal-sivun
// lista. Moduulissa ei ole I/O:ta eikä Reactia, joten se on ajettavissa
// `node --test`illä ilman verkkoa (ks. CLAUDE.md, "Testit ajetaan ilman
// testiajuria").

import type { Todo } from './types'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^\d{2}:\d{2}$/

/** Hylkää muodottoman päivän hiljaisesti — tallennettu roska rikkoisi lajittelun. */
export function normalizeDate(value: unknown): string | null {
  return typeof value === 'string' && DATE_PATTERN.test(value) ? value : null
}

/** Kellonaika kelpaa vain päivän kanssa, ks. Todo.remindAt. */
export function normalizeTime(value: unknown, date: string | null): string | null {
  if (!date) return null
  return typeof value === 'string' && TIME_PATTERN.test(value) ? value : null
}

/** YYYY-MM-DD annetun ajan paikallisesta kalenteripäivästä, ei UTC:sta (ks. Todo.date). */
export function localDate(d: Date): string {
  const kk = `${d.getMonth() + 1}`.padStart(2, '0')
  const pp = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${kk}-${pp}`
}

/** Keskipäivä lähtökohtana, jotta kesäaikasiirtymä ei heitä päivää yli. */
export function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return localDate(d)
}

/** Muistutuksen hetki paikallisena aikaleimana, tai null jos ei ajoitettu. */
export function reminderMs(todo: Todo): number | null {
  if (!todo.date || !todo.remindAt) return null
  const ms = new Date(`${todo.date}T${todo.remindAt}:00`).getTime()
  return Number.isNaN(ms) ? null : ms
}

export type Group = 'myohassa' | 'tanaan' | 'huomenna' | 'myohemmin' | 'joskus'

export const GROUP_ORDER: readonly Group[] = [
  'myohassa',
  'tanaan',
  'huomenna',
  'myohemmin',
  'joskus',
]

export const GROUP_LABELS: Record<Group, string> = {
  myohassa: 'Myöhässä',
  tanaan: 'Tänään',
  huomenna: 'Huomenna',
  myohemmin: 'Myöhemmin',
  joskus: 'Ei ajankohtaa',
}

export function groupOf(todo: Todo, today: string): Group {
  if (!todo.date) return 'joskus'
  if (todo.date < today) return 'myohassa'
  if (todo.date === today) return 'tanaan'
  if (todo.date === shiftDays(today, 1)) return 'huomenna'
  return 'myohemmin'
}

/** Tänään avoinna tai myöhässä — se joukko jota hubin paneeli ja laskuri näyttävät. */
export function dueToday(todos: readonly Todo[], today: string): Todo[] {
  return todos.filter(t => {
    if (t.done) return false
    const g = groupOf(t, today)
    return g === 'myohassa' || g === 'tanaan'
  })
}

/**
 * Ajoitetut ensin päivän ja kellonajan mukaan, päivättömät perään, tehdyt
 * viimeisenä. Lajittelu tehdään tallennuksessa, jotta jokainen lukija saa
 * saman järjestyksen ilman omaa vertailufunktiotaan.
 */
export function sortTodos(todos: readonly Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (a.date !== b.date) {
      if (!a.date) return 1
      if (!b.date) return -1
      return a.date < b.date ? -1 : 1
    }
    const timeA = a.remindAt ?? '99:99'
    const timeB = b.remindAt ?? '99:99'
    if (timeA !== timeB) return timeA < timeB ? -1 : 1
    return b.createdAt - a.createdAt
  })
}
