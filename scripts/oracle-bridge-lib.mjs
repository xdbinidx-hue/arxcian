import { createHash } from 'node:crypto'

function joinUrl(base, path) {
  return `${base.replace(/\/$/, '')}${path}`
}

export function validateHermesBaseUrl(value) {
  let url
  try { url = new URL(value) } catch {
    throw new Error('Hermes API URL ei ole kelvollinen localhost-osoite.')
  }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)) {
    throw new Error('Hermes API URL on rajattava localhostiin.')
  }
  if (url.pathname.replace(/\/$/, '') !== '/p/oracle' || url.search || url.hash || url.username || url.password) {
    throw new Error('Hermes API URL on rajattava kiinteään Oracle-profiiliin.')
  }
  return url.toString().replace(/\/$/, '')
}

export function validateAppBaseUrl(value) {
  let url
  try { url = new URL(value) } catch {
    throw new Error('Arxcian URL ei ole kelvollinen.')
  }
  if (url.username || url.password) {
    throw new Error('Arxcian URL ei saa sisältää käyttäjätietoja.')
  }
  const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('Arxcian URL vaatii HTTPS-yhteyden tai localhostin.')
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Arxcian URL saa sisältää vain origin-osoitteen.')
  }
  return url.origin
}

async function jsonResponse(response, label) {
  if (!response?.ok) throw new Error(`${label} epäonnistui (HTTP ${response?.status ?? 'tuntematon'})`)
  return response.json()
}

function isNetworkError(error) {
  return error instanceof TypeError || error?.name === 'AbortError'
}

const TIMED_FETCH = Symbol('oracleTimedFetch')

function withRequestTimeout(fetchImpl, timeoutMs) {
  if (fetchImpl[TIMED_FETCH]) return fetchImpl
  const timedFetch = async (input, init = {}) => {
    const controller = new AbortController()
    const signal = init.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetchImpl(input, { ...init, signal })
    } catch (error) {
      if (controller.signal.aborted) {
        const timeout = new Error('Bridge HTTP-pyyntö aikakatkaistiin.')
        timeout.name = 'AbortError'
        throw timeout
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
  timedFetch[TIMED_FETCH] = true
  return timedFetch
}

async function retryAmbiguousNetwork(operation, sleep, attempts = 3) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!isNetworkError(error) || attempt === attempts - 1) throw error
      await sleep(100 * (attempt + 1))
    }
  }
  throw lastError
}

function boundedString(value, max) {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, max) : null
}

const ORACLE_UI_PATTERN = /(?:\r?\n)?<arxcian-ui>([\s\S]*?)<\/arxcian-ui>\s*$/

export function parseOracleOutput(output) {
  if (typeof output !== 'string') return { answer: '', interaction: null }
  const match = output.match(ORACLE_UI_PATTERN)
  if (!match) return { answer: output, interaction: null }

  let value
  try { value = JSON.parse(match[1]) } catch {
    return { answer: output, interaction: null }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { answer: output, interaction: null }
  }
  const keys = Object.keys(value)
  if (keys.some(key => key !== 'action' && key !== 'proposal')) {
    return { answer: output, interaction: null }
  }

  const action = value.action ?? null
  if (action !== null && (
    typeof action !== 'object' || Array.isArray(action)
    || typeof action.target !== 'string'
    || Object.keys(action).some(key => key !== 'target')
  )) return { answer: output, interaction: null }

  const proposal = value.proposal ?? null
  if (proposal !== null && (
    typeof proposal !== 'object' || Array.isArray(proposal)
    || typeof proposal.tool !== 'string'
    || !proposal.input || typeof proposal.input !== 'object' || Array.isArray(proposal.input)
    || Object.keys(proposal).some(key => key !== 'tool' && key !== 'input')
  )) return { answer: output, interaction: null }

  return {
    answer: output.slice(0, match.index).trimEnd(),
    interaction: action === null && proposal === null ? null : { action, proposal },
  }
}

const STREAMED_EVENT_TYPES = new Set([
  'tool.started', 'tool.completed', 'subagent.start', 'subagent.complete',
])

function normalizeHermesEvent(raw, runId) {
  if (!raw || typeof raw !== 'object' || !STREAMED_EVENT_TYPES.has(raw.event)
    || raw.run_id !== runId || !Number.isFinite(raw.timestamp)) return null

  const fingerprint = createHash('sha256').update(JSON.stringify([
    raw.run_id,
    raw.event,
    raw.timestamp,
    raw.tool ?? null,
    raw.subagent_id ?? null,
    raw.child_session_id ?? null,
    raw.task_index ?? null,
  ])).digest('hex').slice(0, 32)
  return {
    sourceId: `${runId}:${fingerprint}`,
    type: raw.event,
    tool: boundedString(raw.tool, 256),
    preview: boundedString(raw.preview ?? raw.summary, 2_000),
    error: raw.error === true || raw.status === 'failed',
  }
}

// Oikea Hermes-tapahtumavirta käyttää delta-kenttää (varmennettu integraatiokokeella).
// text-kenttä säilyy yhteensopivana vaihtoehtona.
function extractDeltaText(raw, runId) {
  if (!raw || typeof raw !== 'object' || raw.event !== 'message.delta'
    || raw.run_id !== runId || !Number.isFinite(raw.timestamp)) return null
  const text = typeof raw.text === 'string' ? raw.text : (typeof raw.delta === 'string' ? raw.delta : null)
  return text && text.length > 0 ? text : null
}

// Sama katto kuin palvelimen oracleQueue.ts:n message.delta-esikatselulla —
// pidetään yhtä suurina ettei palvelin joudu katkaisemaan tätä uudelleen
// lyhyemmäksi (jolloin prefiksi säilyisi mutta häntä katkeaisi kahdesti eri
// kohdista).
const LIVE_ANSWER_MAX_LENGTH = 20_000
const DELTA_CADENCE_MS = 250

/**
 * Kokoaa peräkkäiset message.delta-osat yhdeksi kumulatiiviseksi
 * lähetykseksi HTTP-edestakaisen sijaan per token. Korkeintaan yksi lähetys
 * on kerrallaan matkalla; sen aikana kertyneet uudet osat lähtevät yhtenä
 * uutena, ajantasaisena kokonaissnapshottina heti kun edellinen on valmis —
 * ei kertaakaan yhtä HTTP-pyyntöä per token, eikä koskaan pudoteta alkua,
 * koska jokainen lähetys kantaa koko siihenastisen tekstin eikä vain
 * lisäystä.
 */
function createDeltaCoalescer(send, cadenceMs = DELTA_CADENCE_MS) {
  let cumulative = ''
  let dirty = false
  let sending = null
  let timer = null
  let failure = null
  let cancelled = false

  function attempt() {
    if (cancelled || sending || !dirty) return
    dirty = false
    const snapshot = cumulative
    sending = send(snapshot)
      .catch(error => { failure = failure ?? error })
      .then(() => {
        sending = null
        if (!cancelled && dirty) attempt()
      })
  }

  function scheduleTimer() {
    if (cancelled || timer || sending) return
    timer = setTimeout(() => {
      timer = null
      attempt()
    }, cadenceMs)
  }

  return {
    push(text) {
      if (cancelled) return
      cumulative += text
      dirty = true
      scheduleTimer()
    },
    // Ajon loppu ei saa jäädä odottamaan kadenssia — viimeinen pala on
    // näytettävä heti, ei enintään cadenceMs myöhässä.
    async drain() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (dirty) attempt()
      while (sending) await sending
      if (failure) throw failure
    },
    cancel() {
      cancelled = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}

export async function forwardHermesRunEvents({
  fetchImpl = fetch,
  appBaseUrl,
  bridgeSecret,
  hermesBaseUrl = 'http://127.0.0.1:8642/p/oracle',
  hermesApiKey,
  runId,
  messageId,
  claimToken,
  idleTimeoutMs = 75_000,
  requestTimeoutMs = 30_000,
  deltaCadenceMs = DELTA_CADENCE_MS,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
}) {
  fetchImpl = withRequestTimeout(fetchImpl, requestTimeoutMs)
  appBaseUrl = validateAppBaseUrl(appBaseUrl)
  hermesBaseUrl = validateHermesBaseUrl(hermesBaseUrl)
  const streamResponse = await fetchImpl(
    joinUrl(hermesBaseUrl, `/v1/runs/${encodeURIComponent(runId)}/events`),
    { headers: { Authorization: 'Bearer ' + hermesApiKey }, redirect: 'manual' },
  )
  if (!streamResponse?.ok || !streamResponse.body) {
    throw new Error(`Hermes-tapahtumavirta epäonnistui (HTTP ${streamResponse?.status ?? 'tuntematon'})`)
  }
  const reader = streamResponse.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const postEvent = async event => {
    const body = JSON.stringify({ id: messageId, claimToken, event })
    await retryAmbiguousNetwork(
      async () => jsonResponse(
        await fetchImpl(joinUrl(appBaseUrl, '/api/arxcian/oracle/bridge/event'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-oracle-bridge-secret': bridgeSecret,
          },
          body,
          redirect: 'manual',
        }),
        'Oracle-tapahtuman tallennus',
      ),
      sleep,
    )
  }

  const deltaCoalescer = createDeltaCoalescer(snapshot => postEvent({
    sourceId: `${runId}:answer`,
    type: 'message.delta',
    tool: null,
    preview: boundedString(snapshot, LIVE_ANSWER_MAX_LENGTH),
    error: false,
  }), deltaCadenceMs)

  const forwardFrame = async frame => {
    const data = frame.split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n')
    if (!data) return
    let raw
    try { raw = JSON.parse(data) } catch { return }
    if (raw && raw.event === 'message.delta') {
      const text = extractDeltaText(raw, runId)
      // push() ei odota verkkoa — juuri tämä estää sitä ettei jokainen
      // token lukitse SSE-lukijaa oman HTTP-kutsunsa ajaksi.
      if (text) deltaCoalescer.push(text)
      return
    }
    const event = normalizeHermesEvent(raw, runId)
    if (!event) return
    await postEvent(event)
  }
  try {
    while (true) {
      let timer
      let chunk
      try {
        chunk = await Promise.race([
          reader.read(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Hermes-tapahtumavirta aikakatkaistiin.')),
              idleTimeoutMs,
            )
          }),
        ])
      } catch (error) {
        await reader.cancel().catch(() => {})
        throw error
      } finally {
        clearTimeout(timer)
      }
      const { done, value } = chunk
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() ?? ''
      for (const frame of frames) await forwardFrame(frame)
      if (done) break
    }
    if (buffer.trim()) await forwardFrame(buffer)
    // Striimin loppu ei saa jäädä odottamaan valmista vastausta ilman että
    // viimeisin kumulatiivinen pala on lähetetty — muuten näkyvä teksti
    // jäisi jälkeen siitä mitä Hermes oikeasti tuotti.
    await deltaCoalescer.drain()
  } catch (error) {
    // Kesken jäänyt lähetys ei saa jäädä roikkumaan taustalle sen jälkeen
    // kun ajo on jo hylätty virheeseen (ei irrallista, odottamatonta
    // verkkokutsua kesken olevan virheenkäsittelyn jälkeen).
    deltaCoalescer.cancel()
    throw error
  }
}

export async function processOneOracleMessage({
  fetchImpl = fetch,
  appBaseUrl,
  bridgeSecret,
  hermesBaseUrl = 'http://127.0.0.1:8642/p/oracle',
  hermesApiKey,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  pollIntervalMs = 1_000,
  maxPolls = 3_600,
  requestTimeoutMs = 30_000,
  forwardEvents = false,
  onEventError = () => {},
}) {
  appBaseUrl = validateAppBaseUrl(appBaseUrl)
  hermesBaseUrl = validateHermesBaseUrl(hermesBaseUrl)
  const rawFetch = withRequestTimeout(fetchImpl, requestTimeoutMs)
  fetchImpl = (input, init = {}) => rawFetch(input, { ...init, redirect: 'manual' })
  const bridgeHeaders = {
    'Content-Type': 'application/json',
    'x-oracle-bridge-secret': bridgeSecret,
  }
  const claimResponse = await fetchImpl(
    joinUrl(appBaseUrl, '/api/arxcian/oracle/bridge/claim'),
    { method: 'POST', headers: bridgeHeaders },
  )
  if (claimResponse.status === 204) return { processed: false }
  const claim = await jsonResponse(claimResponse, 'Oracle-viestin lunastus')
  const { message } = claim

  let run
  try {
  const hermesHeaders = {
    Authorization: 'Bearer ' + hermesApiKey,
    'Content-Type': 'application/json',
    'Idempotency-Key': message.id,
  }
  if (message.runId) {
    run = { run_id: message.runId, replayed: true }
  } else {
    const runBody = { input: message.viewContext
      ? `${message.prompt}\n\nRJ-Mobin nykyinen näkymä (palvelimella rajattu lukutilanne, käytä näitä lukuja; aiempi keskustelu ei korvaa tätä):\n${JSON.stringify(message.viewContext)}`
      : message.prompt }
    if (typeof claim.instructions === 'string' && claim.instructions) {
      runBody.instructions = claim.instructions
    }
    if (message.sessionId) runBody.session_id = message.sessionId
    run = await retryAmbiguousNetwork(
      async () => jsonResponse(
        await fetchImpl(joinUrl(hermesBaseUrl, '/v1/runs'), {
          method: 'POST',
          headers: hermesHeaders,
          body: JSON.stringify(runBody),
        }),
        'Hermes-ajon käynnistys',
      ),
      sleep,
    )
  }

  const runningResponse = await fetchImpl(joinUrl(appBaseUrl, '/api/arxcian/oracle/bridge/running'), {
    method: 'POST',
    headers: bridgeHeaders,
    body: JSON.stringify({ id: message.id, claimToken: message.claimToken, runId: run.run_id }),
  })
  if (!runningResponse.ok) {
    const appState = await jsonResponse(
      await fetchImpl(
        joinUrl(appBaseUrl, `/api/arxcian/oracle/bridge/state?id=${encodeURIComponent(message.id)}`),
        { headers: bridgeHeaders },
      ),
      'Oracle-viestin tilan sovitus',
    )
    if (appState.message?.status === 'cancelled') {
      await jsonResponse(
        await fetchImpl(joinUrl(hermesBaseUrl, `/v1/runs/${encodeURIComponent(run.run_id)}/stop`), {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + hermesApiKey },
        }),
        'Hermes-ajon pysäytys',
      )
      return { processed: true, cancelled: true, messageId: message.id, runId: run.run_id }
    }
    if (appState.message?.status !== 'running' || appState.message?.runId !== run.run_id) {
      throw new Error(`Hermes-ajon tunnisteen tallennus epäonnistui (HTTP ${runningResponse.status})`)
    }
  } else {
    await runningResponse.json()
  }

  let eventTask = null
  if (forwardEvents) {
    eventTask = forwardHermesRunEvents({
      fetchImpl,
      appBaseUrl,
      bridgeSecret,
      hermesBaseUrl,
      hermesApiKey,
      runId: run.run_id,
      messageId: message.id,
      claimToken: message.claimToken,
    }).catch(error => {
      onEventError(error)
    })
  }

  let status
  let stopRequested = false
  const forwardedApprovals = new Set()
  for (let attempt = 0; attempt < maxPolls; attempt++) {
    status = await jsonResponse(
      await fetchImpl(joinUrl(hermesBaseUrl, `/v1/runs/${encodeURIComponent(run.run_id)}`), {
        headers: { Authorization: `Bearer ${hermesApiKey}` },
      }),
      'Hermes-ajon tilan luku',
    )
    const appState = await jsonResponse(
      await fetchImpl(
        joinUrl(appBaseUrl, `/api/arxcian/oracle/bridge/state?id=${encodeURIComponent(message.id)}`),
        { headers: bridgeHeaders },
      ),
      'Oracle-viestin tilan luku',
    )
    if (appState.message?.status === 'cancelling') {
      if (status.status === 'completed') break
      if (status.status === 'failed' || status.status === 'cancelled') {
        await jsonResponse(
          await fetchImpl(joinUrl(appBaseUrl, '/api/arxcian/oracle/bridge/cancelled'), {
            method: 'POST',
            headers: bridgeHeaders,
            body: JSON.stringify({ id: message.id, claimToken: message.claimToken }),
          }),
          'Oracle-keskeytyksen vahvistus',
        )
        if (eventTask) await eventTask
        return { processed: true, cancelled: true, messageId: message.id, runId: run.run_id }
      }
      if (!stopRequested) {
        await jsonResponse(
          await fetchImpl(joinUrl(hermesBaseUrl, `/v1/runs/${encodeURIComponent(run.run_id)}/stop`), {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + hermesApiKey },
          }),
          'Hermes-ajon pysäytys',
        )
        stopRequested = true
      }
      await sleep(pollIntervalMs)
      continue
    }
    if (appState.message?.status === 'cancelled') {
      if (!['completed', 'failed', 'cancelled'].includes(status.status)) {
        await jsonResponse(
          await fetchImpl(joinUrl(hermesBaseUrl, `/v1/runs/${encodeURIComponent(run.run_id)}/stop`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${hermesApiKey}` },
          }),
          'Hermes-ajon pysäytys',
        )
      }
      if (eventTask) await eventTask
      return { processed: true, cancelled: true, messageId: message.id, runId: run.run_id }
    }
    const pendingApproval = appState.message?.approval
    const pendingDecision = appState.message?.approvalDecision
    const pendingRequestId = pendingApproval?.requestId
    if (appState.message?.status === 'waiting_approval'
      && (pendingDecision === 'once' || pendingDecision === 'deny')
      && typeof pendingRequestId === 'string'
      && (status.status !== 'waiting_for_approval' || forwardedApprovals.has(pendingRequestId))) {
      const acknowledgement = await fetchImpl(
        joinUrl(appBaseUrl, '/api/arxcian/oracle/bridge/approval-resolved'), {
          method: 'POST',
          headers: bridgeHeaders,
          body: JSON.stringify({ id: message.id, claimToken: message.claimToken, requestId: pendingRequestId }),
        },
      )
      if (!acknowledgement.ok) {
        await sleep(pollIntervalMs)
        continue
      }
      await acknowledgement.json()
      appState.message.status = 'running'
    }
    if (status.status === 'waiting_for_approval') {
      const raw = status.approval ?? {}
      const requestId = typeof raw.request_id === 'string' ? raw.request_id : ''
      if (!requestId) throw new Error('Hermes-hyväksyntäpyynnöltä puuttuu tunniste.')
      if (forwardedApprovals.has(requestId)) {
        await sleep(pollIntervalMs)
        continue
      }
      const approvalState = await jsonResponse(
        await fetchImpl(joinUrl(appBaseUrl, '/api/arxcian/oracle/bridge/approval-request'), {
          method: 'POST',
          headers: bridgeHeaders,
          body: JSON.stringify({
            id: message.id,
            claimToken: message.claimToken,
            approval: {
              requestId,
              command: typeof raw.command === 'string' ? raw.command : null,
              description: typeof raw.description === 'string' ? raw.description : null,
              tool: typeof raw.tool === 'string' ? raw.tool : null,
            },
          }),
        }),
        'Oracle-hyväksyntäpyynnön tallennus',
      )
      const decision = approvalState.message?.approvalDecision
      if (decision === 'once' || decision === 'deny') {
        await jsonResponse(
          await fetchImpl(joinUrl(hermesBaseUrl, `/v1/runs/${encodeURIComponent(run.run_id)}/approval`), {
            method: 'POST',
            headers: hermesHeaders,
            body: JSON.stringify({ choice: decision, request_id: requestId }),
          }),
          'Hermes-hyväksynnän ratkaisu',
        )
        forwardedApprovals.add(requestId)
        const acknowledgement = await fetchImpl(
          joinUrl(appBaseUrl, '/api/arxcian/oracle/bridge/approval-resolved'), {
            method: 'POST',
            headers: bridgeHeaders,
            body: JSON.stringify({ id: message.id, claimToken: message.claimToken, requestId }),
          },
        )
        if (acknowledgement.ok) {
          await acknowledgement.json()
        }
      }
      await sleep(pollIntervalMs)
      continue
    }
    if (['completed', 'failed', 'cancelled'].includes(status.status)) break
    await sleep(pollIntervalMs)
  }
  if (eventTask) await eventTask
  if (status && ['failed', 'cancelled'].includes(status.status)) {
    await jsonResponse(
      await fetchImpl(joinUrl(appBaseUrl, '/api/arxcian/oracle/bridge/fail'), {
        method: 'POST',
        headers: bridgeHeaders,
        body: JSON.stringify({
          id: message.id,
          claimToken: message.claimToken,
          error: status.status === 'cancelled' ? 'Hermes-ajo keskeytettiin.' : 'Hermes-ajo epäonnistui.',
        }),
      }),
      'Oracle-virheen tallennus',
    )
    return { processed: true, failed: true, messageId: message.id, runId: run.run_id }
  }
  if (!status || status.status !== 'completed') {
    throw new Error(`Hermes-ajo ei valmistunut onnistuneesti (${status?.status ?? 'aikakatkaisu'})`)
  }

  const completion = parseOracleOutput(status.output ?? '')
  const completionBody = {
    id: message.id,
    claimToken: message.claimToken,
    answer: completion.answer,
    sessionId: status.session_id ?? message.sessionId ?? null,
  }
  if (completion.interaction) completionBody.interaction = completion.interaction
  await jsonResponse(
    await fetchImpl(joinUrl(appBaseUrl, '/api/arxcian/oracle/bridge/complete'), {
      method: 'POST',
      headers: bridgeHeaders,
      body: JSON.stringify(completionBody),
    }),
    'Oracle-tuloksen tallennus',
  )

  return { processed: true, messageId: message.id, runId: run.run_id }
  } catch (error) {
    if (run) {
      // Kun Hermes-ajo on voinut käynnistyä, epäselvää bridge- tai verkkovirhettä
      // ei saa muuttaa valheelliseksi terminal-tilaksi. Lease ja Hermeksen
      // idempotency-avain mahdollistavat turvallisen sovituksen myöhemmin.
      throw error
    }
    try {
      const failed = await fetchImpl(joinUrl(appBaseUrl, '/api/arxcian/oracle/bridge/fail'), {
        method: 'POST',
        headers: bridgeHeaders,
        body: JSON.stringify({
          id: message.id,
          claimToken: message.claimToken,
          error: 'Oracle-silta epäonnistui.',
        }),
      })
      if (failed.ok) {
        await failed.json()
        return { processed: true, failed: true, messageId: message.id }
      }
    } catch {
      // Alkuperäinen virhe säilytetään, jos myös terminalitilan tallennus epäonnistuu.
    }
    throw error
  }
}
