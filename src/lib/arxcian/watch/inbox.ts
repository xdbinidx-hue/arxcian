import { kv } from '../kv'
import { visibleTo, type SessionUser } from '@/lib/session'
import type { InboxEntry, WatchItem } from './types'

/**
 * Uuden sisällön inbox.
 *
 * **Yksi avain kaikille listoille**, ei osiokohtaisia — hub näyttää yhden
 * merkin, ja kaksi avainta tarkoittaisi kahta merkkiä ja kahta tyhjennystä.
 *
 * **Tämä on watchin ainoa kirjoituskohde.** Ilmoituskanavaksi valittiin
 * 13.8.2026 pelkkä sovelluksen sisäinen inbox: ei uutta riippuvuutta, tiliä
 * eikä ympäristömuuttujaa, ja watch pysyy testattavana ilman ulkoista
 * palvelua. Ulkoinen kanava — Telegram, Web Push — on myöhemmin oma
 * erillinen lukijansa tämän päällä, joten sen lisääminen ei muuta watchin
 * omaa logiikkaa. **Älä siis kirjoita ilmoituksen lähetystä watch.ts:ään.**
 *
 * Inbox on omistajatietoinen ja suodatetaan `visibleTo()`llä palvelimella:
 * Personalin kanavat voivat olla henkilökohtaisia, ja Albin ja Arbnor voivat
 * käyttää samaa laitetta.
 */

const KEY = 'arxcian:watch:inbox'

/** Yläraja, jottei inbox kasva rajatta jos sitä ei tyhjennetä. */
const MAX_ENTRIES = 100

async function readAll(): Promise<InboxEntry[]> {
  try {
    return (await kv().get<InboxEntry[]>(KEY)) ?? []
  } catch (e) {
    console.error('[watch] inboxin luku epäonnistui', e)
    return []
  }
}

async function writeAll(entries: InboxEntry[]): Promise<void> {
  try {
    await kv().set(KEY, entries.slice(0, MAX_ENTRIES))
  } catch (e) {
    console.error('[watch] inboxin kirjoitus epäonnistui', e)
  }
}

/**
 * Lisää uudet rivit inboxiin, uusin ensin.
 *
 * Palauttaa montako oikeasti lisättiin. Jo inboxissa oleva tunniste
 * ohitetaan: watch on idempotentti vain nähtyjen rekisterin osalta, ja
 * käsin ajettu kierros ei saa kahdentaa rivejä.
 */
export async function addToInbox(items: WatchItem[]): Promise<number> {
  if (items.length === 0) return 0

  const nykyiset = await readAll()
  const olemassa = new Set(nykyiset.map(e => e.id))
  const uudet = items.filter(i => !olemassa.has(i.id)).map(i => ({ ...i, addedAt: Date.now() }))
  if (uudet.length === 0) return 0

  await writeAll([...uudet, ...nykyiset])
  return uudet.length
}

/** Käyttäjälle näkyvät rivit. Suodatus on palvelimella, ei selaimessa. */
export async function readInbox(user: SessionUser | null): Promise<InboxEntry[]> {
  return visibleTo(await readAll(), user)
}

/** Montako riviä käyttäjälle näkyy — hubin merkkiä varten. */
export async function inboxCount(user: SessionUser | null): Promise<number> {
  return (await readInbox(user)).length
}

/**
 * Poistaa rivit jotka käyttäjä saa nähdä.
 *
 * Omistajuus tarkistetaan täälläkin eikä vain luvussa: pelkkä lukusuodatus
 * antaisi tyhjentää toisen käyttäjän rivit näkemättä niitä.
 */
export async function clearInbox(user: SessionUser | null, ids?: string[]): Promise<number> {
  const kaikki = await readAll()
  const poistettavat = new Set(
    visibleTo(kaikki, user)
      .filter(e => !ids || ids.includes(e.id))
      .map(e => e.id),
  )
  if (poistettavat.size === 0) return 0

  await writeAll(kaikki.filter(e => !poistettavat.has(e.id)))
  return poistettavat.size
}
