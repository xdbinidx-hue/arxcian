import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/session'
import { kv } from '@/lib/arxcian/kv'
import { cancelOracleRequest } from '@/lib/arxcian/oracleApi'
import { createRedisOracleBackend } from '@/lib/arxcian/oracleRedisBackend'

export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await cancelOracleRequest(
    { currentUser, backend: createRedisOracleBackend(kv()) },
    id,
  )
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  })
}
