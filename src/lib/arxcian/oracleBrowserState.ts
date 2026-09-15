export type OracleSubmissionDraft = {
  viewContext?: unknown
  prompt: string
  idempotencyKey: string
}

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/
const ORACLE_PENDING_STORAGE_KEY = 'arxcian:oracle:pending'
const ORACLE_SUBMISSION_STORAGE_KEY = 'arxcian:oracle:submission'

type StorageRemover = { removeItem(key: string): void }

export function oraclePendingStorageKey(user: string): string {
  return `${ORACLE_PENDING_STORAGE_KEY}:${user}`
}

export function oracleSubmissionStorageKey(user: string): string {
  return `${ORACLE_SUBMISSION_STORAGE_KEY}:${user}`
}

export function clearOracleBrowserState(user: string, local: StorageRemover, session: StorageRemover): void {
  local.removeItem(oraclePendingStorageKey(user))
  local.removeItem(oracleSubmissionStorageKey(user))
  session.removeItem(oracleSubmissionStorageKey(user))
}

export function parseOracleSubmissionDraft(raw: string | null): OracleSubmissionDraft | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<OracleSubmissionDraft>
    if (typeof value.prompt !== 'string' || !value.prompt.trim() || value.prompt.length > 12_000) return null
    if (typeof value.idempotencyKey !== 'string' || !IDEMPOTENCY_PATTERN.test(value.idempotencyKey)) return null
    return { prompt: value.prompt, idempotencyKey: value.idempotencyKey, ...(value.viewContext === undefined ? {} : { viewContext: value.viewContext }) }
  } catch {
    return null
  }
}

export function isOracleQueueEnabled(value: string | undefined): boolean {
  return value !== 'false'
}

export function shouldRestoreOracleWatch(
  open: boolean,
  pendingId: string | null,
  activeRequest: { aborted: boolean } | null,
): boolean {
  return open && Boolean(pendingId) && (!activeRequest || activeRequest.aborted)
}
