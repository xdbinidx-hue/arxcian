import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@/lib/arxcian/kv'
import { decideOracleApprovalRequest } from '@/lib/arxcian/oracleApi'
import { createRedisOracleBackend } from '@/lib/arxcian/oracleRedisBackend'
import { getSession } from '@/lib/session'

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  let body: { choice?: unknown }
  try { body = await req.json() as { choice?: unknown } } catch {
    return NextResponse.json({ error: 'Virheellinen JSON-runko' }, { status: 400 })
  }
  const { id } = await context.params
  const result = await decideOracleApprovalRequest(
    { currentUser: async () => (await getSession()).user ?? null, backend: createRedisOracleBackend(kv()) },
    id,
    body,
  )
  return NextResponse.json(result.body, { status: result.status })
}
