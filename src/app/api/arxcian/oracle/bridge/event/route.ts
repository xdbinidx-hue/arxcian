import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@/lib/arxcian/kv'
import { bridgeSecretMatches } from '@/lib/arxcian/oracleBridgeAuth'
import {
  OracleQueueConflictError,
  OracleQueueInputError,
  recordOracleEvent,
  type OracleEventInput,
} from '@/lib/arxcian/oracleQueue'
import { createRedisOracleBackend } from '@/lib/arxcian/oracleRedisBackend'

type Body = { id?: unknown; claimToken?: unknown; event?: unknown }

export async function POST(req: NextRequest) {
  if (!bridgeSecretMatches(req.headers.get('x-oracle-bridge-secret'), process.env.ORACLE_BRIDGE_SECRET)) {
    return NextResponse.json({ error: 'Ei oikeutta' }, { status: 401 })
  }
  let body: Body
  try { body = await req.json() as Body } catch {
    return NextResponse.json({ error: 'Virheellinen JSON-runko' }, { status: 400 })
  }
  if (typeof body.id !== 'string' || typeof body.claimToken !== 'string'
    || !body.event || typeof body.event !== 'object') {
    return NextResponse.json({ error: 'Virheellinen tapahtuma' }, { status: 400 })
  }
  try {
    const message = await recordOracleEvent(
      createRedisOracleBackend(kv()), body.id, body.claimToken, body.event as OracleEventInput,
    )
    return NextResponse.json({ message })
  } catch (error) {
    if (error instanceof OracleQueueInputError) return NextResponse.json({ error: error.message }, { status: 400 })
    if (error instanceof OracleQueueConflictError) return NextResponse.json({ error: error.message }, { status: 409 })
    throw error
  }
}
