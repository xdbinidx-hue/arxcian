import { readCached, writeCached } from '../cache'
import { visibleTo, type Owner, type SessionUser } from '@/lib/session'
import type { Goal, GoalArea } from './types'

const CACHE_KEY = 'personal:goals'
const TTL_SECONDS = 5 * 365 * 24 * 60 * 60 // "pysyvä" — ei haluta tavoitteiden vanhentuvan

async function getAll(): Promise<Goal[]> {
  const cached = await readCached<Goal[]>(CACHE_KEY)
  return cached?.data ?? []
}

async function saveAll(goals: Goal[]): Promise<void> {
  await writeCached(CACHE_KEY, goals, TTL_SECONDS, 0)
}

/** Palauttaa vain käyttäjän näkemät tavoitteet — suodatus aina palvelinpuolella. */
export async function getGoals(user: SessionUser | null): Promise<Goal[]> {
  return visibleTo(await getAll(), user)
}

export async function addGoal(input: {
  owner: Owner
  area: GoalArea
  title: string
  description: string
  targetDate: string | null
}): Promise<Goal[]> {
  const goal: Goal = {
    id: crypto.randomUUID(),
    ...input,
    done: false,
    createdAt: Date.now(),
    completedAt: null,
  }
  const all = [goal, ...(await getAll())]
  await saveAll(all)
  return all
}

export async function toggleGoalDone(id: string): Promise<Goal[]> {
  const all = await getAll()
  const updated = all.map(g =>
    g.id === id ? { ...g, done: !g.done, completedAt: !g.done ? Date.now() : null } : g,
  )
  await saveAll(updated)
  return updated
}

export async function removeGoal(id: string): Promise<Goal[]> {
  const updated = (await getAll()).filter(g => g.id !== id)
  await saveAll(updated)
  return updated
}

/** notes.ts kutsuu tätä kun muistiinpano ylennetään tavoitteeksi. */
export async function createGoalFromNote(input: {
  owner: Owner
  title: string
}): Promise<Goal> {
  const goal: Goal = {
    id: crypto.randomUUID(),
    owner: input.owner,
    area: 'henkilokohtainen',
    title: input.title,
    description: '',
    targetDate: null,
    done: false,
    createdAt: Date.now(),
    completedAt: null,
  }
  const all = [goal, ...(await getAll())]
  await saveAll(all)
  return goal
}
