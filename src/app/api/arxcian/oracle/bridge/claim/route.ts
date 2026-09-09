import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@/lib/arxcian/kv'
import { bridgeSecretMatches } from '@/lib/arxcian/oracleBridgeAuth'
import { claimNextOracleMessage } from '@/lib/arxcian/oracleQueue'
import { createRedisOracleBackend } from '@/lib/arxcian/oracleRedisBackend'
import { oracleUiInstructions } from '@/lib/arxcian/oracleUiProtocol'

export async function POST(req: NextRequest) {
  if (!bridgeSecretMatches(req.headers.get('x-oracle-bridge-secret'), process.env.ORACLE_BRIDGE_SECRET)) {
    return NextResponse.json({ error: 'Ei oikeutta' }, { status: 401 })
  }

  const message = await claimNextOracleMessage(createRedisOracleBackend(kv()))
  if (!message) return new NextResponse(null, { status: 204 })
  return NextResponse.json(
    { message, instructions: oracleUiInstructions() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
