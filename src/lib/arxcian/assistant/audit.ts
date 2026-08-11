import { readCached, writeCached } from '../cache'
import type { SessionUser } from '@/lib/session'

/**
 * Avustajan tekemien kirjoitustoimien loki.
 *
 * Avustaja on ainoa paikka jossa tietue voi syntyä ilman että käyttäjä on
 * täyttänyt lomaketta, joten jokainen suoritettu toimi kirjataan — myös
 * epäonnistunut. Ilman lokia väärästä ehdotuksesta syntynyttä tietuetta ei
 * voisi jäljittää jälkikäteen.
 *
 * Loki on **käyttäjäkohtainen** (assistant:actions:<käyttäjä>). Yhteinen avain
 * olisi tarkoittanut että kahden käyttäjän kirjaukset kilpailevat samasta
 * luku-muokkaa-kirjoita -kierroksesta, ja että toisen lokin lukeminen näyttäisi
 * myös toisen toimet — arxcianissa henkilökohtainen data on muutenkin eroteltu
 * omistajan mukaan.
 *
 * Lista on yksi Redis-avain eikä varsinainen Redis-lista, koska cache.ts
 * tarjoaa vain get/set/del ja sama luku-muokkaa-kirjoita -malli on käytössä
 * muistiinpanoissa, tavoitteissa ja hälytyksissä.
 */

export type AuditEntry = {
  /** Unix ms */
  at: number
  user: SessionUser
  tool: string
  summary: string
  ok: boolean
}

function auditKey(user: SessionUser): string {
  return `assistant:actions:${user}`
}

const TTL_SECONDS = 5 * 365 * 24 * 60 * 60
const MAX_ENTRIES = 200

/** Uusin ensin. Lisääminen ei koskaan heitä: loki on sivuvaikutus, ei toimen ehto. */
export async function appendAudit(entry: AuditEntry): Promise<void> {
  const key = auditKey(entry.user)
  const cached = await readCached<AuditEntry[]>(key)
  const entries = [entry, ...(cached?.data ?? [])].slice(0, MAX_ENTRIES)
  await writeCached(key, entries, TTL_SECONDS, 0)
}

/** Viimeisimmät kirjaukset uusin ensin. Käyttöliittymää ei vielä ole. */
export async function readAudit(user: SessionUser, n = 50): Promise<AuditEntry[]> {
  const cached = await readCached<AuditEntry[]>(auditKey(user))
  return (cached?.data ?? []).slice(0, Math.max(1, n))
}
