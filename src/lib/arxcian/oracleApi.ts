import { parseRjMobSelection } from './rjmobView.ts'
import type { SessionUser } from '../session.ts'
import {
  cancelOracleMessage,
  decideOracleApproval,
  enqueueOracleMessage,
  getOracleMessageForOwner,
  oracleMessageView,
  OracleQueueConflictError,
  OracleQueueInputError,
  normalizeOracleSubmission,
  type OracleQueueBackend,
  type OracleQueueDeps,
} from './oracleQueue.ts'

export type OracleSubmitBody = {
  viewContext?: unknown
  prompt?: unknown
  idempotencyKey?: unknown
}

export type OracleApiResult = {
  status: number
  body: Record<string, unknown>
}

export type OracleSubmitDeps = OracleQueueDeps & {
  resolveViewContext?(selection: unknown, user: SessionUser): Promise<unknown>
  currentUser(): Promise<SessionUser | null>
  allowRequest(user: SessionUser): Promise<boolean>
  backend: OracleQueueBackend
}

export type OracleReadDeps = {
  currentUser(): Promise<SessionUser | null>
  backend: OracleQueueBackend
}

export async function decideOracleApprovalRequest(
  deps: OracleReadDeps,
  id: string,
  body: { choice?: unknown },
  updatedAt = Date.now(),
): Promise<OracleApiResult> {
  const user = await deps.currentUser()
  if (!user) return { status: 401, body: { error: 'Kirjautuminen vaaditaan' } }
  if (body.choice !== 'once' && body.choice !== 'deny') {
    return { status: 400, body: { error: 'Hyväksyntävalinta on virheellinen' } }
  }
  try {
    const message = await decideOracleApproval(deps.backend, id, user, body.choice, updatedAt)
    return { status: 200, body: { message: oracleMessageView(message) } }
  } catch (error) {
    if (error instanceof OracleQueueConflictError) {
      return { status: 409, body: { error: error.message } }
    }
    throw error
  }
}

export async function cancelOracleRequest(
  deps: OracleReadDeps,
  id: string,
  queueDeps: Pick<OracleQueueDeps, 'now'> = { now: () => Date.now() },
): Promise<OracleApiResult> {
  const user = await deps.currentUser()
  if (!user) return { status: 401, body: { error: 'Kirjautuminen vaaditaan' } }
  try {
    const message = await cancelOracleMessage(deps.backend, id, user, queueDeps)
    return { status: 200, body: { message: oracleMessageView(message) } }
  } catch (error) {
    if (error instanceof OracleQueueConflictError) {
      return { status: 409, body: { error: error.message } }
    }
    throw error
  }
}

export async function readOracleRequest(
  deps: OracleReadDeps,
  id: string,
): Promise<OracleApiResult> {
  const user = await deps.currentUser()
  if (!user) return { status: 401, body: { error: 'Kirjautuminen vaaditaan' } }
  const message = await getOracleMessageForOwner(deps.backend, id, user)
  if (!message) return { status: 404, body: { error: 'Oracle-viestiä ei löytynyt' } }
  return { status: 200, body: { message: oracleMessageView(message) } }
}

export async function submitOracleRequest(
  deps: OracleSubmitDeps,
  _body: OracleSubmitBody,
): Promise<OracleApiResult> {
  const user = await deps.currentUser()
  if (!user) return { status: 401, body: { error: 'Kirjautuminen vaaditaan' } }
  if (typeof _body.prompt !== 'string' || typeof _body.idempotencyKey !== 'string') {
    return { status: 400, body: { error: 'Viesti tai idempotency-avain on virheellinen.' } }
  }
  try {
    const normalized = normalizeOracleSubmission({
      owner: user,
      prompt: _body.prompt,
      idempotencyKey: _body.idempotencyKey,
    })
    let selection
    if (_body.viewContext !== undefined) {
      try { selection = parseRjMobSelection(_body.viewContext) }
      catch { return { status: 400, body: { error: 'RJ-Mobin näkymävalinta on virheellinen.' } } }
    }
    const idempotencyKey = normalized.idempotencyKey
    const existing = await deps.backend.getByOwnerAndIdempotencyKey(user, idempotencyKey)
    if (existing) {
      if (existing.prompt !== normalized.prompt || JSON.stringify((existing.viewContext as { selection?: unknown } | undefined)?.selection) !== JSON.stringify(selection)) {
        return { status: 409, body: { error: 'Idempotency-avain on jo käytetty eri viestille.' } }
      }
      return { status: 200, body: { created: false, message: oracleMessageView(existing) } }
    }
    if (!(await deps.allowRequest(user))) {
      return { status: 429, body: { error: 'Liikaa pyyntöjä, yritä myöhemmin uudelleen' } }
    }
    if (selection && !deps.resolveViewContext) return { status: 503, body: { error: 'RJ-Mobin näkymätietoja ei voida lukea.' } }
    let viewContext
    if (selection) {
      try { viewContext = await deps.resolveViewContext!(selection, user) }
      catch { return { status: 422, body: { error: 'Valitun RJ-Mob-näkymän tiedot muuttuivat tai niitä ei saatu. Päivitä näkymä ja yritä uudelleen.' } } }
    }
    const result = await enqueueOracleMessage(
      deps.backend,
      {
        ...normalized,
        ...(viewContext === undefined ? {} : { viewContext }),
      },
      deps,
    )
    return {
      status: result.created ? 202 : 200,
      body: { created: result.created, message: oracleMessageView(result.message) },
    }
  } catch (error) {
    if (error instanceof OracleQueueInputError) {
      return { status: 400, body: { error: error.message } }
    }
    if (error instanceof OracleQueueConflictError) {
      return { status: 409, body: { error: error.message } }
    }
    throw error
  }
}
