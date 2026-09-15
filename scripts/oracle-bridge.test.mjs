import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  forwardHermesRunEvents,
  parseOracleOutput,
  processOneOracleMessage,
  validateAppBaseUrl,
  validateHermesBaseUrl,
} from './oracle-bridge-lib.mjs'

test('Oracle-vastauksen käyttöliittymäkomento erotetaan ilman toista malliajoa', () => {
  const result = parseOracleOutput([
    'Avaan Trading-näkymän.',
    '<arxcian-ui>{"action":{"target":"trading"},"proposal":{"tool":"create_note","input":{"text":"Muista tämä"}}}</arxcian-ui>',
  ].join('\n'))

  assert.deepEqual(result, {
    answer: 'Avaan Trading-näkymän.',
    interaction: {
      action: { target: 'trading' },
      proposal: { tool: 'create_note', input: { text: 'Muista tämä' } },
    },
  })
})

test('virheellinen Oracle-käyttöliittymäkomento jää tavalliseksi vastaukseksi', () => {
  const output = 'Valmis.\n<arxcian-ui>{ei jsonia}</arxcian-ui>'
  assert.deepEqual(parseOracleOutput(output), { answer: output, interaction: null })
})

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body },
  }
}

test('Hermes bearer -avaimen kohde rajataan localhostiin', () => {
  assert.equal(
    validateHermesBaseUrl('http://127.0.0.1:8642/p/oracle'),
    'http://127.0.0.1:8642/p/oracle',
  )
  assert.throws(() => validateHermesBaseUrl('http://127.0.0.1:8642'), /Oracle-profiili/)
  assert.throws(() => validateHermesBaseUrl('http://localhost:8642/p/default'), /Oracle-profiili/)
  assert.throws(() => validateHermesBaseUrl('https://attacker.example'), /localhost/)
  assert.throws(() => validateHermesBaseUrl('http://127.0.0.1.attacker.example'), /localhost/)
})

test('bridge-salaisuuden kohde vaatii HTTPS:n tai localhostin', () => {
  assert.equal(validateAppBaseUrl('https://arxcian.example/'), 'https://arxcian.example')
  assert.equal(validateAppBaseUrl('http://127.0.0.1:3100'), 'http://127.0.0.1:3100')
  assert.throws(() => validateAppBaseUrl('http://arxcian.example'), /HTTPS/)
  assert.throws(() => validateAppBaseUrl('https://user:pass@arxcian.example'), /käyttäjätietoja/)
})

test('Hermes SSE -työkalutapahtumat välitetään rajattuina bridge-event-reitille', async () => {
  const encoder = new TextEncoder()
  const makeStream = () => new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"event":"tool.started","run_id":"run-events","timestamp":100.25,"tool":"terminal","preview":"Ajetaan testi"}\n\n'))
      controller.enqueue(encoder.encode('data: {"event":"tool.completed","run_id":"run-events","timestamp":101.25,"tool":"terminal","error":false}\n\n'))
      controller.close()
    },
  })
  const posts = []
  const fetchImpl = async (url, options = {}) => {
    const target = String(url)
    if (target.endsWith('/events')) return { ok: true, status: 200, body: makeStream() }
    posts.push({ url: target, body: JSON.parse(options.body) })
    return response(200, { message: { sequence: posts.length } })
  }

  await forwardHermesRunEvents({
    fetchImpl,
    appBaseUrl: 'https://arxcian.test',
    bridgeSecret: 'bridge-secret',
    hermesBaseUrl: 'http://127.0.0.1:8642/p/oracle',
    hermesApiKey: 'test-hermes-key',
    runId: 'run-events',
    messageId: 'message-events',
    claimToken: 'claim-events',
  })
  await forwardHermesRunEvents({
    fetchImpl,
    appBaseUrl: 'https://arxcian.test',
    bridgeSecret: 'bridge-secret',
    hermesBaseUrl: 'http://127.0.0.1:8642/p/oracle',
    hermesApiKey: 'test-key',
    runId: 'run-events',
    messageId: 'message-events',
    claimToken: 'claim-events',
  })

  assert.equal(posts.length, 4)
  assert.equal(posts[0].url, 'https://arxcian.test/api/arxcian/oracle/bridge/event')
  assert.match(posts[0].body.event.sourceId, /^run-events:[a-f0-9]{32}$/)
  assert.equal(posts[2].body.event.sourceId, posts[0].body.event.sourceId)
  assert.equal(posts[3].body.event.sourceId, posts[1].body.event.sourceId)
  assert.notEqual(posts[0].body.event.sourceId, posts[1].body.event.sourceId)
  assert.deepEqual({ ...posts[0].body.event, sourceId: undefined }, {
    sourceId: undefined, type: 'tool.started', tool: 'terminal', preview: 'Ajetaan testi', error: false,
  })
})

test('Hermes SSE -message.delta-osat koalesoidaan yhdeksi kumulatiiviseksi lähetykseksi', async () => {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"event":"message.delta","run_id":"run-delta","timestamp":300,"text":"Hei"}\n\n'))
      controller.enqueue(encoder.encode('data: {"event":"message.delta","run_id":"run-delta","timestamp":300,"text":" maailma"}\n\n'))
      controller.enqueue(encoder.encode('data: {"event":"message.delta","run_id":"run-delta","timestamp":301,"text":""}\n\n'))
      controller.close()
    },
  })
  const posts = []
  const fetchImpl = async (url, options = {}) => {
    const target = String(url)
    if (target.endsWith('/events')) return { ok: true, status: 200, body: stream }
    posts.push({ url: target, body: JSON.parse(options.body) })
    return response(200, { message: { sequence: posts.length } })
  }

  await forwardHermesRunEvents({
    fetchImpl,
    appBaseUrl: 'https://arxcian.test',
    bridgeSecret: 'bridge-secret',
    hermesBaseUrl: 'http://127.0.0.1:8642/p/oracle',
    hermesApiKey: 'test-hermes-key',
    runId: 'run-delta',
    messageId: 'message-delta',
    claimToken: 'claim-delta',
  })

  // Kaikki SSE-frameet saapuvat synkronisesti ennen kuin virran loppu
  // pakottaa lopullisen lähetyksen (drain) — ei siis yhtä POSTia per token,
  // vaan yksi kumulatiivinen lähetys jossa väli säilyy ("Hei maailma", ei
  // "Heimaailma"). Tyhjä delta ei kanna näytettävää tekstiä eikä vaikuta.
  assert.equal(posts.length, 1)
  assert.equal(posts[0].body.event.type, 'message.delta')
  assert.equal(posts[0].body.event.preview, 'Hei maailma')
  assert.match(posts[0].body.event.sourceId, /^run-delta:/)
})

test('nopeat message.delta-osat eivät odota HTTP-vastausta ennen seuraavaa, ja hidas HTTP ei monista pyyntöjä', async () => {
  const encoder = new TextEncoder()
  const tokenCount = 20
  const tokens = Array.from({ length: tokenCount }, (_unused, index) => `sana${index}`)
  const stream = new ReadableStream({
    async start(controller) {
      // Kaksi purskausta simuloi mallia joka tuottaa tokeneita nopeasti:
      // ensimmäinen erä saapuu heti, toinen pienen tauon jälkeen kun
      // ensimmäinen hidas POST on jo ehtinyt käynnistyä mutta ei valmistua.
      for (const token of tokens.slice(0, 12)) {
        controller.enqueue(encoder.encode(
          `data: {"event":"message.delta","run_id":"run-slow","timestamp":1,"text":" ${token}"}\n\n`,
        ))
      }
      await new Promise(resolve => setTimeout(resolve, 150))
      for (const token of tokens.slice(12)) {
        controller.enqueue(encoder.encode(
          `data: {"event":"message.delta","run_id":"run-slow","timestamp":1,"text":" ${token}"}\n\n`,
        ))
      }
      controller.close()
    },
  })
  const posts = []
  const slowPostMs = 50
  const fetchImpl = async (url, options = {}) => {
    const target = String(url)
    if (target.endsWith('/events')) return { ok: true, status: 200, body: stream }
    await new Promise(resolve => setTimeout(resolve, slowPostMs))
    posts.push({ url: target, body: JSON.parse(options.body) })
    return response(200, { message: { sequence: posts.length } })
  }

  const startedAt = Date.now()
  await forwardHermesRunEvents({
    fetchImpl,
    appBaseUrl: 'https://arxcian.test',
    bridgeSecret: 'bridge-secret',
    hermesBaseUrl: 'http://127.0.0.1:8642/p/oracle',
    hermesApiKey: 'test-hermes-key',
    runId: 'run-slow',
    messageId: 'message-slow',
    claimToken: 'claim-slow',
    deltaCadenceMs: 5,
  })
  const elapsedMs = Date.now() - startedAt

  const fullText = tokens.map(token => ` ${token}`).join('')

  // 20 tokenia hitaalla (50ms) HTTP:llä veisi sarjallisena vähintään 1000ms.
  // Koalesointi rajaa lähetysten määrän murto-osaan siitä, joten koko ajo
  // pysyy selvästi alle sen.
  assert.ok(posts.length >= 1 && posts.length < tokenCount, `odottamaton lähetysmäärä: ${posts.length}`)
  assert.ok(elapsedMs < slowPostMs * tokenCount * 0.5, `kesti liian kauan: ${elapsedMs}ms`)

  // Väliaikainen näkyvä teksti: ensimmäinen lähetys on aito prefiksi koko
  // vastauksesta eikä vielä sisällä sitä kokonaan — todiste siitä että
  // käyttäjä näkisi osittaisen tekstin ennen striimin loppua, ei vasta
  // lopussa kerralla.
  assert.ok(posts[0].body.event.preview.length < fullText.length, 'ensimmäinen lähetys ei ollut osittainen')
  assert.ok(fullText.startsWith(posts[0].body.event.preview), 'ensimmäinen lähetys ei ollut prefiksi')

  // Lopullinen lähetys sisältää koko tekstin oikeassa järjestyksessä,
  // välilyönnit säilyneinä — ei pudonnutta prefiksiä eikä kadonnutta väliä.
  const last = posts[posts.length - 1]
  assert.equal(last.body.event.preview, fullText)
})

test('Hermes-eventin epäselvä verkkokatkos uusitaan samalla sourceId-tunnisteella', async () => {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"event":"tool.started","run_id":"run-retry","timestamp":200.5,"tool":"terminal"}\n\n'))
      controller.close()
    },
  })
  const attempts = []
  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith('/events')) return { ok: true, status: 200, body: stream }
    attempts.push(JSON.parse(options.body))
    if (attempts.length === 1) throw new TypeError('connection reset')
    return response(200, { message: { sequence: 1 } })
  }

  await forwardHermesRunEvents({
    fetchImpl,
    appBaseUrl: 'https://arxcian.test',
    bridgeSecret: 'bridge-secret',
    hermesBaseUrl: 'http://127.0.0.1:8642/p/oracle',
    hermesApiKey: 'test-key',
    runId: 'run-retry',
    messageId: 'message-retry',
    claimToken: 'claim-retry',
    sleep: async () => {},
  })

  assert.equal(attempts.length, 2)
  assert.equal(attempts[0].event.sourceId, attempts[1].event.sourceId)
})

test('Hermes SSE -tapahtumavirta aikakatkaistaan ja lukija perutaan', async () => {
  let cancelled = false
  const stream = new ReadableStream({
    cancel() { cancelled = true },
  })
  const fetchImpl = async url => {
    if (String(url).endsWith('/events')) return { ok: true, status: 200, body: stream }
    throw new Error(`Odottamaton URL ${url}`)
  }

  await assert.rejects(
    forwardHermesRunEvents({
      fetchImpl,
      appBaseUrl: 'https://arxcian.test',
      bridgeSecret: 'bridge-secret',
      hermesBaseUrl: 'http://127.0.0.1:8642/p/oracle',
      hermesApiKey: 'test-key',
      runId: 'run-timeout',
      messageId: 'message-timeout',
      claimToken: 'claim-timeout',
      idleTimeoutMs: 10,
    }),
    /aikakatkaistiin/,
  )
  assert.equal(cancelled, true)
})

test('tuotantobridge avaa Hermes-event-streamin ajon rinnalle', async () => {
  const calls = []
  const emptyStream = new ReadableStream({ start(controller) { controller.close() } })
  const fetchImpl = async (url, options = {}) => {
    const target = String(url)
    calls.push({ url: target, options })
    if (target.endsWith('/bridge/claim')) return response(200, { message: { id: 'message-stream', prompt: 'Tee työ', viewContext: { selection: { fileId: 'month_202609' }, data: { missing: null, zero: 0 } }, sessionId: null, claimToken: 'claim-stream' } })
    if (target === 'http://127.0.0.1:8642/p/oracle/v1/runs') return response(202, { run_id: 'run-stream' })
    if (target.endsWith('/bridge/running')) return response(200, { message: { status: 'running' } })
    if (target.endsWith('/events')) return { ok: true, status: 200, body: emptyStream }
    if (target.endsWith('/v1/runs/run-stream')) return response(200, { status: 'completed', output: 'Valmis', session_id: 'session-stream' })
    if (target.includes('/bridge/state?')) return response(200, { message: { status: 'running' } })
    if (target.endsWith('/bridge/complete')) return response(200, { message: { status: 'completed' } })
    throw new Error(`Odottamaton URL ${target}`)
  }

  await processOneOracleMessage({
    fetchImpl, appBaseUrl: 'https://arxcian.test', bridgeSecret: 'bridge-secret',
    hermesBaseUrl: 'http://127.0.0.1:8642/p/oracle', hermesApiKey: 'test-hermes-key',
    sleep: async () => {}, maxPolls: 2, forwardEvents: true,
  })

  assert.equal(calls.filter(call => call.url.endsWith('/events')).length, 1)
  const input = JSON.parse(calls.find(call => call.url.endsWith('/v1/runs')).options.body).input
  assert.match(input, /month_202609/)
  assert.match(input, /\"missing\":null/)
  assert.match(input, /\"zero\":0/)
})

test('bridge palaa rauhallisesti kun jonossa ei ole työtä', async () => {
  const result = await processOneOracleMessage({
    fetchImpl: async () => response(204, null),
    appBaseUrl: 'https://arxcian.example',
    bridgeSecret: 'bridge-secret',
    hermesApiKey: 'hermes-secret',
  })
  assert.deepEqual(result, { processed: false })
})

test('bridge välittää jonoviestin Hermes-runiin ja palauttaa pysyvän session', async () => {
  const calls = []
  const replies = [
    response(200, { instructions: 'Palauta Arxcian-käyttöliittymäkomento.', message: {
      id: 'message-1', owner: 'albin', prompt: 'Tee työ',
      idempotencyKey: 'request-abcdefgh', sessionId: null, claimToken: 'claim-1',
    } }),
    response(202, { run_id: 'run-1', status: 'queued' }),
    response(200, { message: { id: 'message-1', status: 'running', runId: 'run-1' } }),
    response(200, { run_id: 'run-1', status: 'running', session_id: 'run-1' }),
    response(200, { message: { id: 'message-1', status: 'running' } }),
    response(200, {
      run_id: 'run-1', status: 'completed', session_id: 'run-1',
      output: 'Valmis\n<arxcian-ui>{"action":{"target":"trading"},"proposal":null}</arxcian-ui>',
    }),
    response(200, { message: { id: 'message-1', status: 'running' } }),
    response(200, { message: { id: 'message-1', status: 'completed' } }),
  ]
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options })
    return replies.shift()
  }

  const result = await processOneOracleMessage({
    fetchImpl,
    appBaseUrl: 'https://arxcian.example',
    bridgeSecret: 'bridge-secret',
    hermesBaseUrl: 'http://127.0.0.1:8642/p/oracle',
    hermesApiKey: 'hermes-secret',
    sleep: async () => {},
    maxPolls: 3,
  })

  assert.deepEqual(result, { processed: true, messageId: 'message-1', runId: 'run-1' })
  assert.equal(calls[1].url, 'http://127.0.0.1:8642/p/oracle/v1/runs')
  assert.equal(calls[1].options.headers.Authorization, 'Bearer hermes-secret')
  assert.equal(calls[1].options.redirect, 'manual')
  assert.equal(calls[2].options.redirect, 'manual')
  assert.equal(calls[1].options.headers['Idempotency-Key'], 'message-1')
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    input: 'Tee työ', instructions: 'Palauta Arxcian-käyttöliittymäkomento.',
  })
  assert.equal(calls[2].url, 'https://arxcian.example/api/arxcian/oracle/bridge/running')
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    id: 'message-1', claimToken: 'claim-1', runId: 'run-1',
  })
  assert.deepEqual(JSON.parse(calls[7].options.body), {
    id: 'message-1',
    claimToken: 'claim-1',
    answer: 'Valmis',
    sessionId: 'run-1',
    interaction: { action: { target: 'trading' }, proposal: null },
  })
})

test('bridge terminalisoi poikkeuksen lunastuksen jälkeen', async () => {
  const calls = []
  const replies = [
    response(200, { message: { id: 'message-error', prompt: 'Tee työ', sessionId: null, claimToken: 'claim-error' } }),
    response(500, { error: 'provider unavailable' }),
    response(200, { message: { status: 'failed' } }),
  ]
  const result = await processOneOracleMessage({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options })
      return replies.shift()
    },
    appBaseUrl: 'https://arxcian.test', bridgeSecret: 'bridge-secret',
    hermesBaseUrl: 'http://127.0.0.1:8642/p/oracle', hermesApiKey: 'fixture-value',
    sleep: async () => {},
  })

  assert.equal(result.failed, true)
  assert.equal(calls[2].url, 'https://arxcian.test/api/arxcian/oracle/bridge/fail')
  assert.equal(JSON.parse(calls[2].options.body).error, 'Oracle-silta epäonnistui.')
})

test('bridge tallentaa Hermeksen epäonnistuneen ajon eikä jätä leasea roikkumaan', async () => {
  const calls = []
  const replies = [
    response(200, { message: {
      id: 'message-2', owner: 'albin', prompt: 'Tee työ',
      idempotencyKey: 'request-failed01', sessionId: 'session-1', claimToken: 'claim-2',
    } }),
    response(202, { run_id: 'run-2', status: 'queued' }),
    response(200, { message: { id: 'message-2', status: 'running', runId: 'run-2' } }),
    response(200, { run_id: 'run-2', status: 'failed', error: 'provider error', session_id: 'session-1' }),
    response(200, { message: { id: 'message-2', status: 'running' } }),
    response(200, { message: { id: 'message-2', status: 'failed' } }),
  ]
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options })
    return replies.shift()
  }

  const result = await processOneOracleMessage({
    fetchImpl,
    appBaseUrl: 'https://arxcian.example',
    bridgeSecret: 'bridge-secret',
    hermesBaseUrl: 'http://127.0.0.1:8642/p/oracle',
    hermesApiKey: 'hermes-secret',
    sleep: async () => {},
  })

  assert.deepEqual(result, { processed: true, failed: true, messageId: 'message-2', runId: 'run-2' })
  assert.equal(calls[5].url, 'https://arxcian.example/api/arxcian/oracle/bridge/fail')
  assert.deepEqual(JSON.parse(calls[5].options.body), {
    id: 'message-2', claimToken: 'claim-2', error: 'Hermes-ajo epäonnistui.',
  })
})

test('bridge pysäyttää Hermes-ajon kun omistaja keskeyttää työn', async () => {
  const calls = []
  const replies = [
    response(200, { message: {
      id: 'message-3', owner: 'albin', prompt: 'Keskeytä minut',
      sessionId: null, claimToken: 'claim-3',
    } }),
    response(202, { run_id: 'run-3', status: 'queued' }),
    response(200, { message: { status: 'running' } }),
    response(200, { run_id: 'run-3', status: 'running' }),
    response(200, { message: { id: 'message-3', status: 'cancelling' } }),
    response(200, { stopped: true }),
    response(200, { run_id: 'run-3', status: 'cancelled' }),
    response(200, { message: { id: 'message-3', status: 'cancelling' } }),
    response(200, { message: { id: 'message-3', status: 'cancelled' } }),
  ]
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options })
    return replies.shift()
  }

  const result = await processOneOracleMessage({
    fetchImpl, appBaseUrl: 'https://arxcian.test', bridgeSecret: 'bridge-secret',
    hermesBaseUrl: 'http://127.0.0.1:8642/p/oracle', hermesApiKey: 'hermes-key',
    sleep: async () => {},
  })

  assert.deepEqual(result, { processed: true, cancelled: true, messageId: 'message-3', runId: 'run-3' })
  assert.equal(calls[4].url, 'https://arxcian.test/api/arxcian/oracle/bridge/state?id=message-3')
  assert.equal(calls[5].url, 'http://127.0.0.1:8642/p/oracle/v1/runs/run-3/stop')
  assert.equal(calls[8].url, 'https://arxcian.test/api/arxcian/oracle/bridge/cancelled')
  assert.equal(calls.filter(call => call.url.endsWith('/stop')).length, 1)
})

test('bridge välittää tarkan Hermes-hyväksynnän omistajan päätöksen jälkeen', async () => {
  const calls = []
  const approval = {
    request_id: 'approval-1', command: 'touch report.txt', description: 'Luo raportti', tool: 'terminal',
  }
  const replies = [
    response(200, { message: { id: 'message-4', prompt: 'Tee työ', sessionId: null, claimToken: 'claim-4' } }),
    response(202, { run_id: 'run-4' }),
    response(200, { message: { status: 'running' } }),
    response(200, { status: 'waiting_for_approval', approval }),
    response(200, { message: { status: 'running' } }),
    response(200, { message: { status: 'waiting_approval' } }),
    response(200, { status: 'waiting_for_approval', approval }),
    response(200, { message: { status: 'waiting_approval', approvalDecision: 'once' } }),
    response(200, { message: { status: 'waiting_approval', approvalDecision: 'once' } }),
    response(200, { resolved: 1 }),
    response(200, { message: { status: 'running' } }),
    response(200, { status: 'waiting_for_approval', approval }),
    response(200, { message: { status: 'running' } }),
    response(200, { status: 'completed', output: 'Valmis', session_id: 'session-4' }),
    response(200, { message: { status: 'running' } }),
    response(200, { message: { status: 'completed' } }),
  ]
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options })
    return replies.shift()
  }

  const result = await processOneOracleMessage({
    fetchImpl, appBaseUrl: 'https://arxcian.test', bridgeSecret: 'bridge-secret',
    hermesBaseUrl: 'http://127.0.0.1:8642/p/oracle', hermesApiKey: 'hermes-secret',
    sleep: async () => {}, maxPolls: 5,
  })

  assert.equal(result.processed, true)
  assert.equal(calls[5].url, 'https://arxcian.test/api/arxcian/oracle/bridge/approval-request')
  assert.equal(calls[9].url, 'http://127.0.0.1:8642/p/oracle/v1/runs/run-4/approval')
  assert.deepEqual(JSON.parse(calls[9].options.body), { choice: 'once', request_id: 'approval-1' })
  assert.equal(calls[10].url, 'https://arxcian.test/api/arxcian/oracle/bridge/approval-resolved')
  assert.equal(calls.filter(call => call.url.endsWith('/approval-request')).length, 2)
  assert.equal(calls.filter(call => call.url.endsWith('/approval')).length, 1)
})

test('bridge sovittaa hyväksynnän kun Hermes etenee mutta Arxcian-kuittaus katkeaa', async () => {
  const calls = []
  const approval = { request_id: 'approval-2', description: 'Lupa', tool: 'terminal' }
  const replies = [
    response(200, { message: { id: 'message-5', prompt: 'Tee työ', sessionId: null, claimToken: 'claim-5' } }),
    response(202, { run_id: 'run-5' }),
    response(200, { message: { status: 'running' } }),
    response(200, { status: 'waiting_for_approval', approval }),
    response(200, { message: { status: 'waiting_approval' } }),
    response(200, { message: { status: 'waiting_approval', approval, approvalDecision: 'once' } }),
    response(200, { resolved: 1 }),
    response(503, { error: 'temporary' }),
    response(200, { status: 'completed', output: 'Valmis', session_id: 'session-5' }),
    response(200, { message: { status: 'waiting_approval', approval: { requestId: 'approval-2' }, approvalDecision: 'once' } }),
    response(200, { message: { status: 'running' } }),
    response(200, { message: { status: 'completed' } }),
  ]
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options })
    return replies.shift()
  }

  const result = await processOneOracleMessage({
    fetchImpl, appBaseUrl: 'https://arxcian.test', bridgeSecret: 'bridge-secret',
    hermesBaseUrl: 'http://127.0.0.1:8642/p/oracle', hermesApiKey: 'fixture-value',
    sleep: async () => {}, maxPolls: 3,
  })

  assert.equal(result.processed, true)
  assert.equal(calls.filter(call => call.url.endsWith('/approval-resolved')).length, 2)
  assert.equal(calls.at(-1).url, 'https://arxcian.test/api/arxcian/oracle/bridge/complete')
})

test('uudelleen lunastettu viesti jatkaa tallennettua Hermes-ajoa ilman uutta runia', async () => {
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    const target = String(url)
    calls.push({ url: target, options })
    if (target.endsWith('/bridge/claim')) return response(200, { message: {
      id: 'message-reclaimed', prompt: 'Tee työ', sessionId: null,
      runId: 'run-existing', claimToken: 'claim-new',
    } })
    if (target.endsWith('/bridge/running')) return response(200, { message: { status: 'running', runId: 'run-existing' } })
    if (target.endsWith('/v1/runs/run-existing')) return response(200, {
      status: 'completed', output: 'Valmis', session_id: 'session-existing',
    })
    if (target.includes('/bridge/state?')) return response(200, { message: { status: 'running' } })
    if (target.endsWith('/bridge/complete')) return response(200, { message: { status: 'completed' } })
    if (target === 'http://127.0.0.1:8642/p/oracle/v1/runs') throw new Error('Uutta Hermes-ajoa ei saa luoda')
    throw new Error(`Odottamaton URL ${target}`)
  }

  const result = await processOneOracleMessage({
    fetchImpl,
    appBaseUrl: 'https://arxcian.test',
    bridgeSecret: 'bridge-secret',
    hermesBaseUrl: 'http://127.0.0.1:8642/p/oracle',
    hermesApiKey: 'test-key',
    sleep: async () => {},
    maxPolls: 1,
  })

  assert.equal(result.runId, 'run-existing')
  assert.equal(calls.filter(call => call.url === 'http://127.0.0.1:8642/p/oracle/v1/runs').length, 0)
})

test('bridge yrittää idempotentin Hermes-ajon luonnin uudelleen verkkokatkoksen jälkeen', async () => {
  const calls = []
  let runAttempts = 0
  const fetchImpl = async (url, options = {}) => {
    const target = String(url)
    calls.push({ url: target, options })
    if (target.endsWith('/bridge/claim')) {
      return response(200, { message: { id: 'message-retry', prompt: 'Tee työ', sessionId: null, claimToken: 'claim-retry' } })
    }
    if (target === 'http://127.0.0.1:8642/p/oracle/v1/runs') {
      runAttempts += 1
      if (runAttempts === 1) throw new TypeError('socket closed')
      return response(202, { run_id: 'run-retry' })
    }
    if (target.endsWith('/bridge/running')) return response(200, { message: { status: 'running' } })
    if (target.endsWith('/v1/runs/run-retry')) return response(200, { status: 'completed', output: 'Valmis', session_id: 'session-retry' })
    if (target.includes('/bridge/state?')) return response(200, { message: { status: 'running' } })
    if (target.endsWith('/bridge/complete')) return response(200, { message: { status: 'completed' } })
    throw new Error(`Odottamaton URL ${target}`)
  }

  const result = await processOneOracleMessage({
    fetchImpl, appBaseUrl: 'https://arxcian.test', bridgeSecret: 'bridge-secret',
    hermesBaseUrl: 'http://127.0.0.1:8642/p/oracle', hermesApiKey: 'test-hermes-key',
    sleep: async () => {}, maxPolls: 2,
  })

  assert.equal(result.runId, 'run-retry')
  assert.equal(runAttempts, 2)
  assert.equal(calls.filter(call => call.url.endsWith('/bridge/fail')).length, 0)
})

test('bridge pysäyttää juuri luodun Hermes-ajon jos running-kuittaus kohtaa keskeytyksen', async () => {
  const calls = []
  const replies = [
    response(200, { message: { id: 'message-race', prompt: 'Tee työ', sessionId: null, claimToken: 'claim-race' } }),
    response(202, { run_id: 'run-race' }),
    response(409, { error: 'Oracle-viestin lunastus ei ole enää voimassa.' }),
    response(200, { message: { status: 'cancelled' } }),
    response(200, { stopped: true }),
  ]
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options })
    return replies.shift()
  }

  const result = await processOneOracleMessage({
    fetchImpl, appBaseUrl: 'https://arxcian.test', bridgeSecret: 'bridge-secret',
    hermesBaseUrl: 'http://127.0.0.1:8642/p/oracle', hermesApiKey: 'test-hermes-key', sleep: async () => {},
  })

  assert.equal(result.cancelled, true)
  assert.equal(calls.at(-1).url, 'http://127.0.0.1:8642/p/oracle/v1/runs/run-race/stop')
  assert.equal(calls.filter(call => call.url.endsWith('/bridge/fail')).length, 0)
})

test('epäselvä verkkokatkos ei merkitse mahdollisesti käynnissä olevaa työtä epäonnistuneeksi', async () => {
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    const target = String(url)
    calls.push({ url: target, options })
    if (target.endsWith('/bridge/claim')) return response(200, { message: { id: 'message-ambiguous', prompt: 'Tee työ', sessionId: null, claimToken: 'claim-ambiguous' } })
    if (target === 'http://127.0.0.1:8642/p/oracle/v1/runs') return response(202, { run_id: 'run-ambiguous' })
    if (target.endsWith('/bridge/running')) return response(200, { message: { status: 'running' } })
    if (target.endsWith('/v1/runs/run-ambiguous')) return response(200, { status: 'running' })
    if (target.includes('/bridge/state?')) throw new TypeError('socket closed')
    if (target.endsWith('/bridge/fail')) return response(200, { message: { status: 'failed' } })
    throw new Error(`Odottamaton URL ${target}`)
  }

  await assert.rejects(() => processOneOracleMessage({
    fetchImpl, appBaseUrl: 'https://arxcian.test', bridgeSecret: 'bridge-secret',
    hermesBaseUrl: 'http://127.0.0.1:8642/p/oracle', hermesApiKey: 'test-hermes-key', sleep: async () => {}, maxPolls: 1,
  }), /socket closed/)
  assert.equal(calls.filter(call => call.url.endsWith('/bridge/fail')).length, 0)
})

test('roikkuva bridge-pyyntö katkaistaan määräajassa', async () => {
  const fetchImpl = async (_url, options = {}) => new Promise((_, reject) => {
    if (!options.signal) return
    options.signal.addEventListener('abort', () => {
      const error = new Error('aborted')
      error.name = 'AbortError'
      reject(error)
    }, { once: true })
  })

  await assert.rejects(
    Promise.race([
      processOneOracleMessage({
        fetchImpl,
        appBaseUrl: 'https://arxcian.test',
        bridgeSecret: 'bridge-secret',
        hermesBaseUrl: 'http://127.0.0.1:8642/p/oracle',
        hermesApiKey: 'test-key',
        requestTimeoutMs: 5,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('testin turvaraja')), 100)),
    ]),
    /Bridge HTTP-pyyntö aikakatkaistiin/,
  )
})
