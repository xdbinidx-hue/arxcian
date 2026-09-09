import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@/lib/arxcian/kv'
import { bridgeSecretMatches } from '@/lib/arxcian/oracleBridgeAuth'
import { createRedisOracleBackend } from '@/lib/arxcian/oracleRedisBackend'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const expected = process.env.ORACLE_BRIDGE_SECRET
  const provided = request.headers.get('x-oracle-bridge-secret')
  if (!expected || !bridgeSecretMatches(provided, expected)) {
    return NextResponse.json({ error: 'Ei oikeutta' }, { status: 401 })
  }

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Viestin tunniste puuttuu' }, { status: 400 })
  const message = await createRedisOracleBackend(kv()).get(id)
  if (!message) return NextResponse.json({ error: 'Oracle-viestiä ei löytynyt' }, { status: 404 })
  return NextResponse.json({ message }, { headers: { 'Cache-Control': 'no-store' } })
}
