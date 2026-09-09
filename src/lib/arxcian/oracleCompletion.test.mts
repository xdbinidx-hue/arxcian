import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claimNextOracleMessage, createMemoryOracleBackend, enqueueOracleMessage, oracleMessageView } from './oracleQueue.ts'
import { finalizeOracleCompletion } from './oracleCompletion.ts'

test('Oracle-tulos validoi navigoinnin ja tallentaa kirjoituksen vain ehdotuksena', async () => {
  const backend = createMemoryOracleBackend()
  await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Avaa Trading ja tee muistiinpano', idempotencyKey: 'request-ui-final1' },
    { now: () => 1_000, id: () => 'message-ui-final' },
  )
  await claimNextOracleMessage(backend, { now: () => 2_000, id: () => 'claim-ui-final' })
  const saved: Array<Record<string, unknown>> = []

  const completed = await finalizeOracleCompletion({
    backend,
    id: 'message-ui-final',
    claimToken: 'claim-ui-final',
    answer: 'Avaan Trading-näkymän ja valmistelin ehdotuksen.',
    sessionId: 'session-ui-final',
    interaction: {
      action: { target: 'trading' },
      proposal: { tool: 'create_note', input: { text: 'Muista tämä' } },
    },
  }, {
    now: () => 3_000,
    prepareProposal: async (tool, input, user) => ({
      ok: true as const,
      proposal: {
        id: 'random-id', user, tool, args: input,
        summary: 'Luodaan muistiinpano: "Muista tämä"', createdAt: 9_999,
      },
    }),
    saveProposal: async proposal => { saved.push(proposal) },
    deleteProposal: async () => {},
  })

  assert.equal(saved.length, 1)
  assert.match(String(saved[0]?.id), /^[0-9a-f-]{36}$/)
  assert.equal(saved[0]?.createdAt, 3_000)
  assert.equal(saved[0]?.user, 'albin')
  assert.deepEqual(oracleMessageView(completed).action, {
    action: 'navigate', href: '/arxcian/trading', label: 'Trading',
  })
  assert.deepEqual(oracleMessageView(completed).proposal, {
    id: saved[0]?.id, tool: 'create_note', summary: 'Luodaan muistiinpano: "Muista tämä"',
  })
})

test('tuntematon Oracle-toiminto ei kirjoita eikä jätä työtä leaseen', async () => {
  const backend = createMemoryOracleBackend()
  await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Tee tuntematon', idempotencyKey: 'request-ui-invalid1' },
    { now: () => 1_000, id: () => 'message-ui-invalid' },
  )
  await claimNextOracleMessage(backend, { now: () => 2_000, id: () => 'claim-ui-invalid' })
  let saved = false

  const completed = await finalizeOracleCompletion({
    backend,
    id: 'message-ui-invalid',
    claimToken: 'claim-ui-invalid',
    answer: 'Teen sen.',
    sessionId: null,
    interaction: { action: { target: 'missing' }, proposal: { tool: 'delete_everything', input: {} } },
  }, {
    now: () => 3_000,
    prepareProposal: async () => { throw new Error('ei saa kutsua') },
    saveProposal: async () => { saved = true },
    deleteProposal: async () => {},
  })

  assert.equal(saved, false)
  assert.equal(completed.status, 'completed')
  assert.equal(completed.action, null)
  assert.equal(completed.proposal, null)
  assert.match(completed.answer ?? '', /toimintoa ei voitu valmistella/i)
})

test('ristiriitainen terminal-uusinta hylätään eikä hyväksyttyä proposalia poisteta', async () => {
  const backend = createMemoryOracleBackend()
  await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Tee muistiinpano', idempotencyKey: 'request-ui-retry1' },
    { now: () => 1_000, id: () => 'message-ui-retry' },
  )
  await claimNextOracleMessage(backend, { now: () => 2_000, id: () => 'claim-ui-retry' })
  const saved: Array<Record<string, unknown>> = []
  const deleted: string[] = []
  const deps = {
    now: () => 3_000,
    prepareProposal: async (tool: 'create_note', input: unknown, user: 'albin' | 'arbnor') => ({
      ok: true as const,
      proposal: {
        id: 'random-id', user, tool, args: input as { text: string },
        summary: 'Luodaan muistiinpano', createdAt: 3_000,
      },
    }),
    saveProposal: async (proposal: Record<string, unknown>) => { saved.push(proposal) },
    deleteProposal: async (_user: 'albin' | 'arbnor', id: string) => { deleted.push(id) },
  }
  const interaction = { proposal: { tool: 'create_note', input: { text: 'Ensimmäinen' } } }

  await finalizeOracleCompletion({
    backend, id: 'message-ui-retry', claimToken: 'claim-ui-retry',
    answer: 'Valmis', sessionId: 'session-1', interaction,
  }, deps)

  await assert.rejects(
    finalizeOracleCompletion({
      backend, id: 'message-ui-retry', claimToken: 'claim-ui-retry',
      answer: 'Ristiriitainen vastaus', sessionId: 'session-1', interaction,
    }, deps),
    /lunastus ei ole enää voimassa/i,
  )
  assert.equal(deleted.length, 0)
  assert.equal(saved[0]?.id, saved[1]?.id)
})

test('eri claim-tokenit eivät jaa proposal-tunnistetta', async () => {
  const makeBackend = () => createMemoryOracleBackend()
  const ids: string[] = []
  for (const claimToken of ['claim-stale', 'claim-current']) {
    const backend = makeBackend()
    await enqueueOracleMessage(
      backend,
      { owner: 'albin', prompt: 'Tee muistiinpano', idempotencyKey: `request-${claimToken}` },
      { now: () => 1_000, id: () => 'message-shared' },
    )
    await claimNextOracleMessage(backend, { now: () => 2_000, id: () => claimToken })
    await finalizeOracleCompletion({
      backend, id: 'message-shared', claimToken, answer: 'Valmis', sessionId: null,
      interaction: { proposal: { tool: 'create_note', input: { text: 'Muista' } } },
    }, {
      now: () => 3_000,
      prepareProposal: async (tool, input, user) => ({
        ok: true as const,
        proposal: { id: 'random', user, tool, args: input, summary: 'Muista', createdAt: 3_000 },
      }),
      saveProposal: async proposal => { ids.push(proposal.id) },
      deleteProposal: async () => {},
    })
  }

  assert.notEqual(ids[0], ids[1])
})
