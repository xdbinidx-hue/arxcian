import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@/lib/arxcian/kv'
import { bridgeSecretMatches } from '@/lib/arxcian/oracleBridgeAuth'
import { markOracleMessageRunning, OracleQueueConflictError } from '@/lib/arxcian/oracleQueue'
import { createRedisOracleBackend } from '@/lib/arxcian/oracleRedisBackend'

type RunningBody = { id?: unknown; claimToken?: unknown; runId?: unknown }

export async function POST(req: NextRequest) {
  if (!bridgeSecretMatches(req.headers.get('x-oracle-bridge-secret'), process.env.ORACLE_BRIDGE_SECRET)) {
    return NextResponse.json({ error: 'Ei oikeutta' }, { status: 401 })
  }

  let body: RunningBody
  try {
    body = await req.json() as RunningBody
  } catch {
    return NextResponse.json({ error: 'Virheellinen JSON-runko' }, { status: 400 })
  }
  if (typeof body.id !== 'string' || typeof body.claimToken !== 'string' || typeof body.runId !== 'string') {
    return NextResponse.json({ error: 'Virheellinen ajotila' }, { status: 400 })
  }

  try {
    const message = await markOracleMessageRunning(
      createRedisOracleBackend(kv()),
      body.id,
      body.claimToken,
      body.runId,
    )
    return NextResponse.json({ message })
  } catch (error) {
    if (error instanceof OracleQueueConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    throw error
  }
}
