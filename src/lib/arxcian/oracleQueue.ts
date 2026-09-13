import type { SessionUser } from '../session.ts'

export type OracleMessageStatus =
  | 'queued'
  | 'claimed'
  | 'running'
  | 'waiting_approval'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type OracleApproval = {
  requestId: string
  command: string | null
  description: string | null
  tool: string | null
}

export type OracleApprovalDecision = 'once' | 'deny'

export type OracleApprovalRecord = OracleApproval & {
  decision: OracleApprovalDecision
  decidedAt: number
}

export type OracleEventType =
  | 'tool.started' | 'tool.completed' | 'subagent.start' | 'subagent.complete' | 'message.delta'

export type OracleEventInput = {
  sourceId: string
  type: OracleEventType
  tool: string | null
  preview: string | null
  error: boolean
}

export type OracleEvent = OracleEventInput & {
  sequence: number
  createdAt: number
}

export type OracleUiAction = { action: 'navigate'; href: string; label: string }
export type OracleUiProposal = { id: string; tool: string; summary: string }
export type OracleCompletionUi = {
  action: OracleUiAction | null
  proposal: OracleUiProposal | null
}

export type OracleMessage = {
  id: string
  owner: SessionUser
  prompt: string
  idempotencyKey: string
  status: OracleMessageStatus
  sessionId: string | null
  runId: string | null
  claimToken: string | null
  terminalClaimToken?: string | null
  leaseUntil: number | null
  answer: string | null
  error: string | null
  action?: OracleUiAction | null
  proposal?: OracleUiProposal | null
  completionUiJson?: string | null
  approval?: OracleApproval | null
  approvalDecision?: OracleApprovalDecision | null
  approvalHistory?: OracleApprovalRecord[]
  sequence?: number
  events?: OracleEvent[]
  /**
   * Oraclen tähänastinen striimattu vastausteksti kumulatiivisena
   * kokonaisuutena, ei tapahtumaketjuna. Oma kenttä eikä jaettu
   * events-rengas juuri siksi ettei se koskaan häviä: rengas rajataan 100
   * viimeisimpään tapahtumaan, ja työkalu-/aliagenttitapahtumat olisivat
   * hävittäneet vastauksen alun kesken pitkän ajon (ks. bridge-lib.mjs:n
   * delta-koalesointi, joka kirjoittaa tämän kentän aina kokonaisena eikä
   * lisäyksenä).
   */
  liveAnswer?: string | null
  createdAt: number
  updatedAt: number
}

export type OracleEventView = Omit<OracleEvent, 'sourceId' | 'preview'>

export type OracleMessageView = Pick<
  OracleMessage,
  'id' | 'status' | 'answer' | 'error' | 'approval' | 'approvalDecision' | 'action' | 'proposal' | 'createdAt' | 'updatedAt'
> & { sequence: number; events: OracleEventView[]; liveAnswer: string | null }

export function oracleMessageView(message: OracleMessage): OracleMessageView {
  return {
    id: message.id,
    status: message.status,
    answer: message.answer,
    error: message.status === 'failed' ? 'Oracle-tehtävä epäonnistui.' : null,
    approval: message.approval ?? null,
    approvalDecision: message.approvalDecision ?? null,
    action: message.action ?? null,
    proposal: message.proposal ?? null,
    sequence: message.sequence ?? 0,
    liveAnswer: message.liveAnswer ?? null,
    events: (message.events ?? []).map(({ sourceId: _sourceId, preview: _preview, ...event }) => event),
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  }
}

export type EnqueueOracleInput = {
  owner: SessionUser
  prompt: string
  idempotencyKey: string
  sessionId?: string | null
}

export type OracleQueueBackend = {
  getOwnerSession(owner: SessionUser): Promise<string | null>
  getByOwnerAndIdempotencyKey(owner: SessionUser, idempotencyKey: string): Promise<OracleMessage | null>
  insertIfAbsent(message: OracleMessage): Promise<{ created: boolean; message: OracleMessage }>
  claimNext(now: number, claimToken: string, leaseUntil: number): Promise<OracleMessage | null>
  markRunning(
    id: string,
    claimToken: string,
    runId: string,
    updatedAt: number,
    leaseUntil: number,
  ): Promise<OracleMessage | null>
  complete(
    id: string,
    claimToken: string,
    answer: string,
    updatedAt: number,
    sessionId: string | null,
    ui?: OracleCompletionUi,
  ): Promise<OracleMessage | null>
  fail(id: string, claimToken: string, error: string, updatedAt: number): Promise<OracleMessage | null>
  cancel(id: string, owner: SessionUser, updatedAt: number): Promise<OracleMessage | null>
  confirmCancellation(id: string, claimToken: string, updatedAt: number): Promise<OracleMessage | null>
  requestApproval(id: string, claimToken: string, approval: OracleApproval, updatedAt: number): Promise<OracleMessage | null>
  decideApproval(id: string, owner: SessionUser, decision: OracleApprovalDecision, updatedAt: number): Promise<OracleMessage | null>
  resumeAfterApproval(id: string, claimToken: string, requestId: string, updatedAt: number): Promise<OracleMessage | null>
  appendEvent(id: string, claimToken: string, event: OracleEventInput, updatedAt: number): Promise<OracleMessage | null>
  get(id: string): Promise<OracleMessage | null>
}

export type OracleQueueDeps = {
  now(): number
  id(): string
}

const DEFAULT_DEPS: OracleQueueDeps = {
  now: () => Date.now(),
  id: () => crypto.randomUUID(),
}

export class OracleQueueInputError extends Error {}
export class OracleQueueConflictError extends Error {}

export function normalizeOracleSubmission(input: EnqueueOracleInput): EnqueueOracleInput {
  const prompt = input.prompt.trim()
  if (!prompt) throw new OracleQueueInputError('Viesti puuttuu.')
  if (prompt.length > 12_000) throw new OracleQueueInputError('Viesti saa olla enintään 12000 merkkiä.')
  const idempotencyKey = input.idempotencyKey.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotencyKey)) {
    throw new OracleQueueInputError('Idempotency-avain on virheellinen.')
  }
  return { ...input, prompt, idempotencyKey }
}

export async function enqueueOracleMessage(
  backend: OracleQueueBackend,
  input: EnqueueOracleInput,
  deps: OracleQueueDeps = DEFAULT_DEPS,
): Promise<{ created: boolean; message: OracleMessage }> {
  const normalized = normalizeOracleSubmission(input)
  const { prompt, idempotencyKey } = normalized
  const now = deps.now()
  const sessionId = await backend.getOwnerSession(input.owner)
  const result = await backend.insertIfAbsent({
    id: deps.id(),
    owner: input.owner,
    prompt,
    idempotencyKey,
    status: 'queued',
    sessionId,
    runId: null,
    claimToken: null,
    terminalClaimToken: null,
    leaseUntil: null,
    answer: null,
    error: null,
    action: null,
    proposal: null,
    completionUiJson: null,
    approval: null,
    approvalDecision: null,
    approvalHistory: [],
    sequence: 0,
    events: [],
    createdAt: now,
    updatedAt: now,
  })
  if (!result.created && result.message.prompt !== prompt) {
    throw new OracleQueueConflictError('Idempotency-avain on jo käytetty eri viestille.')
  }
  return result
}

export async function claimNextOracleMessage(
  backend: OracleQueueBackend,
  deps: OracleQueueDeps = DEFAULT_DEPS,
  leaseMs = 30_000,
): Promise<OracleMessage | null> {
  const now = deps.now()
  return backend.claimNext(now, deps.id(), now + leaseMs)
}

export async function completeOracleMessage(
  backend: OracleQueueBackend,
  id: string,
  claimToken: string,
  answer: string,
  updatedAt = Date.now(),
  sessionId: string | null = null,
  ui?: OracleCompletionUi,
): Promise<OracleMessage> {
  const completed = await backend.complete(id, claimToken, answer, updatedAt, sessionId, ui)
  if (!completed) throw new OracleQueueConflictError('Oracle-viestin lunastus ei ole enää voimassa.')
  return completed
}

export async function markOracleMessageRunning(
  backend: OracleQueueBackend,
  id: string,
  claimToken: string,
  runId: string,
  updatedAt = Date.now(),
  leaseMs = 2 * 60 * 60_000,
): Promise<OracleMessage> {
  const running = await backend.markRunning(id, claimToken, runId, updatedAt, updatedAt + leaseMs)
  if (!running) throw new OracleQueueConflictError('Oracle-viestin lunastus ei ole enää voimassa.')
  return running
}

export async function failOracleMessage(
  backend: OracleQueueBackend,
  id: string,
  claimToken: string,
  error: string,
  updatedAt = Date.now(),
): Promise<OracleMessage> {
  const failed = await backend.fail(id, claimToken, error, updatedAt)
  if (!failed) throw new OracleQueueConflictError('Oracle-viestin lunastus ei ole enää voimassa.')
  return failed
}

export async function cancelOracleMessage(
  backend: OracleQueueBackend,
  id: string,
  owner: SessionUser,
  deps: Pick<OracleQueueDeps, 'now'> = DEFAULT_DEPS,
): Promise<OracleMessage> {
  const cancelled = await backend.cancel(id, owner, deps.now())
  if (!cancelled) throw new OracleQueueConflictError('Oracle-viestiä ei voi keskeyttää.')
  return cancelled
}

export async function confirmOracleCancellation(
  backend: OracleQueueBackend,
  id: string,
  claimToken: string,
  updatedAt = Date.now(),
): Promise<OracleMessage> {
  const cancelled = await backend.confirmCancellation(id, claimToken, updatedAt)
  if (!cancelled) throw new OracleQueueConflictError('Oracle-keskeytyksen lunastus ei ole enää voimassa.')
  return cancelled
}

export async function recordOracleApprovalRequest(
  backend: OracleQueueBackend,
  id: string,
  claimToken: string,
  approval: OracleApproval,
  updatedAt = Date.now(),
): Promise<OracleMessage> {
  if (!approval.requestId || approval.requestId.length > 256) {
    throw new OracleQueueInputError('Hyväksyntäpyynnön tunniste on virheellinen.')
  }
  const bounded = (value: unknown, max: number) => value === null || (typeof value === 'string' && value.length <= max)
  if (!bounded(approval.command, 16_000)
    || !bounded(approval.description, 2_000)
    || !bounded(approval.tool, 256)) {
    throw new OracleQueueInputError('Hyväksyntäpyynnön sisältö on liian pitkä tai virheellinen.')
  }
  const exactAction = [approval.command, approval.description]
    .some(value => typeof value === 'string' && value.trim().length > 0)
  if (!exactAction) {
    throw new OracleQueueInputError('Hyväksyntäpyynnöstä puuttuu täsmällinen toimi.')
  }
  const waiting = await backend.requestApproval(id, claimToken, approval, updatedAt)
  if (!waiting) throw new OracleQueueConflictError('Oracle-hyväksyntäpyyntö ei ole enää voimassa.')
  return waiting
}

// message.delta kantaa koko siihenastisen kumulatiivisen vastaustekstin, ei
// yhtä tokenia — siksi sillä on oma, isompi katto kuin muiden tapahtumien
// sisäisellä esikatselulla (ks. liveAnswer OracleMessage.ts:ssä).
const LIVE_ANSWER_MAX_LENGTH = 20_000
const EVENT_PREVIEW_MAX_LENGTH = 2_000

export async function recordOracleEvent(
  backend: OracleQueueBackend,
  id: string,
  claimToken: string,
  event: OracleEventInput,
  updatedAt = Date.now(),
): Promise<OracleMessage> {
  const previewMax = event.type === 'message.delta' ? LIVE_ANSWER_MAX_LENGTH : EVENT_PREVIEW_MAX_LENGTH
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(event.sourceId)
    || !['tool.started', 'tool.completed', 'subagent.start', 'subagent.complete', 'message.delta'].includes(event.type)
    || (event.tool !== null && (typeof event.tool !== 'string' || event.tool.length > 256))
    || (event.preview !== null && (typeof event.preview !== 'string' || event.preview.length > previewMax))
    || typeof event.error !== 'boolean') {
    throw new OracleQueueInputError('Oracle-tapahtuma on virheellinen.')
  }
  const updated = await backend.appendEvent(id, claimToken, event, updatedAt)
  if (!updated) throw new OracleQueueConflictError('Oracle-tapahtumaa ei voi tallentaa.')
  return updated
}

export async function decideOracleApproval(
  backend: OracleQueueBackend,
  id: string,
  owner: SessionUser,
  decision: OracleApprovalDecision,
  updatedAt = Date.now(),
): Promise<OracleMessage> {
  const decided = await backend.decideApproval(id, owner, decision, updatedAt)
  if (!decided) throw new OracleQueueConflictError('Oracle-hyväksyntää ei voi ratkaista.')
  return decided
}

export async function resumeOracleMessageAfterApproval(
  backend: OracleQueueBackend,
  id: string,
  claimToken: string,
  requestId: string,
  updatedAt = Date.now(),
): Promise<OracleMessage> {
  const resumed = await backend.resumeAfterApproval(id, claimToken, requestId, updatedAt)
  if (!resumed) throw new OracleQueueConflictError('Oracle-hyväksyntä ei ole enää voimassa.')
  return resumed
}

export async function getOracleMessageForOwner(
  backend: OracleQueueBackend,
  id: string,
  owner: SessionUser,
): Promise<OracleMessage | null> {
  const message = await backend.get(id)
  return message?.owner === owner ? message : null
}

export function createMemoryOracleBackend(initial: OracleMessage[] = []) {
  const messages = initial.map(message => ({ ...message }))
  const ownerSessions = new Map<SessionUser, string>()
  for (const message of messages) {
    if (message.status === 'completed' && message.sessionId) ownerSessions.set(message.owner, message.sessionId)
  }
  const backend: OracleQueueBackend & { snapshot(): OracleMessage[] } = {
    async getOwnerSession(owner) {
      return ownerSessions.get(owner) ?? null
    },
    async getByOwnerAndIdempotencyKey(owner, idempotencyKey) {
      const message = messages.find(item => item.owner === owner && item.idempotencyKey === idempotencyKey)
      return message ? { ...message } : null
    },
    async insertIfAbsent(message) {
      const existing = messages.find(
        item => item.owner === message.owner && item.idempotencyKey === message.idempotencyKey,
      )
      if (existing) return { created: false, message: { ...existing } }
      messages.push({ ...message })
      return { created: true, message: { ...message } }
    },
    async claimNext(now, claimToken, leaseUntil) {
      const blockedOwners = new Set<SessionUser>()
      let message: OracleMessage | undefined
      for (const item of [...messages].sort((left, right) => left.createdAt - right.createdAt)) {
        const active = ['claimed', 'running', 'waiting_approval', 'cancelling'].includes(item.status)
        const expired = active && item.leaseUntil !== null && item.leaseUntil < now
        if (active && !expired) {
          blockedOwners.add(item.owner)
          continue
        }
        if (expired || (item.status === 'queued' && !blockedOwners.has(item.owner))) {
          message = item
          break
        }
      }
      if (!message) return null
      if (message.status !== 'cancelling') message.status = 'claimed'
      message.claimToken = claimToken
      message.leaseUntil = leaseUntil
      message.sessionId = ownerSessions.get(message.owner) ?? null
      message.updatedAt = now
      return { ...message }
    },
    async markRunning(id, claimToken, runId, updatedAt, leaseUntil) {
      const message = messages.find(item => item.id === id)
      if (!message || message.claimToken !== claimToken
        || !['claimed', 'cancelling'].includes(message.status)) return null
      if (message.status !== 'cancelling') message.status = 'running'
      message.runId = runId
      message.leaseUntil = leaseUntil
      message.updatedAt = updatedAt
      return { ...message }
    },
    async complete(id, claimToken, answer, updatedAt, sessionId, ui) {
      const message = messages.find(item => item.id === id)
      const normalizedUi: OracleCompletionUi = {
        action: ui?.action ?? null,
        proposal: ui?.proposal ?? null,
      }
      const completionUiJson = JSON.stringify(normalizedUi)
      if (message?.status === 'completed'
        && message.terminalClaimToken === claimToken
        && message.answer === answer
        && message.completionUiJson === completionUiJson
        && message.sessionId === sessionId) return { ...message }
      if (!message || message.claimToken !== claimToken || !['claimed', 'running'].includes(message.status)) return null
      message.status = 'completed'
      message.answer = answer
      message.action = normalizedUi.action
      message.proposal = normalizedUi.proposal
      message.completionUiJson = completionUiJson
      message.sessionId = sessionId ?? message.sessionId
      if (message.sessionId) ownerSessions.set(message.owner, message.sessionId)
      message.terminalClaimToken = claimToken
      message.claimToken = null
      message.leaseUntil = null
      message.updatedAt = updatedAt
      return { ...message }
    },
    async fail(id, claimToken, error, updatedAt) {
      const message = messages.find(item => item.id === id)
      if (message?.status === 'failed'
        && message.terminalClaimToken === claimToken
        && message.error === error) return { ...message }
      if (!message || message.claimToken !== claimToken
        || !['claimed', 'running', 'waiting_approval'].includes(message.status)) return null
      message.status = 'failed'
      message.error = error
      message.terminalClaimToken = claimToken
      message.claimToken = null
      message.leaseUntil = null
      message.updatedAt = updatedAt
      return { ...message }
    },
    async cancel(id, owner, updatedAt) {
      const message = messages.find(item => item.id === id)
      if (!message || message.owner !== owner || ['completed', 'failed'].includes(message.status)) {
        return null
      }
      if (message.status === 'cancelled' || message.status === 'cancelling') return { ...message }
      if (message.status === 'queued') {
        message.status = 'cancelled'
        message.claimToken = null
        message.leaseUntil = null
      } else {
        message.status = 'cancelling'
      }
      message.updatedAt = updatedAt
      return { ...message }
    },
    async confirmCancellation(id, claimToken, updatedAt) {
      const message = messages.find(item => item.id === id)
      if (!message || message.status !== 'cancelling' || message.claimToken !== claimToken) return null
      message.status = 'cancelled'
      message.claimToken = null
      message.leaseUntil = null
      message.updatedAt = updatedAt
      return { ...message }
    },
    async requestApproval(id, claimToken, approval, updatedAt) {
      const message = messages.find(item => item.id === id)
      if (!message || message.claimToken !== claimToken
        || !['running', 'waiting_approval'].includes(message.status)) return null
      if (message.approval && (
        message.approval.requestId !== approval.requestId
        || message.approval.command !== approval.command
        || message.approval.description !== approval.description
        || message.approval.tool !== approval.tool
      )) return null
      const isFirstRequest = !message.approval
      message.status = 'waiting_approval'
      message.approval = { ...approval }
      if (isFirstRequest) message.approvalDecision = null
      message.updatedAt = updatedAt
      return { ...message, approval: { ...approval } }
    },
    async decideApproval(id, owner, decision, updatedAt) {
      const message = messages.find(item => item.id === id)
      if (!message || message.owner !== owner || message.status !== 'waiting_approval'
        || !message.approval) return null
      if (message.approvalDecision === decision) return { ...message, approval: { ...message.approval } }
      if (message.approvalDecision) return null
      message.approvalDecision = decision
      message.updatedAt = updatedAt
      return { ...message, approval: { ...message.approval } }
    },
    async resumeAfterApproval(id, claimToken, requestId, updatedAt) {
      const message = messages.find(item => item.id === id)
      if (message?.status === 'running' && message.claimToken === claimToken
        && message.approvalHistory?.some(existing => existing.requestId === requestId)) return { ...message }
      if (!message || message.claimToken !== claimToken || message.status !== 'waiting_approval'
        || message.approval?.requestId !== requestId || !message.approvalDecision) return null
      message.status = 'running'
      message.approvalHistory = [...(message.approvalHistory ?? []), {
        ...message.approval,
        decision: message.approvalDecision,
        decidedAt: updatedAt,
      }]
      message.approval = null
      message.approvalDecision = null
      message.updatedAt = updatedAt
      return { ...message }
    },
    async appendEvent(id, claimToken, event, updatedAt) {
      const message = messages.find(item => item.id === id)
      if (!message || message.claimToken !== claimToken
        || !['claimed', 'running', 'waiting_approval'].includes(message.status)) return null
      if (event.type === 'message.delta') {
        // Kumulatiivinen vastausteksti korvaa oman kenttänsä kokonaan eikä
        // koskaan kulje 100 tapahtuman renkaan kautta — muuten pitkän ajon
        // työkalutapahtumat häätäisivät vastauksen alun pois ennen kuin ajo
        // valmistuu.
        if (typeof event.preview === 'string' && event.preview !== message.liveAnswer) {
          message.liveAnswer = event.preview
          message.updatedAt = updatedAt
        }
        return { ...message, events: (message.events ?? []).map(item => ({ ...item })) }
      }
      if ((message.events ?? []).some(item => item.sourceId === event.sourceId)) {
        return { ...message, events: (message.events ?? []).map(item => ({ ...item })) }
      }
      const sequence = (message.sequence ?? 0) + 1
      const events = [...(message.events ?? []), { ...event, sequence, createdAt: updatedAt }].slice(-100)
      message.sequence = sequence
      message.events = events
      message.updatedAt = updatedAt
      return { ...message, events: events.map(item => ({ ...item })) }
    },
    async get(id) {
      const message = messages.find(item => item.id === id)
      return message ? { ...message } : null
    },
    snapshot() {
      return messages.map(message => ({ ...message }))
    },
  }
  return backend
}
