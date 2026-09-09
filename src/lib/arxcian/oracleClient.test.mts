import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  approveOraclePrompt,
  cancelOraclePrompt,
  isOracleTerminal,
  oracleStatusLabel,
  oracleUiEffect,
  runOraclePrompt,
  watchOraclePrompt,
} from './oracleClient.ts'

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
