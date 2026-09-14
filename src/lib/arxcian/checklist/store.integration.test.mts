import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { store, KEY } from './store.ts'
import { CHECKLIST_GOAL, CHECKLIST_ID, type Snapshot } from './protocol.ts'

const exec = promisify(execFile)
const server = process.env.CHECKLIST_REDIS_SERVER
const cli = process.env.CHECKLIST_REDIS_CLI

test('oikea eristetty Redis: idempotenssi, rinnakkaisuus, kuittaus ja pysyvä lukukopio', { skip: !server || !cli }, async () => {
  // Testi käynnistää AINA oman Redis-prosessin: ei TCP-porttia, ei tuotanto-URLia,
  // ei FLUSHDB:tä, vain uusi 0700 tmp-hakemisto ja sen Unix-socket.
  const dir = await mkdtemp(join(tmpdir(), 'checklist-redis-'))
  const socket = join(dir, 'redis.sock')
  const testEnv = { PATH: '/usr/bin:/bin', ...(process.env.CHECKLIST_REDIS_LIBRARY_PATH ? { LD_LIBRARY_PATH: process.env.CHECKLIST_REDIS_LIBRARY_PATH } : {}) }
  const child = spawn(server!, ['--port', '0', '--unixsocket', socket, '--unixsocketperm', '700', '--save', '', '--appendonly', 'no', '--dir', dir], { env: testEnv, stdio: 'ignore' })
  const stopped = new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('exit', () => resolve()) })
  const command = async (...args: string[]) => JSON.parse((await exec(cli!, ['--json', '-s', socket, ...args], { env: testEnv })).stdout)
  try {
    let ready = false
    for (let i = 0; i < 50; i++) {
      try { ready = await command('PING') === 'PONG'; if (ready) break } catch { /* Oma palvelin käynnistyy. */ }
      await new Promise(r => setTimeout(r, 20))
    }
    assert.equal(ready, true)
    const redis = {
      async get<T>(key: string): Promise<T | null> { const raw = await command('GET', key); return raw ? JSON.parse(raw) : null },
      async eval<T>(script: string, keys: string[], args: string[]): Promise<T> { return command('EVAL', script, String(keys.length), ...keys, ...args) },
    }
    const backend = store(redis)
    const snapshot: Snapshot = { id: CHECKLIST_ID, goal: CHECKLIST_GOAL, revision: 3, paired: true, status: 'waiting_input', items: [], result: null, nextStep: 'Lisää kohta.' }
    await backend.exchange(snapshot, null)
    assert.deepEqual((await backend.read()).snapshot?.items, [])
    const op = { id: 'request-1', op: 'add' as const, revision: 3, text: 'Kohta 1' }
    const results = await Promise.all(Array.from({ length: 12 }, () => backend.submit(op, 'fingerprint-1')))
    assert.equal(results.filter(r => r[0] === 202).length, 1)
    assert.equal(results.filter(r => r[0] === 200).length, 11)
    assert.equal((await backend.submit({ ...op, text: 'Eri' }, 'different'))[0], 409)
    assert.equal((await backend.submit({ ...op, id: 'request-2' }, 'new'))[0], 409)
    assert.equal((await backend.read()).pending?.id, op.id)
    await backend.exchange({ ...snapshot, revision: 4, items: ['Kohta 1'], result: '1. Kohta 1' }, { id: op.id, error: null })
    assert.equal((await backend.read()).pending, null)
    assert.equal((await backend.submit(op, 'fingerprint-1'))[0], 200)
    assert.equal((await backend.read()).pending, null) // vanha retry ei jonotu uudelleen
    assert.equal((await backend.exchange(snapshot, null))[0], 409) // vanha bridge ei peru uutta tilaa
    assert.equal(await command('TTL', KEY), -1)
    assert.equal(await command('TTL', KEY + ':request:' + op.id), -1)

    // Sama kulku oikeiden SQLite- ja Redis-toteutusten läpi. Python ei lataa
    // Hermes-gatewayta, mallia tai mitään tuotantoasetuksia.
    await command('DEL', KEY, KEY + ':request:' + op.id)
    const scripts = fileURLToPath(new URL('../../../../scripts/hermes-checklist/', import.meta.url))
    const dbPath = join(dir, 'kanban.db')
    const python = async (action: unknown) => {
      const source = `import sys,json,sqlite3
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from checklist import Checklist,telegram_command
from types import SimpleNamespace
p=Path(sys.argv[2])
a=json.loads(sys.argv[3])
if not p.exists():
 with sqlite3.connect(p) as c: c.executescript(Path(sys.argv[1],'test-schema.sql').read_text())
s=Checklist(p)
if a.get('telegram'):
 e=SimpleNamespace(text=a['text'],message_id=a['id'],source=SimpleNamespace(platform=SimpleNamespace(value='telegram'),chat_type='dm',user_id='123456',chat_id='123456'))
 print(json.dumps({'reply':telegram_command(s,e),'snapshot':s.snapshot()}))
elif a.get('command'): print(json.dumps(s.apply(a['command'])))
else: print(json.dumps(s.snapshot()))`
      return JSON.parse((await exec('python3', ['-c', source, scripts, dbPath, JSON.stringify(action)], { env: { PATH: '/usr/bin:/bin', PYTHONDONTWRITEBYTECODE: '1' } })).stdout)
    }
    const fresh = await python({})
    await backend.exchange(fresh, null)
    const pairing = { id: 'real-pair-1', op: 'pair' as const, token: 'b'.repeat(64) }
    await backend.submit(pairing, 'real-pair-fingerprint')
    const [, queuedPair] = await backend.exchange(fresh, null)
    const pairedPending = await python({ command: JSON.parse(queuedPair) })
    await backend.exchange(pairedPending, { id: pairing.id, error: null })
    await python({ telegram: true, id: '100', text: '/arxcian_tehtava liita ' + pairing.token })
    const started = await python({ telegram: true, id: '101', text: '/arxcian_tehtava' })
    assert.match(started.reply, /Tila: Odottaa/)
    await backend.exchange(started.snapshot, null)
    for (let i = 0; i < 3; i++) {
      const visible = (await backend.read()).snapshot!
      const action = { id: `real-browser-${i}`, op: 'add' as const, revision: visible.revision, text: `Käyttötesti ${i+1}` }
      await backend.submit(action, 'real-fingerprint-' + i)
      const [, queued] = await backend.exchange(await python({}), null)
      await python({ command: JSON.parse(queued) })
      // Prosessin uudelleenavaus ja saman komennon uusinta ennen kuittausta.
      const updated = await python({ command: JSON.parse(queued) })
      await backend.exchange(updated, { id: action.id, error: null })
    }
    assert.equal((await store(redis).read()).snapshot?.status, 'completed')
    const telegramResult = await python({ telegram: true, id: '102', text: '/arxcian_tehtava' })
    assert.match(telegramResult.reply, /Tila: Valmis/)
    assert.match(telegramResult.reply, /3. Käyttötesti 3/)
    assert.equal(telegramResult.snapshot.id, (await backend.read()).snapshot?.id)

  } finally {
    child.kill('SIGTERM')
    await stopped
    await rm(dir, { recursive: true, force: true })
  }
})
