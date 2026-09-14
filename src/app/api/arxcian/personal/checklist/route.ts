import { randomBytes, createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@/lib/session'
import { kv } from '@/lib/arxcian/kv'
import { checkRateLimit } from '@/lib/arxcian/rateLimit'
import { allowed, commandId, publicState, type Command } from '@/lib/arxcian/checklist/protocol'
import { store } from '@/lib/arxcian/checklist/store'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
async function access() {
  const user = await currentUser()
  if (!user) return json({ error: 'Kirjautuminen vaaditaan' }, 401)
  if (!allowed(user) || process.env.ARXCIAN_CHECKLIST_ENABLED !== 'true') return json({ error: 'Ei löydy' }, 404)
  return null
}
export async function GET() {
  const denied = await access()
  if (denied) return denied
  try { return json(publicState(await store(kv()).read())) }
  catch { return json({ error: 'Tehtävän tilaa ei saatu. Yritä uudelleen.' }, 503) }
}
export async function POST(req: NextRequest) {
  const denied = await access()
  if (denied) return denied
  if (req.headers.get('origin') !== req.nextUrl.origin) return json({ error: 'Virheellinen lähettäjä' }, 403)
  let body
  try { body = await req.json() } catch { return json({ error: 'Virheellinen pyyntö' }, 400) }
  if (!body || !commandId(body.id) || !['pair', 'add'].includes(body.op)) return json({ error: 'Virheellinen pyyntö' }, 400)
  if (body.op === 'add' && (typeof body.text !== 'string' || !body.text.trim() || body.text.trim().length > 500 || !Number.isSafeInteger(body.revision) || body.revision < 0)) return json({ error: 'Kirjoita enintään 500 merkin kohta.' }, 400)
  try {
    if (!(await checkRateLimit('checklist', 'albin', 60, 3600, true))) return json({ error: 'Liikaa pyyntöjä.' }, 429)
    const command: Command = body.op === 'pair'
      ? { id: body.id, op: 'pair', token: randomBytes(32).toString('hex') }
      : { id: body.id, op: 'add', text: body.text.trim(), revision: body.revision }
    const fingerprint = createHash('sha256').update(JSON.stringify(body.op === 'pair' ? { id: body.id, op: body.op } : command)).digest('hex')
    const [status, value] = await store(kv()).submit(command, fingerprint)
    if (status === 409) return json({ error: value }, status)
    const accepted = JSON.parse(value).command as Command
    return json({ id: accepted.id, token: accepted.op === 'pair' ? accepted.token : null }, status)
  } catch { return json({ error: 'Lähetyksen tila on epäselvä. Yritä uudelleen samalla pyynnöllä.' }, 503) }
}
