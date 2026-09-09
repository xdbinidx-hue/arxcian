import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRedisOracleBackend } from './oracleRedisBackend.ts'
import type { OracleMessage } from './oracleQueue.ts'

const message: OracleMessage = {
  id: 'message-1',
  owner: 'albin',
  prompt: 'Tee työ',
  idempotencyKey: 'request-abcdefgh',
  status: 'queued',
  sessionId: null,
  runId: null,
  claimToken: null,
  leaseUntil: null,
  answer: null,
  error: null,
  approval: null,
  approvalDecision: null,
  createdAt: 1_000,
  updatedAt: 1_000,
}

test('Redis-tausta luo idempotentin viestin atomisella skriptillä', async () => {
  const calls: Array<{ script: string; keys: string[]; args: string[] }> = []
  const redis = {
    async eval<T>(script: string, keys: string[], args: string[]): Promise<T> {
      calls.push({ script, keys, args })
      return [1, JSON.stringify(message)] as T
    },
    async get<T>(): Promise<T | null> { return null },
  }

  const result = await createRedisOracleBackend(redis).insertIfAbsent(message)

  assert.equal(result.created, true)
  assert.equal(result.message.id, 'message-1')
  assert.deepEqual(calls[0]?.keys, [
    'arxcian:oracle:message:message-1',
    'arxcian:oracle:idempotency:albin:request-abcdefgh',
    'arxcian:oracle:queue',
  ])
  assert.match(calls[0]?.script ?? '', /ZADD/)
})

test('Redis-tausta lunastaa seuraavan viestin lease-tokenilla', async () => {
  const claimed = { ...message, status: 'claimed' as const, claimToken: 'claim-1', leaseUntil: 32_000 }
  const calls: Array<{ script: string; keys: string[]; args: string[] }> = []
  const redis = {
    async eval<T>(script: string, keys: string[], args: string[]): Promise<T> {
      calls.push({ script, keys, args })
      return JSON.stringify(claimed) as T
    },
    async get<T>(): Promise<T | null> { return null },
  }

  const result = await createRedisOracleBackend(redis).claimNext(2_000, 'claim-1', 32_000)

  assert.equal(result?.claimToken, 'claim-1')
  assert.deepEqual(calls[0]?.keys, ['arxcian:oracle:queue'])
  assert.deepEqual(calls[0]?.args, ['2000', 'claim-1', '32000', '604800'])
  assert.match(calls[0]?.script ?? '', /ZRANGE', KEYS\[1\], 0, -1/)
  assert.doesNotMatch(calls[0]?.script ?? '', /ZRANGE', KEYS\[1\], 0, 99/)
  assert.match(calls[0]?.script ?? '', /blockedOwners/)
  assert.match(calls[0]?.script ?? '', /owner-session:/)
  assert.doesNotMatch(calls[0]?.script ?? '', /message\.approval = cjson\.null/)
})

test('Redis-tausta lunastaa vanhentuneen cancelling-työn uudelleen', async () => {
  const calls: Array<{ script: string; keys: string[]; args: string[] }> = []
  const redis = {
    async eval<T>(script: string, keys: string[], args: string[]): Promise<T> {
      calls.push({ script, keys, args })
      return JSON.stringify({
        ...message,
        status: 'cancelling',
        claimToken: 'claim-2',
        leaseUntil: 32_000,
      }) as T
    },
    async get<T>(): Promise<T | null> { return null },
  }

  const result = await createRedisOracleBackend(redis).claimNext(2_000, 'claim-2', 32_000)

  assert.equal(result?.status, 'cancelling')
  assert.match(
    calls[0]?.script ?? '',
    /local expired = \([^\n]*\n?[^\n]*message\.status == 'cancelling'\)/,
  )
})

test('Redis-tausta tallentaa Hermes-ajon tunnisteen claim-tokenilla', async () => {
  const running = {
    ...message,
    status: 'running' as const,
    claimToken: 'claim-1',
    runId: 'run-1',
    updatedAt: 2_100,
  }
  const calls: Array<{ script: string; keys: string[]; args: string[] }> = []
  const redis = {
    async eval<T>(script: string, keys: string[], args: string[]): Promise<T> {
      calls.push({ script, keys, args })
      return JSON.stringify(running) as T
    },
    async get<T>(): Promise<T | null> { return null },
  }

  const result = await createRedisOracleBackend(redis).markRunning(
    'message-1', 'claim-1', 'run-1', 2_100, 902_100,
  )

  assert.equal(result?.runId, 'run-1')
  assert.deepEqual(calls[0]?.keys, ['arxcian:oracle:message:message-1'])
  assert.deepEqual(calls[0]?.args, ['claim-1', 'run-1', '2100', '902100', '604800'])
})

test('Redis-tausta valmistaa vain oikealla claim-tokenilla ja poistaa jonosta', async () => {
  const completed = {
    ...message,
    status: 'completed' as const,
    answer: 'Valmis',
    sessionId: 'hermes-session-1',
    updatedAt: 4_000,
  }
  const calls: Array<{ script: string; keys: string[]; args: string[] }> = []
  const redis = {
    async eval<T>(script: string, keys: string[], args: string[]): Promise<T> {
      calls.push({ script, keys, args })
      return JSON.stringify(completed) as T
    },
    async get<T>(): Promise<T | null> { return null },
  }

  const result = await createRedisOracleBackend(redis).complete(
    'message-1',
    'claim-1',
    'Valmis',
    4_000,
    'hermes-session-1',
    {
      action: { action: 'navigate', href: '/arxcian/trading', label: 'Trading' },
      proposal: null,
    },
  )

  assert.equal(result?.status, 'completed')
  assert.deepEqual(calls[0]?.keys, [
    'arxcian:oracle:message:message-1',
    'arxcian:oracle:queue',
  ])
  assert.deepEqual(calls[0]?.args, [
    'claim-1', 'Valmis', '4000', 'hermes-session-1',
    '{"action":{"action":"navigate","href":"/arxcian/trading","label":"Trading"},"proposal":null}',
    '604800', 'message-1',
  ])
  assert.match(calls[0]?.script ?? '', /ZREM/)
  assert.match(calls[0]?.script ?? '', /completionUiJson/)
})

test('Redis-tausta tallentaa epäonnistumisen ja poistaa työn aktiivijonosta', async () => {
  const failed = { ...message, status: 'failed' as const, error: 'Hermes-ajo epäonnistui.' }
  const calls: Array<{ script: string; keys: string[]; args: string[] }> = []
  const redis = {
    async eval<T>(script: string, keys: string[], args: string[]): Promise<T> {
      calls.push({ script, keys, args })
      return JSON.stringify(failed) as T
    },
    async get<T>(): Promise<T | null> { return null },
  }

  const result = await createRedisOracleBackend(redis).fail(
    'message-1', 'claim-1', 'Hermes-ajo epäonnistui.', 4_000,
  )

  assert.equal(result?.status, 'failed')
  assert.deepEqual(calls[0]?.keys, [
    'arxcian:oracle:message:message-1',
    'arxcian:oracle:queue',
  ])
  assert.match(calls[0]?.script ?? '', /ZREM/)
})

test('Redis-tausta jättää aktiivisen keskeytyksen jonoon bridge-vahvistusta varten', async () => {
  const cancelling = { ...message, status: 'cancelling' as const, updatedAt: 5_000 }
  const calls: Array<{ script: string; keys: string[]; args: string[] }> = []
  const redis = {
    async eval<T>(script: string, keys: string[], args: string[]): Promise<T> {
      calls.push({ script, keys, args })
      return JSON.stringify(cancelling) as T
    },
    async get<T>(): Promise<T | null> { return null },
  }

  const result = await createRedisOracleBackend(redis).cancel('message-1', 'albin', 5_000)

  assert.equal(result?.status, 'cancelling')
  assert.deepEqual(calls[0]?.keys, [
    'arxcian:oracle:message:message-1',
    'arxcian:oracle:queue',
  ])
  assert.deepEqual(calls[0]?.args, ['albin', '5000', '604800', 'message-1'])
  assert.match(calls[0]?.script ?? '', /message\.status == 'queued'/)
  assert.match(calls[0]?.script ?? '', /message\.status = 'cancelling'/)
})

test('Redis-tausta tallentaa ja ratkaisee hyväksynnän atomisesti', async () => {
  const calls: Array<{ script: string; keys: string[]; args: string[] }> = []
  const waiting = {
    ...message,
    status: 'waiting_approval' as const,
    claimToken: 'claim-1',
    approval: { requestId: 'approval-1', command: 'touch report.txt', description: null, tool: 'terminal' },
  }
  const redis = {
    async eval<T>(script: string, keys: string[], args: string[]): Promise<T> {
      calls.push({ script, keys, args })
      return JSON.stringify(waiting) as T
    },
    async get<T>(): Promise<T | null> { return null },
  }
  const backend = createRedisOracleBackend(redis)
  await backend.requestApproval('message-1', 'claim-1', waiting.approval, 6_000)
  await backend.decideApproval('message-1', 'albin', 'once', 6_100)
  await backend.resumeAfterApproval('message-1', 'claim-1', 'approval-1', 6_200)

  assert.deepEqual(calls[0]?.args.slice(0, 2), ['claim-1', JSON.stringify(waiting.approval)])
  assert.deepEqual(calls[1]?.args.slice(0, 2), ['albin', 'once'])
  assert.deepEqual(calls[2]?.args.slice(0, 2), ['claim-1', 'approval-1'])
  assert.match(calls[0]?.script ?? '', /waiting_approval/)
  assert.match(calls[0]?.script ?? '', /message\.approval\.command ~= approval\.command/)
  assert.match(calls[0]?.script ?? '', /message\.approval\.description ~= approval\.description/)
  assert.match(calls[2]?.script ?? '', /message\.approval = cjson\.null/)
  assert.match(calls[2]?.script ?? '', /message\.approvalHistory/)
  assert.match(calls[2]?.script ?? '', /existing\.requestId == ARGV\[2\]/)
})

test('Redis-terminaliskriptit hyväksyvät vain täsmällisen callback-uusinnan', async () => {
  const calls: Array<{ script: string; keys: string[]; args: string[] }> = []
  const redis = {
    async eval<T>(script: string, keys: string[], args: string[]): Promise<T> {
      calls.push({ script, keys, args })
      return JSON.stringify({ ...message, status: 'completed' }) as T
    },
    async get<T>(): Promise<T | null> { return null },
  }
  const backend = createRedisOracleBackend(redis)
  await backend.complete('message-1', 'claim-1', 'Valmis', 7_000, 'session-1')
  await backend.fail('message-1', 'claim-1', 'Virhe', 7_100)

  assert.match(calls[0]?.script ?? '', /message\.terminalClaimToken == ARGV\[1\]/)
  assert.match(calls[0]?.script ?? '', /message\.answer == ARGV\[2\]/)
  assert.match(calls[1]?.script ?? '', /message\.terminalClaimToken == ARGV\[1\]/)
  assert.match(calls[1]?.script ?? '', /message\.error == ARGV\[2\]/)
})

test('Redis-tausta lisää tapahtuman atomisella monotonisella sequencella', async () => {
  const calls: Array<{ script: string; keys: string[]; args: string[] }> = []
  const updated = {
    ...message,
    status: 'running' as const,
    claimToken: 'claim-1',
    sequence: 1,
    events: [{ sourceId: 'event-1', sequence: 1, type: 'tool.started', tool: 'terminal', preview: 'Testi', error: false, createdAt: 2_200 }],
  }
  const redis = {
    async eval<T>(script: string, keys: string[], args: string[]): Promise<T> {
      calls.push({ script, keys, args })
      return JSON.stringify(updated) as T
    },
    async get<T>(): Promise<T | null> { return null },
  }

  const result = await createRedisOracleBackend(redis).appendEvent(
    'message-1', 'claim-1', { sourceId: 'event-1', type: 'tool.started', tool: 'terminal', preview: 'Testi', error: false }, 2_200,
  )

  assert.equal(result?.sequence, 1)
  assert.match(calls[0]?.script ?? '', /existing\.sourceId == event\.sourceId/)
  assert.match(calls[0]?.script ?? '', /message\.sequence = \(message\.sequence or 0\) \+ 1/)
  assert.match(calls[0]?.script ?? '', /while #message\.events > 100/)
})
