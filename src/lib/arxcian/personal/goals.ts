import { canView, type Owner, type SessionUser } from '@/lib/session'
import { createOwnedStore } from './ownedStoreKv'
import type { Goal, GoalArea } from './types'

const TTL_SECONDS = 5 * 365 * 24 * 60 * 60 // "pysyvä" — ei haluta tavoitteiden vanhentuvan

const store = createOwnedStore<Goal>('personal:goals', TTL_SECONDS)

/** Palauttaa vain käyttäjän näkemät tavoitteet — suodatus aina palvelinpuolella. */
export async function getGoals(user: SessionUser | null): Promise<Goal[]> {
  return store.visible(user)
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
  return store.mutate(all => [goal, ...all])
}

// Muutokset tarkistavat omistajuuden: pelkkä id ei riitä, muuten kirjautunut
// käyttäjä voisi arvata toisen käyttäjän tietueen tunnisteen ja muokata sitä.
// Tarkistus on mutaation sisällä, joten se tehdään sitä listaa vasten jota
// vasten kirjoitetaan — ei vanhentuneesta luvusta.
export async function toggleGoalDone(id: string, user: SessionUser | null): Promise<Goal[]> {
  return store.mutate(all => {
    const target = all.find(g => g.id === id)
    if (!target || !canView(target.owner, user)) return null

    return all.map(g =>
      g.id === id ? { ...g, done: !g.done, completedAt: !g.done ? Date.now() : null } : g,
    )
  })
}

export async function removeGoal(id: string, user: SessionUser | null): Promise<Goal[]> {
  return store.mutate(all => {
    const target = all.find(g => g.id === id)
    if (!target || !canView(target.owner, user)) return null

    return all.filter(g => g.id !== id)
  })
}

/** Onko tavoite olemassa. promoteNoteToGoal käyttää keskeneräisen ylennyksen tunnistamiseen. */
export async function goalExists(id: string, user: SessionUser | null): Promise<boolean> {
  return (await store.visible(user)).some(g => g.id === id)
}

/** notes.ts kutsuu tätä kun muistiinpano ylennetään tavoitteeksi. */
export async function createGoalFromNote(input: {
  /** Id tulee kutsujalta, ks. promoteNoteToGoal — varaus tehdään ennen luontia. */
  id: string
  owner: Owner
  title: string
}): Promise<Goal> {
  const goal: Goal = {
    id: input.id,
    owner: input.owner,
    area: 'henkilokohtainen',
    title: input.title,
    description: '',
    targetDate: null,
    done: false,
    createdAt: Date.now(),
    completedAt: null,
  }
  // Id tulee kutsujalta (promoteNoteToGoal), ja sama ylennys voidaan yrittää
  // uudelleen — siksi olemassaolo tarkistetaan. Muilla lisäyspoluilla id on
  // joka kutsulla uusi crypto.randomUUID(), eikä tarkistus voi osua.
  await store.mutate(all => (all.some(g => g.id === goal.id) ? null : [goal, ...all]))
  return goal
}
