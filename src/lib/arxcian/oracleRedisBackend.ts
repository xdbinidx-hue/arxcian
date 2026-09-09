import type { OracleMessage, OracleQueueBackend } from './oracleQueue.ts'

export type OracleRedisClient = {
  eval<T>(script: string, keys: string[], args: string[]): Promise<T>
  get<T>(key: string): Promise<T | null>
}

const PREFIX = 'arxcian:oracle:'
const MESSAGE_TTL_SECONDS = 7 * 24 * 60 * 60

const INSERT_IF_ABSENT = `
local existingId = redis.call('GET', KEYS[2])
if existingId then
  local existing = redis.call('GET', '${PREFIX}message:' .. existingId)
  if existing then return {0, existing} end
  redis.call('DEL', KEYS[2])
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
redis.call('ZADD', KEYS[3], ARGV[4], ARGV[2])
return {1, ARGV[1]}
`

const CLAIM_NEXT = `
local ids = redis.call('ZRANGE', KEYS[1], 0, -1)
local blockedOwners = {}
for _, id in ipairs(ids) do
  local key = '${PREFIX}message:' .. id
  local raw = redis.call('GET', key)
  if not raw then
    redis.call('ZREM', KEYS[1], id)
  else
    local message = cjson.decode(raw)
    local expired = (message.status == 'claimed' or message.status == 'running'
      or message.status == 'waiting_approval' or message.status == 'cancelling')
      and message.leaseUntil ~= cjson.null
      and tonumber(message.leaseUntil) < tonumber(ARGV[1])
    local active = message.status == 'claimed' or message.status == 'running'
      or message.status == 'waiting_approval' or message.status == 'cancelling'
    if active and not expired then
      blockedOwners[message.owner] = true
    elseif expired or (message.status == 'queued' and not blockedOwners[message.owner]) then
      if message.status ~= 'cancelling' then message.status = 'claimed' end
      message.claimToken = ARGV[2]
      message.leaseUntil = tonumber(ARGV[3])
      local ownerSession = redis.call('GET', '${PREFIX}owner-session:' .. message.owner)
      if ownerSession then message.sessionId = ownerSession else message.sessionId = cjson.null end
      message.updatedAt = tonumber(ARGV[1])
      local updated = cjson.encode(message)
      redis.call('SET', key, updated, 'EX', ARGV[4])
      return updated
    end
  end
end
return nil
`

const COMPLETE = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local message = cjson.decode(raw)
if message.status == 'completed' then
  if message.terminalClaimToken == ARGV[1] and message.answer == ARGV[2]
    and message.completionUiJson == ARGV[5]
    and ((ARGV[4] == '' and message.sessionId == cjson.null)
      or message.sessionId == ARGV[4]) then return raw end
  return nil
end
if (message.status ~= 'claimed' and message.status ~= 'running') or message.claimToken ~= ARGV[1] then
  return nil
end
message.status = 'completed'
message.answer = ARGV[2]
local ui = cjson.decode(ARGV[5])
message.action = ui.action
message.proposal = ui.proposal
message.completionUiJson = ARGV[5]
message.error = cjson.null
message.terminalClaimToken = ARGV[1]
message.claimToken = cjson.null
message.leaseUntil = cjson.null
message.updatedAt = tonumber(ARGV[3])
if ARGV[4] ~= '' then
  message.sessionId = ARGV[4]
  redis.call('SET', '${PREFIX}owner-session:' .. message.owner, ARGV[4], 'EX', ARGV[6])
end
local updated = cjson.encode(message)
redis.call('SET', KEYS[1], updated, 'EX', ARGV[6])
redis.call('ZREM', KEYS[2], ARGV[7])
return updated
`

const MARK_RUNNING = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local message = cjson.decode(raw)
if (message.status ~= 'claimed' and message.status ~= 'cancelling')
  or message.claimToken ~= ARGV[1] then return nil end
if message.status ~= 'cancelling' then message.status = 'running' end
message.runId = ARGV[2]
message.updatedAt = tonumber(ARGV[3])
message.leaseUntil = tonumber(ARGV[4])
local updated = cjson.encode(message)
redis.call('SET', KEYS[1], updated, 'EX', ARGV[5])
return updated
`

const FAIL = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local message = cjson.decode(raw)
if message.status == 'failed' then
  if message.terminalClaimToken == ARGV[1] and message.error == ARGV[2] then return raw end
  return nil
end
if (message.status ~= 'claimed' and message.status ~= 'running' and message.status ~= 'waiting_approval')
  or message.claimToken ~= ARGV[1] then
  return nil
end
message.status = 'failed'
message.error = ARGV[2]
message.terminalClaimToken = ARGV[1]
message.claimToken = cjson.null
message.leaseUntil = cjson.null
message.updatedAt = tonumber(ARGV[3])
local updated = cjson.encode(message)
redis.call('SET', KEYS[1], updated, 'EX', ARGV[4])
redis.call('ZREM', KEYS[2], ARGV[5])
return updated
`

const CANCEL = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local message = cjson.decode(raw)
if message.owner ~= ARGV[1]
  or message.status == 'completed'
  or message.status == 'failed' then
  return nil
end
if message.status == 'cancelled' or message.status == 'cancelling' then return raw end
if message.status == 'queued' then
  message.status = 'cancelled'
  message.claimToken = cjson.null
  message.leaseUntil = cjson.null
  redis.call('ZREM', KEYS[2], ARGV[4])
else
  message.status = 'cancelling'
end
message.updatedAt = tonumber(ARGV[2])
local updated = cjson.encode(message)
redis.call('SET', KEYS[1], updated, 'EX', ARGV[3])
return updated
`

const CONFIRM_CANCELLATION = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local message = cjson.decode(raw)
if message.status == 'cancelled' and message.terminalClaimToken == ARGV[1] then return raw end
if message.status ~= 'cancelling' or message.claimToken ~= ARGV[1] then return nil end
message.status = 'cancelled'
message.terminalClaimToken = ARGV[1]
message.claimToken = cjson.null
message.leaseUntil = cjson.null
message.updatedAt = tonumber(ARGV[2])
local updated = cjson.encode(message)
redis.call('SET', KEYS[1], updated, 'EX', ARGV[3])
redis.call('ZREM', KEYS[2], ARGV[4])
return updated
`

const REQUEST_APPROVAL = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local message = cjson.decode(raw)
if message.claimToken ~= ARGV[1]
  or (message.status ~= 'running' and message.status ~= 'waiting_approval') then return nil end
local approval = cjson.decode(ARGV[2])
if message.approval ~= nil and message.approval ~= cjson.null
  and (message.approval.requestId ~= approval.requestId
    or message.approval.command ~= approval.command
    or message.approval.description ~= approval.description
    or message.approval.tool ~= approval.tool) then return nil end
local firstRequest = message.approval == nil or message.approval == cjson.null
message.status = 'waiting_approval'
message.approval = approval
if firstRequest then message.approvalDecision = cjson.null end
message.updatedAt = tonumber(ARGV[3])
local updated = cjson.encode(message)
redis.call('SET', KEYS[1], updated, 'EX', ARGV[4])
return updated
`

const DECIDE_APPROVAL = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local message = cjson.decode(raw)
if message.owner ~= ARGV[1] or message.status ~= 'waiting_approval'
  or message.approval == nil or message.approval == cjson.null then return nil end
if message.approvalDecision == ARGV[2] then return raw end
if message.approvalDecision ~= nil and message.approvalDecision ~= cjson.null then return nil end
message.approvalDecision = ARGV[2]
message.updatedAt = tonumber(ARGV[3])
local updated = cjson.encode(message)
redis.call('SET', KEYS[1], updated, 'EX', ARGV[4])
return updated
`

const RESUME_AFTER_APPROVAL = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local message = cjson.decode(raw)
if message.status == 'running' and message.claimToken == ARGV[1]
  and message.approvalHistory ~= nil and message.approvalHistory ~= cjson.null then
  for _, existing in ipairs(message.approvalHistory) do
    if existing.requestId == ARGV[2] then return raw end
  end
end
if message.claimToken ~= ARGV[1] or message.status ~= 'waiting_approval'
  or message.approval == nil or message.approval == cjson.null
  or message.approval.requestId ~= ARGV[2]
  or message.approvalDecision == nil or message.approvalDecision == cjson.null then return nil end
message.status = 'running'
if message.approvalHistory == nil or message.approvalHistory == cjson.null then message.approvalHistory = {} end
local audit = message.approval
audit.decision = message.approvalDecision
audit.decidedAt = tonumber(ARGV[3])
table.insert(message.approvalHistory, audit)
message.approval = cjson.null
message.approvalDecision = cjson.null
message.updatedAt = tonumber(ARGV[3])
local updated = cjson.encode(message)
redis.call('SET', KEYS[1], updated, 'EX', ARGV[4])
return updated
`

const APPEND_EVENT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local message = cjson.decode(raw)
if message.claimToken ~= ARGV[1]
  or (message.status ~= 'claimed' and message.status ~= 'running' and message.status ~= 'waiting_approval') then return nil end
local event = cjson.decode(ARGV[2])
if message.events == nil or message.events == cjson.null then message.events = {} end
for _, existing in ipairs(message.events) do
  if existing.sourceId == event.sourceId then return raw end
end
message.sequence = (message.sequence or 0) + 1
event.sequence = message.sequence
event.createdAt = tonumber(ARGV[3])
table.insert(message.events, event)
while #message.events > 100 do table.remove(message.events, 1) end
message.updatedAt = tonumber(ARGV[3])
local updated = cjson.encode(message)
redis.call('SET', KEYS[1], updated, 'EX', ARGV[4])
return updated
`

function messageKey(id: string) {
  return `${PREFIX}message:${id}`
}

function parseMessage(value: unknown): OracleMessage {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  if (!parsed || typeof parsed !== 'object' || typeof (parsed as OracleMessage).id !== 'string') {
    throw new Error('Redis palautti virheellisen Oracle-viestin.')
  }
  return parsed as OracleMessage
}

export function createRedisOracleBackend(redis: OracleRedisClient): OracleQueueBackend {
  return {
    async getOwnerSession(owner) {
      return redis.get<string>(`${PREFIX}owner-session:${owner}`)
    },
    async getByOwnerAndIdempotencyKey(owner, idempotencyKey) {
      const id = await redis.get<string>(`${PREFIX}idempotency:${owner}:${idempotencyKey}`)
      if (!id) return null
      const value = await redis.get<unknown>(messageKey(id))
      return value === null ? null : parseMessage(value)
    },
    async insertIfAbsent(message) {
      const result = await redis.eval<[number, string]>(
        INSERT_IF_ABSENT,
        [
          messageKey(message.id),
          `${PREFIX}idempotency:${message.owner}:${message.idempotencyKey}`,
          `${PREFIX}queue`,
        ],
        [
          JSON.stringify(message),
          message.id,
          String(MESSAGE_TTL_SECONDS),
          String(message.createdAt),
        ],
      )
      return { created: result[0] === 1, message: parseMessage(result[1]) }
    },
    async claimNext(now, claimToken, leaseUntil) {
      const value = await redis.eval<string | null>(
        CLAIM_NEXT,
        [`${PREFIX}queue`],
        [String(now), claimToken, String(leaseUntil), String(MESSAGE_TTL_SECONDS)],
      )
      return value === null ? null : parseMessage(value)
    },
    async markRunning(id, claimToken, runId, updatedAt, leaseUntil) {
      const value = await redis.eval<string | null>(
        MARK_RUNNING,
        [messageKey(id)],
        [claimToken, runId, String(updatedAt), String(leaseUntil), String(MESSAGE_TTL_SECONDS)],
      )
      return value === null ? null : parseMessage(value)
    },
    async complete(id, claimToken, answer, updatedAt, sessionId, ui) {
      const completionUiJson = JSON.stringify({
        action: ui?.action ?? null,
        proposal: ui?.proposal ?? null,
      })
      const value = await redis.eval<string | null>(
        COMPLETE,
        [messageKey(id), `${PREFIX}queue`],
        [
          claimToken,
          answer,
          String(updatedAt),
          sessionId ?? '',
          completionUiJson,
          String(MESSAGE_TTL_SECONDS),
          id,
        ],
      )
      return value === null ? null : parseMessage(value)
    },
    async fail(id, claimToken, error, updatedAt) {
      const value = await redis.eval<string | null>(
        FAIL,
        [messageKey(id), `${PREFIX}queue`],
        [claimToken, error, String(updatedAt), String(MESSAGE_TTL_SECONDS), id],
      )
      return value === null ? null : parseMessage(value)
    },
    async cancel(id, owner, updatedAt) {
      const value = await redis.eval<string | null>(
        CANCEL,
        [messageKey(id), `${PREFIX}queue`],
        [owner, String(updatedAt), String(MESSAGE_TTL_SECONDS), id],
      )
      return value === null ? null : parseMessage(value)
    },
    async confirmCancellation(id, claimToken, updatedAt) {
      const value = await redis.eval<string | null>(
        CONFIRM_CANCELLATION,
        [messageKey(id), `${PREFIX}queue`],
        [claimToken, String(updatedAt), String(MESSAGE_TTL_SECONDS), id],
      )
      return value === null ? null : parseMessage(value)
    },
    async requestApproval(id, claimToken, approval, updatedAt) {
      const value = await redis.eval<string | null>(
        REQUEST_APPROVAL,
        [messageKey(id)],
        [claimToken, JSON.stringify(approval), String(updatedAt), String(MESSAGE_TTL_SECONDS)],
      )
      return value === null ? null : parseMessage(value)
    },
    async decideApproval(id, owner, decision, updatedAt) {
      const value = await redis.eval<string | null>(
        DECIDE_APPROVAL,
        [messageKey(id)],
        [owner, decision, String(updatedAt), String(MESSAGE_TTL_SECONDS)],
      )
      return value === null ? null : parseMessage(value)
    },
    async resumeAfterApproval(id, claimToken, requestId, updatedAt) {
      const value = await redis.eval<string | null>(
        RESUME_AFTER_APPROVAL,
        [messageKey(id)],
        [claimToken, requestId, String(updatedAt), String(MESSAGE_TTL_SECONDS)],
      )
      return value === null ? null : parseMessage(value)
    },
    async appendEvent(id, claimToken, event, updatedAt) {
      const value = await redis.eval<string | null>(
        APPEND_EVENT,
        [messageKey(id)],
        [claimToken, JSON.stringify(event), String(updatedAt), String(MESSAGE_TTL_SECONDS)],
      )
      return value === null ? null : parseMessage(value)
    },
    async get(id) {
      const value = await redis.get<OracleMessage | string>(messageKey(id))
      return value === null ? null : parseMessage(value)
    },
  }
}
