import { readCached, writeCached } from '../cache'
import type { UserId } from '@/lib/session'

/**
 * Push-tilausten tallennus.
 *
 * **Tilaus on laitekohtainen, ei käyttäjäkohtainen.** Sama käyttäjä voi olla
 * kirjautuneena puhelimessa ja koneella, ja selain antaa kummallekin oman
 * `endpoint`in. Yhden tilauksen malli tarkoittaisi että viimeisin laite
 * syrjäyttäisi edellisen hiljaa — ilmoitukset lakkaisivat tulemasta
 * puhelimeen sillä hetkellä kun avaat arxcianin koneella.
 *
 * Avain on `endpoint`, koska se on ainoa arvo jonka selain lupaa pysyvän
 * samana: sama laite ja sama selain palauttaa saman endpointin uudelleen
 * tilatessaan, jolloin päivitys korvaa eikä kahdenna.
 *
 * Tilaukset ovat käyttäjäkohtaisen avaimen takana eivätkä yhtenä listana
 * `owner`-kentällä. Lähetys tapahtuu aina "kenelle", ei "mille", joten
 * `visibleTo`-suodatus olisi ylimääräinen kierros joka kutsulla.
 */

export type PushSubscriptionRecord = {
  endpoint: string
  keys: { p256dh: string; auth: string }
  /** Karkea laitteen tunniste käyttöliittymän listaa varten, esim. "iPhone · Safari". */
  label: string
  createdAt: number
  /** Viimeisin onnistunut lähetys. Null jos ei ole vielä lähetetty mitään. */
  lastSentAt: number | null
}

// Tilaus ei vanhene itsestään: selain pitää sen voimassa kunnes käyttäjä
// peruu luvan tai poistaa sovelluksen, ja kuolleet siivotaan lähetyksen
// yhteydessä 404/410-vastauksen perusteella. Aikaan sidottu vanheneminen
// katkaisisi ilmoitukset laitteelta jota käytetään harvoin mutta joka toimii.
const TTL_SECONDS = 5 * 365 * 24 * 60 * 60
const MAX_PER_USER = 10

function key(user: UserId): string {
  return `push:subs:${user}`
}

export async function getSubscriptions(user: UserId): Promise<PushSubscriptionRecord[]> {
  const cached = await readCached<PushSubscriptionRecord[]>(key(user))
  return cached?.data ?? []
}

async function save(user: UserId, subs: PushSubscriptionRecord[]): Promise<void> {
  await writeCached(key(user), subs, TTL_SECONDS, 0)
}

/**
 * Lisää tai päivittää tilauksen.
 *
 * Sama endpoint korvataan eikä lisätä toiseen kertaan: selain kutsuu
 * `pushManager.subscribe`a joka käynnistyksellä, ja ilman korvausta lista
 * kasvaisi samasta laitteesta niin monta riviä kuin sovellus on avattu.
 */
export async function addSubscription(
  user: UserId,
  input: { endpoint: string; keys: { p256dh: string; auth: string }; label: string },
): Promise<PushSubscriptionRecord[]> {
  const current = await getSubscriptions(user)
  const existing = current.find(s => s.endpoint === input.endpoint)

  const record: PushSubscriptionRecord = {
    endpoint: input.endpoint,
    keys: input.keys,
    label: input.label.slice(0, 60),
    // Luontihetki säilyy päivityksessä — se kertoo milloin laite otettiin
    // käyttöön, ei milloin sovellus viimeksi avattiin.
    createdAt: existing?.createdAt ?? Date.now(),
    lastSentAt: existing?.lastSentAt ?? null,
  }

  const updated = [record, ...current.filter(s => s.endpoint !== input.endpoint)].slice(
    0,
    MAX_PER_USER,
  )
  await save(user, updated)
  return updated
}

export async function removeSubscription(
  user: UserId,
  endpoint: string,
): Promise<PushSubscriptionRecord[]> {
  const current = await getSubscriptions(user)
  const updated = current.filter(s => s.endpoint !== endpoint)
  if (updated.length !== current.length) await save(user, updated)
  return updated
}

/**
 * Merkitsee onnistuneet ja poistaa kuolleet yhdellä kirjoituksella.
 *
 * Lähettäjä kutsuu tätä kerran erän jälkeen eikä kerran per tilaus: erässä on
 * korkeintaan kymmenen tilausta, ja kymmenen erillistä luku–muokkaa–kirjoita
 * -kierrosta samaan avaimeen kadottaisi osan muutoksista.
 */
export async function reconcileSubscriptions(
  user: UserId,
  result: { delivered: string[]; dead: string[] },
): Promise<void> {
  if (result.delivered.length === 0 && result.dead.length === 0) return

  const now = Date.now()
  const current = await getSubscriptions(user)
  const updated = current
    .filter(s => !result.dead.includes(s.endpoint))
    .map(s => (result.delivered.includes(s.endpoint) ? { ...s, lastSentAt: now } : s))

  await save(user, updated)
}
