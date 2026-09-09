import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@/lib/arxcian/kv'
import { bridgeSecretMatches } from '@/lib/arxcian/oracleBridgeAuth'
import { failOracleMessage, OracleQueueConflictError } from '@/lib/arxcian/oracleQueue'
import { createRedisOracleBackend } from '@/lib/arxcian/oracleRedisBackend'

type FailBody = { id?: unknown; claimToken?: unknown; error?: unknown }

export async function POST(req: NextRequest) {
  if (!bridgeSecretMatches(req.headers.get('x-oracle-bridge-secret'), process.env.ORACLE_BRIDGE_SECRET)) {
    return NextResponse.json({ error: 'Ei oikeutta' }, { status: 401 })
  }

  let body: FailBody
  try {
    body = await req.json() as FailBody
  } catch {
    return NextResponse.json({ error: 'Virheellinen JSON-runko' }, { status: 400 })
  }
  if (
    typeof body.id !== 'string'
    || typeof body.claimToken !== 'string'
    || typeof body.error !== 'string'
    || !body.error
    || body.error.length > 2_000
  ) {
    return NextResponse.json({ error: 'Virheellinen virherunko' }, { status: 400 })
  }

  try {
    const message = await failOracleMessage(
      createRedisOracleBackend(kv()),
      body.id,
      body.claimToken,
      body.error,
    )
    return NextResponse.json({ message })
  } catch (error) {
    if (error instanceof OracleQueueConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    throw error
  }
}
