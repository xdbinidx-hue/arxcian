import { NextRequest, NextResponse } from 'next/server'
import { bridgeSecretMatches } from '@/lib/arxcian/oracleBridgeAuth'
import { kv } from '@/lib/arxcian/kv'
import { snapshotView, commandId } from '@/lib/arxcian/checklist/protocol'
import { store } from '@/lib/arxcian/checklist/store'

export async function POST(req: NextRequest) {
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
  if (!bridgeSecretMatches(req.headers.get('x-oracle-bridge-secret'), process.env.ORACLE_BRIDGE_SECRET)) return json({ error: 'Ei oikeutta' }, 401)
  if (process.env.ARXCIAN_CHECKLIST_ENABLED !== 'true') return json({ error: 'Ei käytössä' }, 404)
  let snapshot, ack
  try {
    const body = await req.json()
    snapshot = snapshotView(body.snapshot)
    ack = body.ack ?? null
    if (ack !== null) {
      if (!commandId(ack.id) || (ack.error !== null && (typeof ack.error !== 'string' || ack.error.length > 300))) throw new Error()
      ack = { id: ack.id, error: ack.error }
    }
  } catch { return json({ error: 'Virheellinen tehtävätila' }, 400) }
  try {
    const [status, result] = await store(kv()).exchange(snapshot, ack)
    return json(status === 200 ? { command: JSON.parse(result) } : { error: result }, status)
  } catch { return json({ error: 'Tehtäväyhteys ei ole käytettävissä.' }, 503) }
}
