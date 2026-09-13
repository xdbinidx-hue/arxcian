import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cancelOracleRequest, decideOracleApprovalRequest, readOracleRequest, submitOracleRequest } from './oracleApi.ts'
import { createMemoryOracleBackend } from './oracleQueue.ts'

test('Oracle-viestin lähetys vaatii kirjautumisen', async () => {
  const result = await submitOracleRequest(
    {
      currentUser: async () => null,
      allowRequest: async () => true,
      backend: createMemoryOracleBackend(),
      now: () => 1_000,
      id: () => 'message-1',
    },
    { prompt: 'Tee työ', idempotencyKey: 'request-abcdefgh' },
  )

  assert.deepEqual(result, { status: 401, body: { error: 'Kirjautuminen vaaditaan' } })
})

test('Oracle-viestin lähetys torjutaan nopeusrajan täytyttyä', async () => {
  const result = await submitOracleRequest(
    {
      currentUser: async () => 'albin',
      allowRequest: async () => false,
      backend: createMemoryOracleBackend(),
      now: () => 1_000,
      id: () => 'message-1',
    },
    { prompt: 'Tee työ', idempotencyKey: 'request-abcdefgh' },
  )

  assert.deepEqual(result, { status: 429, body: { error: 'Liikaa pyyntöjä, yritä myöhemmin uudelleen' } })
})

test('kirjautunut käyttäjä voi jonottaa idempotentin Oracle-viestin', async () => {
  const backend = createMemoryOracleBackend()
  const deps = {
    currentUser: async () => 'albin' as const,
    allowRequest: async () => true,
    backend,
    now: () => 1_000,
    id: () => 'message-1',
  }

  const first = await submitOracleRequest(
    deps,
    { prompt: '  Tee työ  ', idempotencyKey: 'request-abcdefgh' },
  )
  const retry = await submitOracleRequest(
    { ...deps, id: () => 'message-2' },
    { prompt: 'Tee työ', idempotencyKey: 'request-abcdefgh' },
  )

  assert.equal(first.status, 202)
  assert.equal(first.body.created, true)
  assert.equal(retry.status, 200)
  assert.equal(retry.body.created, false)
  assert.equal((retry.body.message as { id: string }).id, 'message-1')
})

test('idempotentti uusinta palauttaa olemassa olevan työn ennen nopeusrajaa', async () => {
  const backend = createMemoryOracleBackend()
  const first = await submitOracleRequest(
    {
      currentUser: async () => 'albin', allowRequest: async () => true, backend,
      now: () => 1_000, id: () => 'message-retry',
    },
    { prompt: 'Tee työ', idempotencyKey: 'request-retry01' },
  )
  let rateLimitChecked = false
  const retry = await submitOracleRequest(
    {
      currentUser: async () => 'albin',
      allowRequest: async () => { rateLimitChecked = true; return false },
      backend, now: () => 2_000, id: () => 'message-never',
    },
    { prompt: 'Tee työ', idempotencyKey: 'request-retry01' },
  )

  assert.equal(first.status, 202)
  assert.equal(retry.status, 200)
  assert.equal(retry.body.created, false)
  assert.equal((retry.body.message as { id: string }).id, 'message-retry')
  assert.equal(rateLimitChecked, false)
})

test('sama idempotency-avain eri promptilla palauttaa konfliktin', async () => {
  const backend = createMemoryOracleBackend()
  const deps = {
    currentUser: async () => 'albin' as const,
    allowRequest: async () => true,
    backend,
    now: () => 1_000,
    id: () => 'message-conflict',
  }
  await submitOracleRequest(deps, { prompt: 'Ensimmäinen työ', idempotencyKey: 'request-conflict1' })
  const conflict = await submitOracleRequest(
    { ...deps, id: () => 'message-never' },
    { prompt: 'Eri työ', idempotencyKey: 'request-conflict1' },
  )

  assert.equal(conflict.status, 409)
  assert.equal(backend.snapshot().length, 1)
})

test('virheellinen Oracle-viestirunko palauttaa 400 ilman jonotusta', async () => {
  const backend = createMemoryOracleBackend()
  const result = await submitOracleRequest(
    {
      currentUser: async () => 'albin',
      allowRequest: async () => true,
      backend,
      now: () => 1_000,
      id: () => 'message-1',
    },
    { prompt: 42, idempotencyKey: 'short' },
  )

  assert.equal(result.status, 400)
  assert.equal(typeof result.body.error, 'string')
  assert.equal(backend.snapshot().length, 0)
})

test('virheellinen idempotency-avain hylätään ennen backend-hakua', async () => {
  const backend = createMemoryOracleBackend()
  let reads = 0
  backend.getByOwnerAndIdempotencyKey = async () => { reads += 1; return null }
  const result = await submitOracleRequest(
    { currentUser: async () => 'albin', allowRequest: async () => true, backend, now: () => 1_000, id: () => 'never' },
    { prompt: 'Tee työ', idempotencyKey: 'x'.repeat(10_000) },
  )
  assert.equal(result.status, 400)
  assert.equal(reads, 0)
})

test('sisällöltään virheellinen Oracle-viesti palauttaa 400', async () => {
  const result = await submitOracleRequest(
    {
      currentUser: async () => 'albin',
      allowRequest: async () => true,
      backend: createMemoryOracleBackend(),
      now: () => 1_000,
      id: () => 'message-1',
    },
    { prompt: '   ', idempotencyKey: 'short' },
  )

  assert.equal(result.status, 400)
})

test('Oracle-viestin tila näkyy vain omistajalle', async () => {
  const backend = createMemoryOracleBackend()
  await submitOracleRequest(
    {
      currentUser: async () => 'albin',
      allowRequest: async () => true,
      backend,
      now: () => 1_000,
      id: () => 'message-1',
    },
    { prompt: 'Yksityinen', idempotencyKey: 'request-private1' },
  )

  const hidden = await readOracleRequest({ currentUser: async () => 'arbnor', backend }, 'message-1')
  const visible = await readOracleRequest({ currentUser: async () => 'albin', backend }, 'message-1')

  assert.equal(hidden.status, 404)
  assert.equal(visible.status, 200)
  const publicMessage = visible.body.message as Record<string, unknown>
  assert.deepEqual(Object.keys(publicMessage).sort(), [
    'action', 'answer', 'approval', 'approvalDecision', 'createdAt', 'error', 'events', 'id', 'liveAnswer', 'proposal', 'sequence', 'status', 'updatedAt',
  ])
  assert.equal(publicMessage.id, 'message-1')
})

test('Oracle-viestin voi keskeyttää vain kirjautunut omistaja', async () => {
  const backend = createMemoryOracleBackend()
  await submitOracleRequest(
    {
      currentUser: async () => 'albin', allowRequest: async () => true, backend,
      now: () => 1_000, id: () => 'message-1',
    },
    { prompt: 'Pitkä työ', idempotencyKey: 'request-cancel-api' },
  )

  const other = await cancelOracleRequest(
    { currentUser: async () => 'arbnor', backend }, 'message-1', { now: () => 2_000 },
  )
  const owner = await cancelOracleRequest(
    { currentUser: async () => 'albin', backend }, 'message-1', { now: () => 2_000 },
  )

  assert.equal(other.status, 409)
  assert.equal(owner.status, 200)
  assert.equal((owner.body.message as { status: string }).status, 'cancelled')
  const retry = await cancelOracleRequest(
    { currentUser: async () => 'albin', backend }, 'message-1', { now: () => 2_001 },
  )
  assert.equal(retry.status, 200)
  assert.equal((retry.body.message as { status: string }).status, 'cancelled')
})

test('vain omistaja voi hyväksyä tai hylätä tarkan Hermes-pyynnön', async () => {
  const backend = createMemoryOracleBackend([{
    id: 'message-approval', owner: 'albin', prompt: 'Tee työ', idempotencyKey: 'request-approval1',
    status: 'waiting_approval', sessionId: null, runId: 'run-1', claimToken: 'claim-1', leaseUntil: 99_000,
    answer: null, error: null, createdAt: 1_000, updatedAt: 2_000,
    approval: { requestId: 'approval-1', command: 'touch report.txt', description: 'Luo raportti', tool: 'terminal' },
    approvalDecision: null,
  }])

  const other = await decideOracleApprovalRequest(
    { currentUser: async () => 'arbnor', backend }, 'message-approval', { choice: 'once' }, 3_000,
  )
  const invalid = await decideOracleApprovalRequest(
    { currentUser: async () => 'albin', backend }, 'message-approval', { choice: 'always' }, 3_001,
  )
  const owner = await decideOracleApprovalRequest(
    { currentUser: async () => 'albin', backend }, 'message-approval', { choice: 'deny' }, 3_002,
  )

  assert.equal(other.status, 409)
  assert.equal(invalid.status, 400)
  assert.equal(owner.status, 200)
  assert.equal((owner.body.message as { approvalDecision: string }).approvalDecision, 'deny')
  const retry = await decideOracleApprovalRequest(
    { currentUser: async () => 'albin', backend }, 'message-approval', { choice: 'deny' }, 3_003,
  )
  const conflictingRetry = await decideOracleApprovalRequest(
    { currentUser: async () => 'albin', backend }, 'message-approval', { choice: 'once' }, 3_004,
  )
  assert.equal(retry.status, 200)
  assert.equal(conflictingRetry.status, 409)
})
