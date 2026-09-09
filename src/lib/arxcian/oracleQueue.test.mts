import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  claimNextOracleMessage,
  completeOracleMessage,
  cancelOracleMessage,
  confirmOracleCancellation,
  createMemoryOracleBackend,
  enqueueOracleMessage,
  failOracleMessage,
  getOracleMessageForOwner,
  markOracleMessageRunning,
  oracleMessageView,
  recordOracleEvent,
  recordOracleApprovalRequest,
  decideOracleApproval,
  resumeOracleMessageAfterApproval,
  OracleQueueConflictError,
  OracleQueueInputError,
} from './oracleQueue.ts'

test('sama omistaja ja idempotency-avain luo vain yhden Oracle-viestin', async () => {
  const backend = createMemoryOracleBackend()
  const first = await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Tarkista näkymä', idempotencyKey: 'request-12345678' },
    { now: () => 1_000, id: () => 'message-1' },
  )
  const retry = await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Tarkista näkymä', idempotencyKey: 'request-12345678' },
    { now: () => 2_000, id: () => 'message-2' },
  )

  assert.equal(first.created, true)
  assert.equal(retry.created, false)
  assert.equal(retry.message.id, first.message.id)
  assert.equal(backend.snapshot().length, 1)
})

test('bridge lunastaa viestin kerran ja lease vapauttaa kaatuneen työn', async () => {
  const backend = createMemoryOracleBackend()
  await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Tee työ', idempotencyKey: 'request-abcdefgh' },
    { now: () => 1_000, id: () => 'message-1' },
  )

  const first = await claimNextOracleMessage(
    backend,
    { now: () => 2_000, id: () => 'claim-1' },
    30_000,
  )
  assert.equal(first?.claimToken, 'claim-1')
  assert.equal(await claimNextOracleMessage(backend, { now: () => 20_000, id: () => 'claim-2' }), null)

  const reclaimed = await claimNextOracleMessage(
    backend,
    { now: () => 32_001, id: () => 'claim-3' },
    30_000,
  )
  assert.equal(reclaimed?.id, 'message-1')
  assert.equal(reclaimed?.claimToken, 'claim-3')
})

test('vain tuore lunastus voi valmistaa viestin', async () => {
  const backend = createMemoryOracleBackend()
  await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Tee työ', idempotencyKey: 'request-abcdefgh' },
    { now: () => 1_000, id: () => 'message-1' },
  )
  await claimNextOracleMessage(backend, { now: () => 2_000, id: () => 'claim-1' }, 10)
  await claimNextOracleMessage(backend, { now: () => 2_011, id: () => 'claim-2' }, 30_000)

  await assert.rejects(
    () => completeOracleMessage(backend, 'message-1', 'claim-1', 'vanha', 3_000),
    OracleQueueConflictError,
  )
  const completed = await completeOracleMessage(
    backend,
    'message-1',
    'claim-2',
    'valmis',
    3_001,
    'hermes-session-1',
  )
  assert.equal(completed.status, 'completed')
  assert.equal(completed.answer, 'valmis')
  assert.equal(completed.sessionId, 'hermes-session-1')
})

test('valmistunut Oracle-viesti säilyttää validoidun selainvaikutuksen julkisessa näkymässä', async () => {
  const backend = createMemoryOracleBackend()
  await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Avaa Trading ja tee muistiinpano', idempotencyKey: 'request-ui-result1' },
    { now: () => 1_000, id: () => 'message-ui' },
  )
  await claimNextOracleMessage(backend, { now: () => 2_000, id: () => 'claim-ui' })
  const ui = {
    action: { action: 'navigate' as const, href: '/arxcian/trading', label: 'Trading' },
    proposal: {
      id: '12345678-1234-4234-8234-123456789abc',
      tool: 'create_note',
      summary: 'Luodaan muistiinpano: "Muista tämä"',
    },
  }

  const completed = await completeOracleMessage(
    backend, 'message-ui', 'claim-ui', 'Valmis', 3_000, 'session-ui', ui,
  )
  const view = oracleMessageView(completed)

  assert.deepEqual(view.action, ui.action)
  assert.deepEqual(view.proposal, ui.proposal)
  assert.equal('completionUiJson' in view, false)
})

test('omistaja ei näe toisen Oracle-viestiä', async () => {
  const backend = createMemoryOracleBackend()
  const queued = await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Yksityinen', idempotencyKey: 'request-private1' },
    { now: () => 1_000, id: () => 'message-1' },
  )

  assert.equal(await getOracleMessageForOwner(backend, queued.message.id, 'arbnor'), null)
  assert.equal((await getOracleMessageForOwner(backend, queued.message.id, 'albin'))?.prompt, 'Yksityinen')
})

test('tyhjä viesti hylätään', async () => {
  const backend = createMemoryOracleBackend()
  await assert.rejects(
    () => enqueueOracleMessage(backend, { owner: 'albin', prompt: ' ', idempotencyKey: 'request-valid1' }),
    OracleQueueInputError,
  )
})

test('yli 12 000 merkin viesti hylätään', async () => {
  const backend = createMemoryOracleBackend()
  await assert.rejects(
    () => enqueueOracleMessage(backend, {
      owner: 'albin',
      prompt: 'x'.repeat(12_001),
      idempotencyKey: 'request-valid2',
    }),
    OracleQueueInputError,
  )
})

test('heikko idempotency-avain hylätään', async () => {
  const backend = createMemoryOracleBackend()
  await assert.rejects(
    () => enqueueOracleMessage(backend, {
      owner: 'albin',
      prompt: 'ok',
      idempotencyKey: 'short',
    }),
    OracleQueueInputError,
  )
})

test('bridge tallentaa Hermes-ajon tunnisteen vain omalla claim-tokenillaan', async () => {
  const backend = createMemoryOracleBackend()
  await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Tee työ', idempotencyKey: 'request-running1' },
    { now: () => 1_000, id: () => 'message-1' },
  )
  await claimNextOracleMessage(backend, { now: () => 2_000, id: () => 'claim-1' }, 30_000)

  await assert.rejects(
    () => markOracleMessageRunning(backend, 'message-1', 'wrong-token', 'run-1', 2_100),
    OracleQueueConflictError,
  )
  const running = await markOracleMessageRunning(
    backend,
    'message-1',
    'claim-1',
    'run-1',
    2_100,
  )
  assert.equal(running.status, 'running')
  assert.equal(running.runId, 'run-1')
})

test('bridge tallentaa Hermes-ajon virheen turvallisesti', async () => {
  const backend = createMemoryOracleBackend()
  await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Tee työ', idempotencyKey: 'request-failed01' },
    { now: () => 1_000, id: () => 'message-1' },
  )
  await claimNextOracleMessage(backend, { now: () => 2_000, id: () => 'claim-1' })

  const failed = await failOracleMessage(
    backend,
    'message-1',
    'claim-1',
    'Hermes-ajo epäonnistui.',
    3_000,
  )

  assert.equal(failed.status, 'failed')
  assert.equal(failed.error, 'Hermes-ajo epäonnistui.')
  assert.equal(oracleMessageView(failed).error, 'Oracle-tehtävä epäonnistui.')
  assert.equal(failed.claimToken, null)
})

test('bridge voi terminalisoida hyväksyntää odottavan työn oikealla tokenilla', async () => {
  const backend = createMemoryOracleBackend([{
    id: 'message-waiting-fail', owner: 'albin', prompt: 'Tee työ', idempotencyKey: 'request-waitfail',
    status: 'waiting_approval', sessionId: null, runId: 'run-waiting', claimToken: 'claim-waiting',
    leaseUntil: 99_000, answer: null, error: null,
    approval: { requestId: 'approval-waiting', command: null, description: 'Lupa', tool: 'terminal' },
    approvalDecision: null, createdAt: 1_000, updatedAt: 2_000,
  }])
  const failed = await failOracleMessage(
    backend, 'message-waiting-fail', 'claim-waiting', 'Silta epäonnistui.', 3_100,
  )
  assert.equal(failed.status, 'failed')
})

test('vain omistaja voi keskeyttää Oracle-viestin', async () => {
  const backend = createMemoryOracleBackend()
  const queued = await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Pitkä tehtävä', idempotencyKey: 'request-cancel-abcdefgh' },
    { id: () => 'message-cancel', now: () => 1_000 },
  )

  await assert.rejects(
    () => cancelOracleMessage(backend, queued.message.id, 'petri', { now: () => 2_000 }),
    OracleQueueConflictError,
  )
  const cancelled = await cancelOracleMessage(backend, queued.message.id, 'albin', { now: () => 2_000 })
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(cancelled.updatedAt, 2_000)
})

test('aktiivinen keskeytys säilyy jonossa kunnes bridge vahvistaa Hermes-stopin', async () => {
  const backend = createMemoryOracleBackend()
  await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Pitkä työ', idempotencyKey: 'request-cancel-running' },
    { id: () => 'message-cancelling', now: () => 1_000 },
  )
  await claimNextOracleMessage(backend, { id: () => 'claim-old', now: () => 2_000 }, 100)
  await markOracleMessageRunning(backend, 'message-cancelling', 'claim-old', 'run-cancelling', 2_010, 100)

  const requested = await cancelOracleMessage(backend, 'message-cancelling', 'albin', { now: () => 2_020 })
  assert.equal(requested.status, 'cancelling')
  assert.equal(await claimNextOracleMessage(backend, { id: () => 'too-early', now: () => 2_050 }), null)

  const reclaimed = await claimNextOracleMessage(
    backend, { id: () => 'claim-new', now: () => 2_111 }, 30_000,
  )
  assert.equal(reclaimed?.status, 'cancelling')
  assert.equal(reclaimed?.claimToken, 'claim-new')
  await assert.rejects(
    confirmOracleCancellation(backend, 'message-cancelling', 'claim-old', 2_120),
    OracleQueueConflictError,
  )
  const confirmed = await confirmOracleCancellation(
    backend, 'message-cancelling', 'claim-new', 2_121,
  )
  assert.equal(confirmed.status, 'cancelled')
  assert.equal(confirmed.claimToken, null)
})

test('Hermes-hyväksyntä näkyy omistajalle ja vain omistaja voi ratkaista sen', async () => {
  const backend = createMemoryOracleBackend()
  await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Tee kirjoittava työ', idempotencyKey: 'request-approval1' },
    { id: () => 'message-approval', now: () => 1_000 },
  )
  await claimNextOracleMessage(backend, { id: () => 'claim-approval', now: () => 2_000 })
  await markOracleMessageRunning(backend, 'message-approval', 'claim-approval', 'run-approval', 2_100)

  const waiting = await recordOracleApprovalRequest(
    backend,
    'message-approval',
    'claim-approval',
    { requestId: 'approval-1', command: 'touch report.txt', description: 'Luo raporttitiedosto', tool: 'terminal' },
    2_200,
  )
  assert.equal(waiting.status, 'waiting_approval')
  assert.equal(waiting.approval?.command, 'touch report.txt')

  await assert.rejects(
    () => decideOracleApproval(backend, 'message-approval', 'arbnor', 'once', 2_300),
    OracleQueueConflictError,
  )
  const decided = await decideOracleApproval(backend, 'message-approval', 'albin', 'once', 2_301)
  assert.equal(decided.approvalDecision, 'once')

  const duplicate = await recordOracleApprovalRequest(
    backend,
    'message-approval',
    'claim-approval',
    { requestId: 'approval-1', command: 'touch report.txt', description: 'Luo raporttitiedosto', tool: 'terminal' },
    2_350,
  )
  assert.equal(duplicate.approvalDecision, 'once')

  await assert.rejects(
    () => recordOracleApprovalRequest(
      backend,
      'message-approval',
      'claim-approval',
      { requestId: 'approval-1', command: 'rm report.txt', description: 'Poista raportti', tool: 'terminal' },
      2_351,
    ),
    OracleQueueConflictError,
  )

  const unchanged = await backend.get('message-approval')
  assert.equal(unchanged?.approval?.command, 'touch report.txt')
  assert.equal(unchanged?.approvalDecision, 'once')

  const resumed = await resumeOracleMessageAfterApproval(
    backend, 'message-approval', 'claim-approval', 'approval-1', 2_400,
  )
  assert.equal(resumed.status, 'running')
  assert.equal(resumed.approval, null)
  assert.equal(resumed.approvalDecision, null)
  assert.deepEqual(resumed.approvalHistory, [{
    requestId: 'approval-1', command: 'touch report.txt', description: 'Luo raporttitiedosto',
    tool: 'terminal', decision: 'once', decidedAt: 2_400,
  }])
  const resumedReplay = await resumeOracleMessageAfterApproval(
    backend, 'message-approval', 'claim-approval', 'approval-1', 2_500,
  )
  assert.equal(resumedReplay.approvalHistory?.length, 1)
  assert.equal(resumedReplay.updatedAt, resumed.updatedAt)
})

test('hyväksyntäpyynnön selaimelle näkyvät kentät ovat rajattuja', async () => {
  const backend = createMemoryOracleBackend([{
    id: 'message-bounds', owner: 'albin', prompt: 'Tee työ', idempotencyKey: 'request-bounds1',
    status: 'running', sessionId: null, runId: 'run-bounds', claimToken: 'claim-bounds', leaseUntil: 99_000,
    answer: null, error: null, approval: null, approvalDecision: null, createdAt: 1_000, updatedAt: 2_000,
  }])

  await assert.rejects(
    recordOracleApprovalRequest(backend, 'message-bounds', 'claim-bounds', {
      requestId: 'approval-bounds', command: 'x'.repeat(16_001), description: null, tool: 'terminal',
    }, 2_100),
    OracleQueueInputError,
  )
})

test('hyväksyntäpyynnössä pitää näkyä täsmällinen toimi', async () => {
  const backend = createMemoryOracleBackend([{
    id: 'message-vague', owner: 'albin', prompt: 'Tee työ', idempotencyKey: 'request-vague01',
    status: 'running', sessionId: null, runId: 'run-1', claimToken: 'claim-1', leaseUntil: 99_000,
    answer: null, error: null, approval: null, approvalDecision: null, createdAt: 1_000, updatedAt: 2_000,
  }])
  await assert.rejects(
    recordOracleApprovalRequest(backend, 'message-vague', 'claim-1', {
      requestId: 'approval-vague', command: null, description: '   ', tool: null,
    }, 3_000),
    /täsmällinen toimi/,
  )
})

test('palvelin sitoo valmistuneen Hermes-session omistajan seuraavaan viestiin', async () => {
  const backend = createMemoryOracleBackend()
  await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Ensimmäinen', idempotencyKey: 'request-session-1', sessionId: 'client-forged' },
    { id: () => 'message-session-1', now: () => 1_000 },
  )
  await claimNextOracleMessage(backend, { id: () => 'claim-session', now: () => 1_100 })
  await completeOracleMessage(backend, 'message-session-1', 'claim-session', 'Valmis', 1_200, 'server-session')

  const next = await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Toinen', idempotencyKey: 'request-session-2', sessionId: 'another-forged' },
    { id: () => 'message-session-2', now: () => 1_300 },
  )

  assert.equal(next.message.sessionId, 'server-session')
})

test('terminal-callbackin täsmällinen uusinta on idempotentti mutta eri sisältö torjutaan', async () => {
  const completedBackend = createMemoryOracleBackend()
  await enqueueOracleMessage(
    completedBackend,
    { owner: 'albin', prompt: 'Tee työ', idempotencyKey: 'request-complete-retry' },
    { id: () => 'message-complete-retry', now: () => 1_000 },
  )
  await claimNextOracleMessage(completedBackend, { id: () => 'claim-complete', now: () => 1_100 })
  const completed = await completeOracleMessage(
    completedBackend, 'message-complete-retry', 'claim-complete', 'Valmis', 1_200, 'session-1',
  )
  const replay = await completeOracleMessage(
    completedBackend, 'message-complete-retry', 'claim-complete', 'Valmis', 1_300, 'session-1',
  )
  assert.equal(replay.updatedAt, completed.updatedAt)
  await assert.rejects(
    completeOracleMessage(completedBackend, 'message-complete-retry', 'claim-complete', 'Muutettu', 1_400, 'session-1'),
    OracleQueueConflictError,
  )

  const failedBackend = createMemoryOracleBackend()
  await enqueueOracleMessage(
    failedBackend,
    { owner: 'albin', prompt: 'Tee työ', idempotencyKey: 'request-fail-retry' },
    { id: () => 'message-fail-retry', now: () => 2_000 },
  )
  await claimNextOracleMessage(failedBackend, { id: () => 'claim-fail', now: () => 2_100 })
  const failed = await failOracleMessage(failedBackend, 'message-fail-retry', 'claim-fail', 'Virhe', 2_200)
  const failedReplay = await failOracleMessage(failedBackend, 'message-fail-retry', 'claim-fail', 'Virhe', 2_300)
  assert.equal(failedReplay.updatedAt, failed.updatedAt)
  await assert.rejects(
    failOracleMessage(failedBackend, 'message-fail-retry', 'claim-fail', 'Eri virhe', 2_400),
    OracleQueueConflictError,
  )
})

test('saman omistajan vuorot suoritetaan järjestyksessä ja seuraava saa uusimman session', async () => {
  const backend = createMemoryOracleBackend()
  await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Ensimmäinen', idempotencyKey: 'request-concurrent-1' },
    { id: () => 'message-concurrent-1', now: () => 1_000 },
  )
  await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Toinen', idempotencyKey: 'request-concurrent-2' },
    { id: () => 'message-concurrent-2', now: () => 1_001 },
  )
  const first = await claimNextOracleMessage(backend, { id: () => 'claim-first', now: () => 1_100 })
  assert.equal(first?.id, 'message-concurrent-1')
  const blocked = await claimNextOracleMessage(backend, { id: () => 'claim-blocked', now: () => 1_101 })
  assert.equal(blocked, null)

  await completeOracleMessage(backend, 'message-concurrent-1', 'claim-first', 'Valmis', 1_200, 'server-session')
  const second = await claimNextOracleMessage(backend, { id: () => 'claim-second', now: () => 1_201 })
  assert.equal(second?.id, 'message-concurrent-2')
  assert.equal(second?.sessionId, 'server-session')
})

test('bridge-tapahtumat saavat palvelimella monotonisen sequencen ja rajatun näkymän', async () => {
  const backend = createMemoryOracleBackend()
  await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Tee työ', idempotencyKey: 'request-events01' },
    { now: () => 1_000, id: () => 'message-events' },
  )
  await claimNextOracleMessage(backend, { now: () => 2_000, id: () => 'claim-events' })
  await markOracleMessageRunning(backend, 'message-events', 'claim-events', 'run-events', 2_100)

  const first = await recordOracleEvent(backend, 'message-events', 'claim-events', {
    sourceId: 'event-1', type: 'tool.started', tool: 'terminal', preview: 'Bearer private-token /opt/data/private/file', error: false,
  }, 2_200)
  const replay = await recordOracleEvent(backend, 'message-events', 'claim-events', {
    sourceId: 'event-1', type: 'tool.started', tool: 'terminal', preview: 'changed replay', error: false,
  }, 2_250)
  const second = await recordOracleEvent(backend, 'message-events', 'claim-events', {
    sourceId: 'event-2', type: 'tool.completed', tool: 'terminal', preview: null, error: false,
  }, 2_300)

  assert.equal(first.sequence, 1)
  assert.equal(replay.sequence, 1)
  assert.equal(second.sequence, 2)
  assert.deepEqual(second.events?.map(event => event.sequence), [1, 2])
  assert.equal(second.events?.[0]?.tool, 'terminal')
  assert.deepEqual(oracleMessageView(second).events[0], {
    type: 'tool.started', tool: 'terminal', error: false, sequence: 1, createdAt: 2_200,
  })
})

test('vanhentunut hyväksyntää odottava lease voidaan lunastaa uudelleen', async () => {
  const backend = createMemoryOracleBackend()
  await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Tee työ', idempotencyKey: 'request-approval-lease' },
    { id: () => 'message-lease', now: () => 1_000 },
  )
  await claimNextOracleMessage(backend, { id: () => 'claim-old', now: () => 2_000 }, 100)
  await markOracleMessageRunning(backend, 'message-lease', 'claim-old', 'run-old', 2_010, 100)
  await recordOracleApprovalRequest(
    backend, 'message-lease', 'claim-old',
    { requestId: 'approval-old', command: null, description: 'Lupa', tool: 'terminal' }, 2_020,
  )

  const reclaimed = await claimNextOracleMessage(
    backend, { id: () => 'claim-new', now: () => 2_111 }, 30_000,
  )
  assert.equal(reclaimed?.status, 'claimed')
  assert.equal(reclaimed?.claimToken, 'claim-new')
  assert.equal(reclaimed?.approval?.requestId, 'approval-old')
})
