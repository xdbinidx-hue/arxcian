import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import crypto from 'node:crypto'
import ts from 'typescript'
import * as protocol from './protocol.ts'

const SNAPSHOT = { id: null, revision: 0, paired: false, goal: protocol.CHECKLIST_GOAL, status: 'not_started', items: [], result: null, nextStep: 'Aloita Telegramissa.' }
function harness(bridge = false) {
  let user: string | null = 'albin'
  let touched = 0
  let submitted: unknown
  const env = { ARXCIAN_CHECKLIST_ENABLED: 'true', ORACLE_BRIDGE_SECRET: 'test-secret' }
  const exports: Record<string, Function> = {}
  const path = bridge ? '../../../app/api/arxcian/oracle/bridge/checklist/route.ts' : '../../../app/api/arxcian/personal/checklist/route.ts'
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  const require = (name: string) => {
    if (name === 'node:crypto') return crypto
    if (name === 'next/server') return { NextResponse: { json: (b: unknown, init: ResponseInit) => new Response(JSON.stringify(b), init) } }
    if (name === '@/lib/session') return { currentUser: async () => user }
    if (name === '@/lib/arxcian/checklist/protocol') return protocol
    if (name === '@/lib/arxcian/oracleBridgeAuth') return { bridgeSecretMatches: (a: string, b: string) => !!b && a === b }
    if (name === '@/lib/arxcian/rateLimit') return { checkRateLimit: async () => true }
    if (name === '@/lib/arxcian/kv') return { kv: () => { touched++; return {} } }
    if (name === '@/lib/arxcian/checklist/store') return { store: () => ({
      read: async () => ({ snapshot: SNAPSHOT, syncedAt: 1000, pending: { id: 'pair-1234', op: 'pair', token: 'private-code' }, last: null }),
      submit: async (command: unknown) => { submitted = command; return [202, JSON.stringify({ command })] },
      exchange: async (snapshot: unknown) => { submitted = snapshot; return [200, 'null'] },
    }) }
    throw new Error('Testi ei salli riippuvuutta: ' + name)
  }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require, process: { env } })
  return { exports, env, setUser: (v: string | null) => { user = v }, touched: () => touched, submitted: () => submitted }
}
const request = (body: unknown, origin = 'https://arxcian.test', secret = '') => ({
  headers: new Headers({ origin, 'x-oracle-bridge-secret': secret }), nextUrl: new URL('https://arxcian.test/api/arxcian/personal/checklist'), json: async () => body,
})

test('tehtävän luku ja jatkaminen torjuvat kirjautumattoman sekä Arbnorin ennen tietokantaa', async () => {
  const h = harness()
  for (const [user, status] of [[null, 401], ['arbnor', 404]] as const) {
    h.setUser(user)
    assert.equal((await h.exports.GET()).status, status)
    assert.equal((await h.exports.POST(request({ id: 'valid-key', op: 'pair', owner: 'albin' }))).status, status)
  }
  assert.equal(h.touched(), 0)
})

test('Albinin luku ei paljasta kytkentäkoodia ja vieras origin ei saa kirjoittaa', async () => {
  const h = harness()
  assert.doesNotMatch(await (await h.exports.GET()).text(), /private-code/)
  assert.equal((await h.exports.POST(request({ id: 'valid-key', op: 'pair' }, 'https://foreign.test'))).status, 403)
  assert.equal(h.touched(), 1)
})

test('palvelin generoi kytkentäkoodin eikä ota identiteettiä asiakkaalta', async () => {
  const h = harness()
  const response = await h.exports.POST(request({ id: 'valid-key', op: 'pair', owner: 'arbnor', token: 'attacker-code' }))
  assert.equal(response.status, 202)
  const result = await response.json()
  assert.match(result.token, /^[a-f0-9]{64}$/)
  assert.doesNotMatch(JSON.stringify(h.submitted()), /arbnor|attacker-code/)
})

test('bridge vaatii salaisuuden ja oletuksena suljetun ominaisuuslipun', async () => {
  const h = harness(true)
  assert.equal((await h.exports.POST(request({ snapshot: SNAPSHOT }))).status, 401)
  h.env.ARXCIAN_CHECKLIST_ENABLED = 'false'
  assert.equal((await h.exports.POST(request({ snapshot: SNAPSHOT }, undefined, 'test-secret'))).status, 404)
  assert.equal(h.touched(), 0)
})

test('bridge hyväksyy vain rajatun tehtäväprojektion ja poistaa ylimääräiset tiedot', async () => {
  const h = harness(true)
  assert.equal((await h.exports.POST(request({ snapshot: { ...SNAPSHOT, history: 'private-history', telegramId: '12345' } }, undefined, 'test-secret'))).status, 200)
  assert.doesNotMatch(JSON.stringify(h.submitted()), /history|12345/)
  assert.equal((await h.exports.POST(request({ snapshot: { ...SNAPSHOT, id: 'foreign-task' } }, undefined, 'test-secret'))).status, 400)
})
