import { canView, type Owner, type SessionUser } from '@/lib/session'
import { createOwnedStore } from './ownedStoreKv'
import { normalizeDate, normalizeTime, sortTodos } from './todoGroups'
import type { Todo } from './types'

const TTL_SECONDS = 5 * 365 * 24 * 60 * 60 // "pysyvä", kuten tavoitteilla
const MAX_TODOS = 500

const store = createOwnedStore<Todo>('personal:todos', TTL_SECONDS)

/** Järjestys ja katto tallennuksessa, jotta jokainen lukija saa saman listan. */
function normalize(todos: Todo[]): Todo[] {
  return sortTodos(todos).slice(0, MAX_TODOS)
}

/** Palauttaa vain käyttäjän näkemät tehtävät — suodatus aina palvelinpuolella. */
export async function getTodos(user: SessionUser | null): Promise<Todo[]> {
  return store.visible(user)
}

export async function addTodo(input: {
  owner: Owner
  title: string
  date: string | null
  remindAt: string | null
}): Promise<Todo[]> {
  const date = normalizeDate(input.date)
  const todo: Todo = {
    id: crypto.randomUUID(),
    owner: input.owner,
    title: input.title,
    date,
    remindAt: normalizeTime(input.remindAt, date),
    done: false,
    createdAt: Date.now(),
    completedAt: null,
  }
  return store.mutate(all => normalize([todo, ...all]))
}

// Muutokset tarkistavat omistajuuden: pelkkä id ei riitä, muuten kirjautunut
// käyttäjä voisi arvata toisen käyttäjän tietueen tunnisteen ja muokata sitä.
// Tarkistus on mutaation sisällä, joten se tehdään sitä listaa vasten jota
// vasten kirjoitetaan — ei vanhentuneesta luvusta.
export async function toggleTodoDone(id: string, user: SessionUser | null): Promise<Todo[]> {
  return store.mutate(all => {
    const target = all.find(t => t.id === id)
    if (!target || !canView(target.owner, user)) return null

    return normalize(
      all.map(t =>
        t.id === id ? { ...t, done: !t.done, completedAt: !t.done ? Date.now() : null } : t,
      ),
    )
  })
}

/** Siirtää tehtävän toiselle päivälle tai poistaa ajoituksen (date = null). */
export async function rescheduleTodo(
  id: string,
  input: { date: string | null; remindAt: string | null },
  user: SessionUser | null,
): Promise<Todo[]> {
  const date = normalizeDate(input.date)
  const remindAt = normalizeTime(input.remindAt, date)

  return store.mutate(all => {
    const target = all.find(t => t.id === id)
    if (!target || !canView(target.owner, user)) return null

    return normalize(all.map(t => (t.id === id ? { ...t, date, remindAt } : t)))
  })
}

export async function removeTodo(id: string, user: SessionUser | null): Promise<Todo[]> {
  return store.mutate(all => {
    const target = all.find(t => t.id === id)
    if (!target || !canView(target.owner, user)) return null

    return all.filter(t => t.id !== id)
  })
}

/** Siivoaa tehdyt kerralla — vain ne jotka käyttäjä näkee, muut jäävät koskematta. */
export async function clearDoneTodos(user: SessionUser | null): Promise<Todo[]> {
  return store.mutate(all => {
    const jaljelle = all.filter(t => !(t.done && canView(t.owner, user)))
    return jaljelle.length === all.length ? null : jaljelle
  })
}
