import { readCached, writeCached } from '../cache'
import { visibleTo, type Owner, type SessionUser } from '@/lib/session'
import type { Habit } from './types'

export { calculateStreak } from './streak'

const CACHE_KEY = 'personal:habits'
const TTL_SECONDS = 5 * 365 * 24 * 60 * 60

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

async function getAll(): Promise<Habit[]> {
  const cached = await readCached<Habit[]>(CACHE_KEY)
  return cached?.data ?? []
}

async function saveAll(habits: Habit[]): Promise<void> {
  await writeCached(CACHE_KEY, habits, TTL_SECONDS, 0)
}

export async function getHabits(user: SessionUser | null): Promise<Habit[]> {
  return visibleTo(await getAll(), user)
}

export async function addHabit(input: { owner: Owner; title: string }): Promise<Habit[]> {
  const habit: Habit = { id: crypto.randomUUID(), ...input, createdAt: Date.now(), completedDates: [] }
  const all = [habit, ...(await getAll())]
  await saveAll(all)
  return all
}

/** Kääntää tämän päivän tehty-tilan päälle/pois. */
export async function toggleHabitToday(id: string): Promise<Habit[]> {
  const today = todayISO()
  const all = await getAll()
  const updated = all.map(h => {
    if (h.id !== id) return h
    const has = h.completedDates.includes(today)
    return { ...h, completedDates: has ? h.completedDates.filter(d => d !== today) : [...h.completedDates, today] }
  })
  await saveAll(updated)
  return updated
}

export async function removeHabit(id: string): Promise<Habit[]> {
  const updated = (await getAll()).filter(h => h.id !== id)
  await saveAll(updated)
  return updated
}
