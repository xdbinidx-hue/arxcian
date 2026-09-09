import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claimNextOracleMessage, createMemoryOracleBackend, enqueueOracleMessage, oracleMessageView } from './oracleQueue.ts'
import { finalizeOracleCompletion, isOracleProposalActive } from './oracleCompletion.ts'

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
  })

  assert.equal(saved.length, 1)
  assert.match(String(saved[0]?.id), /^[0-9a-f-]{36}$/)
  assert.equal(saved[0]?.createdAt, 3_000)
  assert.equal(saved[0]?.user, 'albin')
  assert.equal(saved[0]?.oracleMessageId, 'message-ui-final')
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
  await assert.rejects(
    finalizeOracleCompletion({
      backend, id: 'message-ui-retry', claimToken: 'claim-ui-retry',
      answer: 'Valmis', sessionId: null, interaction,
    }, deps),
    /lunastus ei ole enää voimassa/i,
  )
  await assert.rejects(
    finalizeOracleCompletion({
      backend, id: 'message-ui-retry', claimToken: 'claim-ui-retry',
      answer: 'Valmis', sessionId: 'session-1',
      interaction: { proposal: { tool: 'create_note', input: { text: 'Toinen' } } },
    }, deps),
    /lunastus ei ole enää voimassa/i,
  )
  assert.equal(saved[0]?.id, saved[1]?.id)
  assert.notEqual(saved[0]?.id, saved[3]?.id)
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
    })
  }

  assert.notEqual(ids[0], ids[1])
})

test('vanhentunut claim ei voi jättää proposalia voimaan uuden claimin valmistuttua', async () => {
  const backend = createMemoryOracleBackend()
  await enqueueOracleMessage(
    backend,
    { owner: 'albin', prompt: 'Tee muistiinpano', idempotencyKey: 'request-race-real1' },
    { now: () => 1_000, id: () => 'message-race-real' },
  )
  await claimNextOracleMessage(backend, { now: () => 2_000, id: () => 'claim-stale' })
  const stored = new Map<string, Record<string, unknown>>()

  const stale = finalizeOracleCompletion({
    backend, id: 'message-race-real', claimToken: 'claim-stale',
    answer: 'Vanha vastaus', sessionId: 'session-stale',
    interaction: { proposal: { tool: 'create_note', input: { text: 'Vanha' } } },
  }, {
    now: () => 3_000,
    prepareProposal: async (tool, input, user) => ({
      ok: true as const,
      proposal: { id: 'random', user, tool, args: input, summary: 'Vanha', createdAt: 3_000 },
    }),
    saveProposal: async proposal => {
      stored.set(proposal.id, proposal)
      await claimNextOracleMessage(backend, { now: () => 40_000, id: () => 'claim-current' })
      await finalizeOracleCompletion({
        backend, id: 'message-race-real', claimToken: 'claim-current',
        answer: 'Nykyinen vastaus', sessionId: 'session-current',
        interaction: { proposal: { tool: 'create_note', input: { text: 'Nykyinen' } } },
      }, {
        now: () => 41_000,
        prepareProposal: async (tool, input, user) => ({
          ok: true as const,
          proposal: { id: 'random', user, tool, args: input, summary: 'Nykyinen', createdAt: 41_000 },
        }),
        saveProposal: async current => { stored.set(current.id, current) },
      })
    },
  })

  await assert.rejects(stale, /lunastus ei ole enää voimassa/i)
  const completed = await backend.get('message-race-real')
  assert.equal(completed?.answer, 'Nykyinen vastaus')
  assert.ok(completed?.proposal?.id)
  assert.equal(stored.has(completed?.proposal?.id ?? ''), true)
  assert.equal(stored.size, 2)
  const staleProposal = [...stored.values()].find(proposal => proposal.id !== completed?.proposal?.id)
  assert.ok(staleProposal)
  assert.equal(await isOracleProposalActive(backend, staleProposal as never), false)
})

test('vain valmisviestin viittaama Oracle-proposal on aktiivinen', async () => {
  const backend = createMemoryOracleBackend([{
    id: 'message-active-proposal', owner: 'albin', prompt: 'Tee muistiinpano',
    idempotencyKey: 'request-active-proposal', status: 'completed',
    sessionId: null, runId: null, claimToken: null, leaseUntil: null,
    answer: 'Valmis', error: null, approval: null, approvalDecision: null,
    proposal: { id: '11111111-1111-4111-8111-111111111111', tool: 'create_note', summary: 'Muistiinpano' },
    terminalClaimToken: 'claim-active', createdAt: 1_000, updatedAt: 2_000,
  }])
  const active = {
    id: '11111111-1111-4111-8111-111111111111', user: 'albin' as const,
    tool: 'create_note' as const, args: { text: 'Aktiivinen' }, summary: 'Muistiinpano',
    createdAt: 2_000, oracleMessageId: 'message-active-proposal',
  }

  assert.equal(await isOracleProposalActive(backend, active), true)
  assert.equal(await isOracleProposalActive(backend, { ...active, id: '22222222-2222-4222-8222-222222222222' }), false)
  assert.equal(await isOracleProposalActive(backend, { ...active, user: 'arbnor' }), false)
  assert.equal(await isOracleProposalActive(backend, { ...active, oracleMessageId: 'missing' }), false)
  const legacy = { ...active }
  delete (legacy as { oracleMessageId?: string }).oracleMessageId
  assert.equal(await isOracleProposalActive(backend, legacy), true)
})
