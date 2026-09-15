import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  approveOraclePrompt,
  cancelOraclePrompt,
  isOracleTerminal,
  oracleLiveAnswer,
  oracleStatusLabel,
  oracleUiEffect,
  runOraclePrompt,
  watchOraclePrompt,
} from './oracleClient.ts'
import type { OracleEventView } from './oracleQueue.ts'

function toolEvent(sequence: number): OracleEventView {
  return { type: 'tool.started', tool: 'terminal', error: false, sequence, createdAt: sequence }
}

test('Oracle-käyttöliittymävaikutus suoritetaan yhdelle viestille vain kerran', () => {
  const message = {
    id: 'message-ui', status: 'completed' as const, answer: 'Valmis', error: null,
    approval: null, approvalDecision: null, sequence: 0, events: [], createdAt: 1, updatedAt: 2,
    action: { action: 'navigate' as const, href: '/arxcian/trading', label: 'Trading' },
    proposal: { id: 'proposal-1', tool: 'create_note', summary: 'Luodaan muistiinpano' },
  }

  assert.deepEqual(oracleUiEffect(message, null), {
    key: 'message-ui', action: message.action, proposal: message.proposal,
  })
  assert.equal(oracleUiEffect(message, 'message-ui'), null)
  assert.equal(oracleUiEffect({ ...message, status: 'running' }, null), null)
})

function response(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, async json() { return body } }
}

test('Oracle-tilat esitetään käyttäjälle selkeällä suomenkielisellä tekstillä', () => {
  assert.equal(oracleStatusLabel('queued'), 'Jonossa')
  assert.equal(oracleStatusLabel('claimed'), 'VPS käsittelee')
  assert.equal(oracleStatusLabel('running'), 'Oracle työskentelee')
  assert.equal(oracleStatusLabel('cancelling'), 'Keskeytetään')
  assert.equal(oracleStatusLabel('completed'), 'Valmis')
  assert.equal(oracleStatusLabel('failed'), 'Epäonnistui')
  assert.equal(isOracleTerminal('cancelling'), false)
  assert.equal(isOracleTerminal('cancelled'), true)
})

test('Oracle-asiakas jonottaa viestin ja seuraa sitä valmistumiseen', async () => {
  const calls: Array<{ url: string; options?: RequestInit }> = []
  const lifecycle: string[] = []
  const replies = [
    response(202, { message: { id: 'message-1', status: 'queued', sessionId: null } }),
    response(200, { message: { id: 'message-1', status: 'running', sessionId: null, runId: 'run-1' } }),
    response(200, { message: { id: 'message-1', status: 'completed', sessionId: 'session-1', answer: 'Valmis' } }),
  ]
  const statuses: string[] = []
  const fetchImpl = async (url: string | URL | Request, options?: RequestInit) => {
    calls.push({ url: String(url), options })
    return replies.shift() as Response
  }

  const result = await runOraclePrompt({
    prompt: 'Tee työ',
    fetchImpl,
    idempotencyKey: 'request-abcdefgh',
    onPrepared: key => lifecycle.push(`prepared:${key}`),
    onSubmitted: message => lifecycle.push(`submitted:${message.id}`),
    sleep: async () => {},
    onStatus: message => statuses.push(message.status),
  })

  assert.equal(result.answer, 'Valmis')
  assert.deepEqual(statuses, ['queued', 'running', 'completed'])
  assert.deepEqual(lifecycle, ['prepared:request-abcdefgh', 'submitted:message-1'])
  assert.deepEqual(JSON.parse(calls[0].options?.body as string), {
    prompt: 'Tee työ', idempotencyKey: 'request-abcdefgh',
  })
})

test('Oracle-asiakas keskeyttää palvelimella olevan työn', async () => {
  const calls: string[] = []
  const message = { id: 'message-1', status: 'cancelled' }
  const result = await cancelOraclePrompt('message-1', async url => {
    calls.push(String(url))
    return response(200, { message }) as Response
  })

  assert.deepEqual(result, message)
  assert.deepEqual(calls, ['/api/arxcian/oracle/messages/message-1/cancel'])
})

test('Oracle-asiakas jatkaa aiemmin jonotetun tehtävän seurantaa', async () => {
  const replies = [
    response(200, { message: { id: 'message-1', status: 'running' } }),
    response(200, { message: { id: 'message-1', status: 'completed', answer: 'Palautettu' } }),
  ]
  const statuses: string[] = []
  const result = await watchOraclePrompt('message-1', {
    fetchImpl: async () => replies.shift() as Response,
    sleep: async () => {},
    onStatus: message => statuses.push(message.status),
  })

  assert.equal(result.answer, 'Palautettu')
  assert.deepEqual(statuses, ['running', 'completed'])
})

test('Oracle-seurannan yksittäinen verkkopyyntö aikakatkaistaan', async () => {
  const fetchImpl = async (_url: string | URL | Request, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })

  await assert.rejects(
    watchOraclePrompt('message-timeout', { fetchImpl, fetchTimeoutMs: 10 }),
    /verkkopyyntö aikakatkaistiin/,
  )
})

test('Oracle-asiakas lähettää vain kertahyväksynnän tai hylkäyksen', async () => {
  const calls: Array<{ url: string; body: string }> = []
  const result = await approveOraclePrompt('message-1', 'once', async (
    url: string | URL | Request, options?: RequestInit,
  ) => {
    calls.push({ url: String(url), body: String(options?.body) })
    return response(200, { message: { id: 'message-1', status: 'waiting_approval', approvalDecision: 'once' } }) as Response
  })

  assert.equal(result.approvalDecision, 'once')
  assert.deepEqual(calls, [{
    url: '/api/arxcian/oracle/messages/message-1/approval',
    body: JSON.stringify({ choice: 'once' }),
  }])
})

function messageWithLiveAnswer(liveAnswer: string | null, events: OracleEventView[] = []) {
  return {
    id: 'm', status: 'running' as const, answer: null, error: null, approval: null,
    approvalDecision: null, sequence: events.length, createdAt: 1, updatedAt: 2, liveAnswer, events,
  }
}

test('Oraclen osittainen vastaus tulee liveAnswer-kentästä', () => {
  const message = messageWithLiveAnswer('Hei maailma')
  assert.equal(oracleLiveAnswer(message), 'Hei maailma')
})

test('Oraclen osittainen vastaus ohittaa events-listan esikatselut kokonaan', () => {
  // message.delta ei enää kulje events-listan kautta (ks. oracleQueue.ts) —
  // vaikka listalla olisi jotain, liveAnswer on ainoa lähde.
  const message = messageWithLiveAnswer('Hei maailma', [toolEvent(1)])
  assert.equal(oracleLiveAnswer(message), 'Hei maailma')
})

test('Oraclen osittainen vastaus ei koskaan näytä valmista arxcian-ui-merkintää', () => {
  const message = messageWithLiveAnswer(
    'Avaan Trading-näkymän.\n<arxcian-ui>{"action":{"target":"trading"},"proposal":null}</arxcian-ui>',
  )
  assert.equal(oracleLiveAnswer(message), 'Avaan Trading-näkymän.')
})

test('Oraclen osittainen vastaus piilottaa merkinnän myös kesken pirstoutuneena', () => {
  const cases = [
    'Valmis.\n<',
    'Valmis.\n<arxcian',
    'Valmis.\n<arxcian-ui>',
    'Valmis.\n<arxcian-ui>{"action":n',
    'Valmis.\n<arxcian-ui>{"action":null,"prop',
  ]
  for (const raw of cases) {
    assert.equal(oracleLiveAnswer(messageWithLiveAnswer(raw)), 'Valmis.', `epäonnistui: ${JSON.stringify(raw)}`)
  }
})

test('Oraclen osittainen vastaus ei piilota tekstiin kuuluvaa < -merkkiä', () => {
  const message = messageWithLiveAnswer('Ehto on x < 10 ja se pätee.')
  assert.equal(oracleLiveAnswer(message), 'Ehto on x < 10 ja se pätee.')
})

test('kesken oleva arxcian-ui-JSON ei vuoda näkyviin vaikka sisältö sisältää < -merkin', () => {
  // Regressio: lastIndexOf('<') osui aiemmin JSON-sisällön omaan
  // <-merkkiin eikä tagin alkuun, jolloin koko kesken oleva JSON jäi
  // näkyviin siihen asti kun tagi sulkeutuu.
  const raw = 'Valmis.\n<arxcian-ui>{"action":{"target":"a<b"},"proposal":n'
  assert.equal(oracleLiveAnswer(messageWithLiveAnswer(raw)), 'Valmis.')
})

test('Oraclen osittainen vastaus säilyy vaikka events-rengas olisi täynnä muita tapahtumia', () => {
  // Regressio: message.delta oli aiemmin osa samaa 100 tapahtuman
  // events-rengasta kuin työkalutapahtumat, joten pitkä ajo häätäisi
  // vastauksen alun pois. liveAnswer on nyt oma kenttä, joten 150
  // työkalutapahtumaa listalla ei vaikuta siihen mitään.
  const manyToolEvents = Array.from({ length: 150 }, (_unused, index) => toolEvent(index))
  const message = messageWithLiveAnswer('Alku pysyy ja loppu tulee perään', manyToolEvents)
  assert.equal(oracleLiveAnswer(message), 'Alku pysyy ja loppu tulee perään')
})

test('Oraclen osittainen vastaus on tyhjä ilman liveAnsweria', () => {
  const message = messageWithLiveAnswer(null)
  assert.equal(oracleLiveAnswer(message), '')
})

test('Oracle-asiakas välittää valitun kuukauden ja näkymän samassa pyynnössä', async () => {
  const context = { route: '/arxcian/rj-mob/etela', fileId: 'month_202609', view: 'uusmyynti' }
  await runOraclePrompt({ prompt: 'Vertaa', idempotencyKey: 'view-request', viewContext: context, fetchImpl: async (_url, options) => {
    assert.deepEqual(JSON.parse(options?.body as string).viewContext, context)
    return response(200, { message: { id: 'view-1', status: 'completed', answer: 'Valmis' } }) as Response
  } })
})
