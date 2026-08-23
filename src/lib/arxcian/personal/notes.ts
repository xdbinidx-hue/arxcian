import { canView, type Owner, type SessionUser } from '@/lib/session'
import { createOwnedStore } from './ownedStoreKv'
import { createGoalFromNote } from './goals'
import type { Note } from './types'

const TTL_SECONDS = 5 * 365 * 24 * 60 * 60
const MAX_NOTES = 500

const store = createOwnedStore<Note>('personal:notes', TTL_SECONDS)

/** Poimii #tagit ja /tagit tekstistä (esim. "/business uusi asiakas" -> ["business"]). */
export function extractTags(text: string): string[] {
  const matches = text.match(/[#/]([a-zA-ZäöåÄÖÅ0-9_-]+)/g) ?? []
  return Array.from(new Set(matches.map(m => m.slice(1).toLowerCase())))
}

export async function getNotes(user: SessionUser | null): Promise<Note[]> {
  return store.visible(user)
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
  return store.mutate(all => [note, ...all].slice(0, MAX_NOTES))
}

/** Tarkistaa omistajuuden ennen poistoa, ks. goals.ts. */
export async function removeNote(id: string, user: SessionUser | null): Promise<Note[]> {
  return store.mutate(all => {
    const target = all.find(n => n.id === id)
    if (!target || !canView(target.owner, user)) return null

    return all.filter(n => n.id !== id)
  })
}

/**
 * Luo muistiinpanosta tavoitteen ja merkitsee muistiinpanon ylennetyksi.
 *
 * **Järjestys on tässä olennainen.** Tavoitteen id arvotaan etukäteen ja
 * muistiinpano varataan sillä *ensin*, vasta sitten tavoite luodaan. Syy on
 * `mutate`n uudelleenyritys: takaisinkutsu voi ajautua useamman kerran, joten
 * tavoitteen luonti sen sisällä tekisi kaksi tavoitetta yhdestä
 * muistiinpanosta jos kirjoitus törmää kerran.
 *
 * Jos varaus onnistuu mutta tavoitteen luonti kaatuu, muistiinpano jää
 * osoittamaan tavoitteeseen jota ei ole. Se on pienempi haitta kuin
 * kaksoiskappale: `promotedToGoalId` on käytössä vain lippuna "tämä on jo
 * ylennetty", eikä sillä haeta tavoitetta.
 */
export async function promoteNoteToGoal(id: string, user: SessionUser | null): Promise<Note[]> {
  const goalId = crypto.randomUUID()
  let ylennettava: Note | null = null

  const updated = await store.mutate(all => {
    const note = all.find(n => n.id === id)
    if (!note || note.promotedToGoalId || !canView(note.owner, user)) return null

    ylennettava = note
    return all.map(n => (n.id === id ? { ...n, promotedToGoalId: goalId } : n))
  })

  // Takaisinkutsu on voinut ajautua ja perua itsensä viimeisellä yrityksellä,
  // joten varaus varmistetaan lopputuloksesta eikä pelkästä sivuvaikutuksesta.
  const varattu = updated.find(n => n.id === id)?.promotedToGoalId === goalId
  if (varattu && ylennettava) {
    await createGoalFromNote({
      id: goalId,
      owner: (ylennettava as Note).owner,
      title: (ylennettava as Note).text.slice(0, 200),
    })
  }

  return updated
}
