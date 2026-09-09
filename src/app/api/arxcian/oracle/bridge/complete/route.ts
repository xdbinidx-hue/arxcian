import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@/lib/arxcian/kv'
import { bridgeSecretMatches } from '@/lib/arxcian/oracleBridgeAuth'
import { OracleQueueConflictError } from '@/lib/arxcian/oracleQueue'
import { createRedisOracleBackend } from '@/lib/arxcian/oracleRedisBackend'
import { finalizeOracleCompletion, type OracleRawInteraction } from '@/lib/arxcian/oracleCompletion'
import { deleteProposal, prepareProposal, saveProposal } from '@/lib/arxcian/assistant/proposals'

type CompleteBody = {
  id?: unknown
  claimToken?: unknown
  answer?: unknown
  sessionId?: unknown
  interaction?: unknown
}

export async function POST(req: NextRequest) {
  if (!bridgeSecretMatches(req.headers.get('x-oracle-bridge-secret'), process.env.ORACLE_BRIDGE_SECRET)) {
    return NextResponse.json({ error: 'Ei oikeutta' }, { status: 401 })
  }

  let body: CompleteBody
  try {
    body = await req.json() as CompleteBody
  } catch {
    return NextResponse.json({ error: 'Virheellinen JSON-runko' }, { status: 400 })
  }
  if (
    typeof body.id !== 'string'
    || typeof body.claimToken !== 'string'
    || typeof body.answer !== 'string'
    || body.answer.length > 100_000
    || (body.sessionId !== undefined && body.sessionId !== null && typeof body.sessionId !== 'string')
    || (body.interaction !== undefined && body.interaction !== null
      && (typeof body.interaction !== 'object' || Array.isArray(body.interaction)))
  ) {
    return NextResponse.json({ error: 'Virheellinen tulosrunko' }, { status: 400 })
  }

  try {
    const message = await finalizeOracleCompletion({
      backend: createRedisOracleBackend(kv()),
      id: body.id,
      claimToken: body.claimToken,
      answer: body.answer,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
      interaction: (body.interaction ?? null) as OracleRawInteraction,
    }, {
      now: () => Date.now(),
      prepareProposal,
      saveProposal,
      deleteProposal,
    })
    return NextResponse.json({ message })
  } catch (error) {
    if (error instanceof OracleQueueConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    throw error
  }
}
