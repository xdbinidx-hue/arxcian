import { NextRequest, NextResponse } from 'next/server'
import { currentOwner } from '@/lib/session'
import { getNotifySettings, saveNotifySettings } from '@/lib/arxcian/trading/notifyStore'
import type { NotifySettings } from '@/lib/arxcian/trading/types'
import { replanQuietly } from '@/lib/arxcian/push/schedule'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })
  return NextResponse.json({ settings: await getNotifySettings(user) })
}

export async function PUT(req: NextRequest) {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const body = (await req.json()) as Partial<NotifySettings>

  // Kentät poimitaan nimeltä eikä levitetä sellaisenaan: rungosta tulisi
  // muuten mitä tahansa avaimia suoraan KV:hen tallennettavaan olioon.
  const patch: Partial<NotifySettings> = {}
  for (const key of ['push', 'banner', 'sound', 'sessionOpen', 'sessionClose'] as const) {
    if (typeof body[key] === 'boolean') patch[key] = body[key]
  }
  if (typeof body.leadMinutes === 'number' && Number.isFinite(body.leadMinutes)) {
    patch.leadMinutes = body.leadMinutes
  }
  if (Array.isArray(body.sessions)) {
    patch.sessions = body.sessions.filter((s): s is string => typeof s === 'string')
  }

  const settings = await saveNotifySettings(user, patch)

  // Asetusmuutos vaikuttaa jonoon molempiin suuntiin: istunnon kytkeminen
  // päälle lisää ilmoituksia, pois kytkeminen perumaan jo jonotetut.
  await replanQuietly(user)

  return NextResponse.json({ settings })
}
