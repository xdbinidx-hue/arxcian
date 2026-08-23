import { canView, type Owner, type SessionUser } from '@/lib/session'
import { createOwnedStore } from './ownedStoreKv'
import { todayISOHelsinki } from '../time'
import type { Habit } from './types'

export { calculateStreak } from './streak'

const TTL_SECONDS = 5 * 365 * 24 * 60 * 60

const store = createOwnedStore<Habit>('personal:habits', TTL_SECONDS)

export async function getHabits(user: SessionUser | null): Promise<Habit[]> {
  return store.visible(user)
}

export async function addHabit(input: { owner: Owner; title: string }): Promise<Habit[]> {
  const habit: Habit = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: Date.now(),
    completedDates: [],
  }
  return store.mutate(all => (all.some(h => h.id === habit.id) ? null : [habit, ...all]))
}

/** Kääntää tämän päivän tehty-tilan päälle/pois. Tarkistaa omistajuuden, ks. goals.ts. */
export async function toggleHabitToday(id: string, user: SessionUser | null): Promise<Habit[]> {
  const today = todayISOHelsinki()

  return store.mutate(all => {
    const target = all.find(h => h.id === id)
    if (!target || !canView(target.owner, user)) return null

    return all.map(h => {
      if (h.id !== id) return h
      const has = h.completedDates.includes(today)
      return {
        ...h,
        completedDates: has ? h.completedDates.filter(d => d !== today) : [...h.completedDates, today],
      }
    })
  })
}

export async function removeHabit(id: string, user: SessionUser | null): Promise<Habit[]> {
  return store.mutate(all => {
    const target = all.find(h => h.id === id)
    if (!target || !canView(target.owner, user)) return null

    return all.filter(h => h.id !== id)
  })
}
