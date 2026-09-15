import { resolveRjMobOracleContext } from '@/lib/arxcian/rjmobOracleContext'
import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@/lib/session'
import { checkRateLimit } from '@/lib/arxcian/rateLimit'
import { kv } from '@/lib/arxcian/kv'
import { submitOracleRequest, type OracleSubmitBody } from '@/lib/arxcian/oracleApi'
import { createRedisOracleBackend } from '@/lib/arxcian/oracleRedisBackend'

export async function POST(req: NextRequest) {
  let body: OracleSubmitBody
  try {
    body = await req.json() as OracleSubmitBody
  } catch {
    return NextResponse.json({ error: 'Virheellinen JSON-runko' }, { status: 400 })
  }

  const result = await submitOracleRequest(
    {
      currentUser,
      resolveViewContext: resolveRjMobOracleContext,
      allowRequest: user => checkRateLimit('oracle-messages', user, 60, 60 * 60, true),
      backend: createRedisOracleBackend(kv()),
      now: () => Date.now(),
      id: () => crypto.randomUUID(),
    },
    body,
  )
  return NextResponse.json(result.body, { status: result.status })
}
