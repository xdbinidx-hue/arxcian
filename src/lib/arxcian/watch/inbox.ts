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
 * erillinen lukijansa tämän päällä. **Älä kirjoita lähetystä watch.ts:ään.**
 *
 * ## Miksi tässä ei ole yhtään luku-muokkaa-kirjoita -kierrosta
 *
 * Cron-reitti ajaa työt `Promise.all`illa, ja `watch-trading` ja
 * `watch-personal` kirjoittavat molemmat tähän samaan avaimeen. Luettu lista
 * + kirjoitettu lista hukkaisi toisen työn rivit aina kun ne osuvat
 * päällekkäin — ja hukatut olisivat **pysyvästi** poissa, koska `seen.ts` on
 * jo merkinnyt ne tunnisteet nähdyiksi ennen tätä kutsua. Sama päättely kuin
 * kalenterin tokeneissa (ks. CLAUDE.md).
 *
 * Siksi:
 * - lisäys on `rpush` — atominen liitos, ei lukua lainkaan
 * - kuittaus on `sadd` omaan joukkoonsa, ei riviä poistamalla
 *
 * Kuittausjoukko on **käyttäjäkohtainen**. Jaettu rivi kuuluu molemmille,
 * joten Albinin kuittaus ei saa viedä sitä Arbnorilta joka ei ole nähnyt sitä.
 */

const KEY = 'arxcian:watch:inbox'

/** Yläraja, jottei lista kasva rajatta jos rivejä ei kuitata. */
const MAX_ENTRIES = 100

/** Kuittaukset elävät selvästi listaa pidempään, jottei kuitattu palaa näkyviin. */
const DISMISSED_TTL_SECONDS = 180 * 24 * 60 * 60

function dismissedKey(user: SessionUser): string {
  return `arxcian:watch:inbox:kuitattu:${user}`
}

/**
 * Lisää rivit atomisesti.
 *
 * **Ei nielaise virhettä.** Jos kirjoitus kaatuu, kutsujan on saatava tietää:
 * `seen.ts` on jo polttanut nämä tunnisteet, joten hiljainen epäonnistuminen
 * hävittäisi sisällön lopullisesti ja raportoisi silti onnistumisen.
 */
export async function addToInbox(items: WatchItem[]): Promise<number> {
  if (items.length === 0) return 0

  const entries: InboxEntry[] = items.map(i => ({ ...i, addedAt: Date.now() }))
  const client = kv()

  const rivit = entries.map(e => JSON.stringify(e))
  await client.rpush(KEY, rivit[0], ...rivit.slice(1))
  // Vanhimmat pois kun katto ylittyy. Erillinen kutsu, mutta ylivuoto on
  // vaaraton väliaikaisena tilana toisin kuin hukattu rivi.
  await client.ltrim(KEY, -MAX_ENTRIES, -1)

  return entries.length
}

/** Rivit uusin ensin, ilman näkyvyys- tai kuittaussuodatusta. */
async function readAll(): Promise<InboxEntry[]> {
  const raw = await kv().lrange<string | InboxEntry>(KEY, 0, -1)
  const entries: InboxEntry[] = []

  for (const row of raw) {
    // Upstash palauttaa JSON-merkkijonon jäsennettynä jos se näyttää
    // objektilta, joten kumpikin muoto on kelvollinen.
    if (typeof row === 'string') {
      try {
        entries.push(JSON.parse(row) as InboxEntry)
      } catch {
        // Rikkinäinen rivi ohitetaan — se ei saa kaataa koko inboxia.
      }
    } else if (row) {
      entries.push(row)
    }
  }

  return entries.reverse()
}

async function dismissedIds(user: SessionUser): Promise<Set<string>> {
  try {
    return new Set(await kv().smembers<string[]>(dismissedKey(user)))
  } catch (e) {
    // Kuittaukset eivät ole luettavissa: näytetään mieluummin jo kuitattu
    // rivi kuin piilotetaan kuittaamaton.
    console.error('[watch] kuittausten luku epäonnistui', e)
    return new Set()
  }
}

/** Käyttäjälle näkyvät kuittaamattomat rivit. Suodatus on palvelimella. */
export async function readInbox(user: SessionUser | null): Promise<InboxEntry[]> {
  if (!user) return []

  try {
    const [entries, kuitatut] = await Promise.all([readAll(), dismissedIds(user)])
    return visibleTo(entries, user).filter(e => !kuitatut.has(e.id))
  } catch (e) {
    console.error('[watch] inboxin luku epäonnistui', e)
    return []
  }
}

/**
 * Kuittaa rivit luetuiksi tälle käyttäjälle.
 *
 * Kuittaus on merkintä eikä poisto, joten se ei kilpaile cronin lisäyksen
 * kanssa. Vain käyttäjälle näkyvät rivit voi kuitata — muuten toisen rivin
 * voisi kuitata sitä näkemättä.
 */
export async function clearInbox(user: SessionUser | null, ids?: string[]): Promise<number> {
  if (!user) return 0

  const nakyvat = await readInbox(user)
  const kuitattavat = nakyvat.filter(e => !ids || ids.includes(e.id)).map(e => e.id)
  if (kuitattavat.length === 0) return 0

  const client = kv()
  await client.sadd(dismissedKey(user), kuitattavat[0], ...kuitattavat.slice(1))
  await client.expire(dismissedKey(user), DISMISSED_TTL_SECONDS)
  return kuitattavat.length
}
