import { readCached, writeCached } from '../cache'
import { canView, visibleTo, type Owner, type SessionUser } from '@/lib/session'
import { normalizeDate, normalizeTime, sortTodos } from './todoGroups'
import type { Todo } from './types'

const CACHE_KEY = 'personal:todos'
const TTL_SECONDS = 5 * 365 * 24 * 60 * 60 // "pysyvä", kuten tavoitteilla
const MAX_TODOS = 500

async function getAll(): Promise<Todo[]> {
  const cached = await readCached<Todo[]>(CACHE_KEY)
  return cached?.data ?? []
}

async function saveAll(todos: Todo[]): Promise<void> {
  await writeCached(CACHE_KEY, sortTodos(todos).slice(0, MAX_TODOS), TTL_SECONDS, 0)
}

/** Palauttaa vain käyttäjän näkemät tehtävät — suodatus aina palvelinpuolella. */
export async function getTodos(user: SessionUser | null): Promise<Todo[]> {
  return visibleTo(await getAll(), user)
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
  const all = [todo, ...(await getAll())]
  await saveAll(all)
  return all
}

// Muutokset tarkistavat omistajuuden: pelkkä id ei riitä, muuten kirjautunut
// käyttäjä voisi arvata toisen käyttäjän tietueen tunnisteen ja muokata sitä.
export async function toggleTodoDone(id: string, user: SessionUser | null): Promise<Todo[]> {
  const all = await getAll()
  const target = all.find(t => t.id === id)
  if (!target || !canView(target.owner, user)) return all

  const updated = all.map(t =>
    t.id === id ? { ...t, done: !t.done, completedAt: !t.done ? Date.now() : null } : t,
  )
  await saveAll(updated)
  return updated
}

/** Siirtää tehtävän toiselle päivälle tai poistaa ajoituksen (date = null). */
export async function rescheduleTodo(
  id: string,
  input: { date: string | null; remindAt: string | null },
  user: SessionUser | null,
): Promise<Todo[]> {
  const all = await getAll()
  const target = all.find(t => t.id === id)
  if (!target || !canView(target.owner, user)) return all

  const date = normalizeDate(input.date)
  const remindAt = normalizeTime(input.remindAt, date)
  const updated = all.map(t => (t.id === id ? { ...t, date, remindAt } : t))
  await saveAll(updated)
  return updated
}

export async function removeTodo(id: string, user: SessionUser | null): Promise<Todo[]> {
  const all = await getAll()
  const target = all.find(t => t.id === id)
  if (!target || !canView(target.owner, user)) return all

  const updated = all.filter(t => t.id !== id)
  await saveAll(updated)
  return updated
}

/** Siivoaa tehdyt kerralla — vain ne jotka käyttäjä näkee, muut jäävät koskematta. */
export async function clearDoneTodos(user: SessionUser | null): Promise<Todo[]> {
  const all = await getAll()
  const updated = all.filter(t => !(t.done && canView(t.owner, user)))
  await saveAll(updated)
  return updated
}
