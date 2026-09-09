import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRedisOracleBackend, type OracleRedisClient } from './oracleRedisBackend.ts'
import type { OracleMessage } from './oracleQueue.ts'

const execFileAsync = promisify(execFile)
const redisCli = process.env.ORACLE_REDIS_CLI
const redisPort = process.env.ORACLE_REDIS_PORT
const redisDb = process.env.ORACLE_REDIS_DB ?? '15'

async function command(...args: string[]): Promise<unknown> {
  if (!redisCli || !redisPort) throw new Error('Redis-integraatiotestin asetukset puuttuvat.')
  const { stdout } = await execFileAsync(redisCli, [
    '--json', '-h', '127.0.0.1', '-p', redisPort, '-n', redisDb, ...args,
  ])
  return JSON.parse(stdout.trim())
}

const redis: OracleRedisClient = {
  async eval<T>(script: string, keys: string[], args: string[]): Promise<T> {
    return command('EVAL', script, String(keys.length), ...keys, ...args) as Promise<T>
  },
  async get<T>(key: string): Promise<T | null> {
    return command('GET', key) as Promise<T | null>
  },
}

function queuedMessage(id: string, owner = 'integration-owner'): OracleMessage {
  return {
    id,
    owner,
    prompt: 'Integraatiotesti',
    idempotencyKey: `request-${id}-abcdefgh`,
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
}

test('oikea Redis suorittaa lease-, terminal- ja jonon etenemisskriptit', {
  skip: !redisCli || !redisPort,
}, async () => {
  await command('FLUSHDB')
  const backend = createRedisOracleBackend(redis)

  await backend.insertIfAbsent(queuedMessage('cancel-me'))
  const firstClaim = await backend.claimNext(2_000, 'claim-stale', 3_000)
  assert.equal(firstClaim?.id, 'cancel-me')
  assert.equal((await backend.cancel('cancel-me', 'integration-owner', 2_500))?.status, 'cancelling')

  const replacementClaim = await backend.claimNext(4_000, 'claim-replacement', 8_000)
  assert.equal(replacementClaim?.id, 'cancel-me')
  assert.equal(replacementClaim?.status, 'cancelling')
  assert.equal(replacementClaim?.claimToken, 'claim-replacement')
  assert.equal((await backend.confirmCancellation('cancel-me', 'claim-replacement', 4_100))?.status, 'cancelled')

  await backend.insertIfAbsent(queuedMessage('complete-me'))
  assert.equal((await backend.claimNext(5_000, 'claim-complete', 9_000))?.id, 'complete-me')
  const ui = {
    action: { action: 'navigate' as const, href: '/arxcian/trading', label: 'Trading' },
    proposal: null,
  }
  const completed = await backend.complete(
    'complete-me', 'claim-complete', 'Valmis', 5_100, 'session-1', ui,
  )
  assert.equal(completed?.status, 'completed')
  assert.equal(completed?.sessionId, 'session-1')

  const exactRetry = await backend.complete(
    'complete-me', 'claim-complete', 'Valmis', 5_200, 'session-1', ui,
  )
  assert.equal(exactRetry?.status, 'completed')
  assert.equal(await backend.complete(
    'complete-me', 'claim-complete', 'Valmis', 5_300, null, ui,
  ), null)
  assert.equal(await backend.complete(
    'complete-me', 'claim-complete', 'Valmis', 5_400, 'session-1', {
      action: { action: 'navigate', href: '/arxcian/tasks', label: 'Tehtävät' },
      proposal: null,
    },
  ), null)

  await backend.insertIfAbsent(queuedMessage('null-session', 'integration-null-owner'))
  assert.equal((await backend.claimNext(5_500, 'claim-null', 9_500))?.id, 'null-session')
  assert.equal((await backend.complete(
    'null-session', 'claim-null', 'Ei sessiota', 5_600, null,
  ))?.status, 'completed')
  assert.equal((await backend.complete(
    'null-session', 'claim-null', 'Ei sessiota', 5_700, null,
  ))?.status, 'completed')
  assert.equal(await backend.complete(
    'null-session', 'claim-null', 'Ei sessiota', 5_800, 'session-unexpected',
  ), null)

  await backend.insertIfAbsent(queuedMessage('next-message'))
  assert.equal((await backend.claimNext(6_000, 'claim-next', 10_000))?.id, 'next-message')
})
