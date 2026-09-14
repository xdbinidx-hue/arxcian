export const CHECKLIST_ID = 'arxcian-albin-checklist-v1'
export const CHECKLIST_GOAL = 'Laadi kolmen kohdan Arxcian-käyttötestilista'
export type Snapshot = {
  id: string | null
  revision: number
  paired: boolean
  goal: string
  status: 'not_started' | 'waiting_input' | 'completed'
  items: string[]
  result: string | null
  nextStep: string
}
export type Command = { id: string; op: 'pair'; token: string } | { id: string; op: 'add'; revision: number; text: string }
export type State = { snapshot: Snapshot | null; syncedAt: number; pending: Command | null; last: { id: string; error: string | null } | null }
export const EMPTY: State = { snapshot: null, syncedAt: 0, pending: null, last: null }
export function allowed(user: string | null): boolean { return user === 'albin' }
export function commandId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(value)
}
export function snapshotView(raw: unknown): Snapshot {
  if (!raw || typeof raw !== 'object') throw new Error('Virheellinen tehtävätila')
  const s = raw as Snapshot
  if (!Number.isSafeInteger(s.revision) || s.revision < 0 || typeof s.paired !== 'boolean' ||
    (s.id !== null && s.id !== CHECKLIST_ID) || s.goal !== CHECKLIST_GOAL ||
    !['not_started', 'waiting_input', 'completed'].includes(s.status) ||
    !Array.isArray(s.items) || s.items.length > 3 || s.items.some(t => typeof t !== 'string' || !t.trim() || t.length > 500) ||
    typeof s.nextStep !== 'string' || s.nextStep.length > 300 || (s.result !== null && (typeof s.result !== 'string' || s.result.length > 1600))) {
    throw new Error('Virheellinen tehtävätila')
  }
  if ((s.status === 'not_started') !== (s.id === null) || (s.status === 'completed') !== (s.items.length === 3)) throw new Error('Ristiriitainen tehtävätila')
  // Ei Telegram-identiteettiä, kytkentäsalaisuutta tai keskustelutietoja selaimeen.
  return { id: s.id, revision: s.revision, paired: s.paired, goal: s.goal, status: s.status, items: s.items, result: s.result, nextStep: s.nextStep }
}
export function publicState(s: State) {
  return { snapshot: s.snapshot, syncedAt: s.syncedAt, pending: s.pending ? { id: s.pending.id, op: s.pending.op } : null, last: s.last }
}
