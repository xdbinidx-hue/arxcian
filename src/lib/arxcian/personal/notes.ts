import { readCached, writeCached } from '../cache'
import { visibleTo, type Owner, type SessionUser } from '@/lib/session'
import { createGoalFromNote } from './goals'
import type { Note } from './types'

const CACHE_KEY = 'personal:notes'
const TTL_SECONDS = 5 * 365 * 24 * 60 * 60
const MAX_NOTES = 500

/** Poimii #tagit ja /tagit tekstistä (esim. "/business uusi asiakas" -> ["business"]). */
export function extractTags(text: string): string[] {
  const matches = text.match(/[#/]([a-zA-ZäöåÄÖÅ0-9_-]+)/g) ?? []
  return Array.from(new Set(matches.map(m => m.slice(1).toLowerCase())))
}

async function getAll(): Promise<Note[]> {
  const cached = await readCached<Note[]>(CACHE_KEY)
  return cached?.data ?? []
}

async function saveAll(notes: Note[]): Promise<void> {
  await writeCached(CACHE_KEY, notes, TTL_SECONDS, 0)
}

export async function getNotes(user: SessionUser | null): Promise<Note[]> {
  return visibleTo(await getAll(), user)
}

export async function addNote(input: { owner: Owner; text: string }): Promise<Note[]> {
  const note: Note = {
    id: crypto.randomUUID(),
    owner: input.owner,
    text: input.text,
    tags: extractTags(input.text),
    createdAt: Date.now(),
    promotedToGoalId: null,
  }
  const all = [note, ...(await getAll())].slice(0, MAX_NOTES)
  await saveAll(all)
  return all
}

export async function removeNote(id: string): Promise<Note[]> {
  const updated = (await getAll()).filter(n => n.id !== id)
  await saveAll(updated)
  return updated
}

/** Luo muistiinpanosta tavoitteen ja merkitsee muistiinpanon ylennetyksi. */
export async function promoteNoteToGoal(id: string): Promise<Note[]> {
  const all = await getAll()
  const note = all.find(n => n.id === id)
  if (!note || note.promotedToGoalId) return all

  const goal = await createGoalFromNote({ owner: note.owner, title: note.text.slice(0, 200) })
  const updated = all.map(n => (n.id === id ? { ...n, promotedToGoalId: goal.id } : n))
  await saveAll(updated)
  return updated
}
