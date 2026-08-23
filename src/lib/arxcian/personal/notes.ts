import { canView, type Owner, type SessionUser } from '@/lib/session'
import { createOwnedStore } from './ownedStoreKv'
import { createGoalFromNote, goalExists } from './goals'
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
 * **Keskeneräinen ylennys viimeistellään uudella yrityksellä.** Jos varaus
 * onnistui mutta tavoitteen luonti kaatui, muistiinpano osoittaa tavoitteeseen
 * jota ei ole. Silloin uusi yritys ei saa lopettaa varattuun tilaan — se
 * vastaisi 200 OK tekemättä mitään ja tavoite jäisi syntymättä pysyvästi.
 * Siksi `goalExists` tarkistaa varatun id:n ja luonti ajetaan tarvittaessa
 * uudelleen samalla id:llä.
 *
 * `promotedToGoalId` on siis kaksoiskäytössä: lippu "tämä on jo ylennetty"
 * **ja** viittaus jolla puuttuva tavoite tunnistetaan. Älä oleta sitä pelkäksi
 * lipuksi.
 *
 * Huom. että viimeistely on käytännössä saman istunnon sisäinen: NotesInbox
 * piilottaa ylennysnapin heti kun `promotedToGoalId` on asetettu, joten sivun
 * lataamisen jälkeen uutta yritystä ei voi käynnistää käyttöliittymästä.
 * Napin näyttäminen ylennetyille on oma päätöksensä — sen kanssa tulee myös
 * se että poistettu tavoite syntyisi uudelleen.
 */
export async function promoteNoteToGoal(id: string, user: SessionUser | null): Promise<Note[]> {
  const uusiId = crypto.randomUUID()
  let ylennettava: Note | null = null

  const updated = await store.mutate(all => {
    const note = all.find(n => n.id === id)
    if (!note || !canView(note.owner, user)) return null
    ylennettava = note
    // Jo varattu: älä varaa uudelleen, mutta älä myöskään lopeta tähän —
    // tavoite on voinut jäädä syntymättä, ks. viimeistely alla.
    if (note.promotedToGoalId) return null

    return all.map(n => (n.id === id ? { ...n, promotedToGoalId: uusiId } : n))
  })

  const note = ylennettava as Note | null
  const varattuId = updated.find(n => n.id === id)?.promotedToGoalId
  if (!note || !varattuId) return updated

  // Uudelleenyritys viimeistelee keskeneräisen ylennyksen. Ilman tätä
  // tavoitteen luonnin kaaduttua muistiinpano jäisi pysyvästi "ylennetyksi"
  // ilman tavoitetta, ja uusi yritys vastaisi 200 OK tekemättä mitään.
  if (varattuId !== uusiId && (await goalExists(varattuId, user))) return updated

  await createGoalFromNote({
    id: varattuId,
    owner: note.owner,
    title: note.text.slice(0, 200),
  })

  return updated
}
