import { readCached, writeCached } from '../cache'

/**
 * Avustajan tekemien kirjoitustoimien loki.
 *
 * Avustaja on ainoa paikka jossa tietue voi syntyä ilman että käyttäjä on
 * täyttänyt lomaketta, joten jokainen suoritettu toimi kirjataan — myös
 * epäonnistunut. Ilman lokia väärästä ehdotuksesta syntynyttä tietuetta ei
 * voisi jäljittää jälkikäteen.
 *
 * Lista on yksi Redis-avain eikä varsinainen Redis-lista, koska cache.ts
 * tarjoaa vain get/set/del ja sama luku-muokkaa-kirjoita -malli on käytössä
 * muistiinpanoissa, tavoitteissa ja hälytyksissä. Kaksi täsmälleen samanaikaista
 * kirjausta voisi hukata toisen; vahvistukset ovat käsin tehtyjä ja käyttäjiä
 * kaksi, joten riski on olematon eikä sen takia kannata rakentaa lukitusta.
 */

export type AuditEntry = {
  /** Unix ms */
  at: number
  user: string
  tool: string
  summary: string
  ok: boolean
}

const CACHE_KEY = 'assistant:audit'
const TTL_SECONDS = 5 * 365 * 24 * 60 * 60
const MAX_ENTRIES = 200

/** Uusin ensin. Lisääminen ei koskaan heitä: loki on sivuvaikutus, ei toimen ehto. */
export async function appendAudit(entry: AuditEntry): Promise<void> {
  const cached = await readCached<AuditEntry[]>(CACHE_KEY)
  const entries = [entry, ...(cached?.data ?? [])].slice(0, MAX_ENTRIES)
  await writeCached(CACHE_KEY, entries, TTL_SECONDS, 0)
}

/** Viimeisimmät kirjaukset uusin ensin. Käyttöliittymää ei vielä ole. */
export async function readAudit(n = 50): Promise<AuditEntry[]> {
  const cached = await readCached<AuditEntry[]>(CACHE_KEY)
  return (cached?.data ?? []).slice(0, Math.max(1, n))
}
