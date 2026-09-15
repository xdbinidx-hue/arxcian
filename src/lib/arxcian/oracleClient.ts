import type { OracleMessageStatus, OracleMessageView } from './oracleQueue.ts'

const UI_TAG_OPEN = '<arxcian-ui>'
const UI_TAG_PATTERN = /(?:\r?\n)?<arxcian-ui>[\s\S]*?<\/arxcian-ui>\s*$/

/**
 * Piilottaa <arxcian-ui>-koneellisen merkinnän myös silloin kun se on vasta
 * osittain saapunut striimissä — muuten käyttäjä näkisi hetkeksi raakaa
 * JSONia ennen kuin vastaus on valmis. Toimii koko siihenastiselle tekstille
 * kerrallaan, joten merkinnän jakautuminen usean palan yli ei vaikuta.
 *
 * Avaava tunniste haetaan `indexOf`illa eikä `lastIndexOf`illa: JSON-rungon
 * sisällä voi esiintyä `<`-merkkejä (esim. proposalin syötteessä), ja
 * `lastIndexOf` osuisi niihin ennen varsinaista tagin alkua — jolloin koko
 * kesken oleva JSON vuotaisi näkyviin siihen asti kun tagi sulkeutuu.
 * Osittain saapunut tagin *alku* (esim. pelkkä "<arxc" viestin lopussa)
 * tunnistetaan erikseen vertaamalla vain merkkijonon häntää, ei mitä tahansa
 * sen sisällä olevaa `<`-merkkiä.
 */
function hideFragmentedUiTag(raw: string): string {
  const withoutComplete = raw.replace(UI_TAG_PATTERN, '')
  if (withoutComplete !== raw) return withoutComplete.trimEnd()
  const openIndex = raw.indexOf(UI_TAG_OPEN)
  if (openIndex !== -1) return raw.slice(0, openIndex).trimEnd()
  for (let length = Math.min(UI_TAG_OPEN.length - 1, raw.length); length > 0; length--) {
    const tail = raw.slice(raw.length - length)
    if (UI_TAG_OPEN.startsWith(tail)) return raw.slice(0, raw.length - length).trimEnd()
  }
  return raw
}

/**
 * Oraclen tähänastinen striimattu vastausteksti. Käytetään vain näyttämiseen
 * kesken ajon (`running`, `waiting_approval`) — lopullinen totuus on aina
 * valmistuneen viestin `answer`, joka korvaa tämän kokonaan. Teksti tulee
 * omasta `liveAnswer`-kentästään (ks. oracleQueue.ts) eikä events-listalta,
 * jottei sitä koskaan menetä työkalu-/aliagenttitapahtumien täyttäessä
 * 100 tapahtuman renkaan.
 */
export function oracleLiveAnswer(message: OracleMessageView): string {
  return hideFragmentedUiTag(message.liveAnswer ?? '')
}

const STATUS_LABELS: Record<OracleMessageStatus, string> = {
  queued: 'Jonossa',
  claimed: 'VPS käsittelee',
  running: 'Oracle työskentelee',
  waiting_approval: 'Odottaa hyväksyntää',
  cancelling: 'Keskeytetään',
  completed: 'Valmis',
  failed: 'Epäonnistui',
  cancelled: 'Keskeytetty',
}

export function oracleStatusLabel(status: OracleMessageStatus): string {
  return STATUS_LABELS[status]
}

export function isOracleTerminal(status: OracleMessageStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

export function oracleUiEffect(message: OracleMessageView, handledMessageId: string | null) {
  if (message.status !== 'completed' || message.id === handledMessageId) return null
  const action = message.action ?? null
  const proposal = message.proposal ?? null
  if (!action && !proposal) return null
  return { key: message.id, action, proposal }
}

type RunOraclePromptOptions = {
  prompt: string
  viewContext?: unknown
  idempotencyKey?: string
  fetchImpl?: typeof fetch
  id?: () => string
  sleep?: (ms: number) => Promise<void>
  pollIntervalMs?: number
  maxPolls?: number
  fetchTimeoutMs?: number
  signal?: AbortSignal
  onPrepared?: (idempotencyKey: string) => void
  onSubmitted?: (message: OracleMessageView) => void
  onStatus?: (message: OracleMessageView) => void
}

type WatchOraclePromptOptions = Pick<
  RunOraclePromptOptions,
  'fetchImpl' | 'sleep' | 'pollIntervalMs' | 'maxPolls' | 'fetchTimeoutMs' | 'signal' | 'onStatus'
>

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok || !body) {
    throw new Error(typeof body?.error === 'string' ? body.error : `Oracle-yhteys epäonnistui (${response.status})`)
  }
  return body
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController()
  let timedOut = false
  const abortFromParent = () => controller.abort(parentSignal?.reason)
  if (parentSignal?.aborted) abortFromParent()
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (timedOut) throw new Error('Oracle-verkkopyyntö aikakatkaistiin.')
    throw error
  } finally {
    clearTimeout(timer)
    parentSignal?.removeEventListener('abort', abortFromParent)
  }
}

export async function approveOraclePrompt(
  id: string,
  choice: 'once' | 'deny',
  fetchImpl: typeof fetch = fetch,
): Promise<OracleMessageView> {
  const result = await readJson(await fetchImpl(
    `/api/arxcian/oracle/messages/${encodeURIComponent(id)}/approval`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice }),
    },
  ))
  return result.message as OracleMessageView
}

export async function cancelOraclePrompt(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OracleMessageView> {
  const result = await readJson(await fetchImpl(
    `/api/arxcian/oracle/messages/${encodeURIComponent(id)}/cancel`,
    { method: 'POST' },
  ))
  return result.message as OracleMessageView
}

export async function watchOraclePrompt(
  id: string,
  {
    fetchImpl = fetch,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    pollIntervalMs = 1_000,
    maxPolls = 3_600,
    fetchTimeoutMs = 15_000,
    signal,
    onStatus = () => {},
  }: WatchOraclePromptOptions = {},
): Promise<OracleMessageView> {
  for (let attempt = 0; attempt < maxPolls; attempt++) {
    const current = await readJson(await fetchWithTimeout(
      fetchImpl,
      `/api/arxcian/oracle/messages/${encodeURIComponent(id)}`,
      { cache: 'no-store' },
      fetchTimeoutMs,
      signal,
    ))
    const message = current.message as OracleMessageView
    onStatus(message)
    if (isOracleTerminal(message.status)) return message
    await sleep(pollIntervalMs)
  }
  throw new Error('Oracle-tehtävän seuranta aikakatkaistiin.')
}

export async function runOraclePrompt({
  prompt,
  viewContext,
  idempotencyKey,
  fetchImpl = fetch,
  id = () => crypto.randomUUID(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  pollIntervalMs = 1_000,
  maxPolls = 3_600,
  fetchTimeoutMs = 15_000,
  signal,
  onPrepared = () => {},
  onSubmitted = () => {},
  onStatus = () => {},
}: RunOraclePromptOptions): Promise<OracleMessageView> {
  const requestKey = idempotencyKey ?? id()
  onPrepared(requestKey)
  const submitted = await readJson(await fetchWithTimeout(fetchImpl, '/api/arxcian/oracle/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, idempotencyKey: requestKey, viewContext }),
  }, fetchTimeoutMs, signal))
  const message = submitted.message as OracleMessageView
  onSubmitted(message)
  onStatus(message)
  if (isOracleTerminal(message.status)) return message
  return watchOraclePrompt(message.id, {
    fetchImpl, sleep, pollIntervalMs, maxPolls, fetchTimeoutMs, signal, onStatus,
  })
}
