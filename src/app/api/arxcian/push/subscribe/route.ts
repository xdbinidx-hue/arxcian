import { NextRequest, NextResponse } from 'next/server'
import { currentOwner } from '@/lib/session'
import { vapidPublicKey } from '@/lib/arxcian/push/send'
import {
  addSubscription,
  getSubscriptions,
  removeSubscription,
} from '@/lib/arxcian/push/subscriptions'

export const dynamic = 'force-dynamic'

/**
 * Julkinen VAPID-avain ja käyttäjän nykyiset laitteet.
 *
 * Avain tarjoillaan reitistä eikä `NEXT_PUBLIC_`-muuttujana: silloin kaikki
 * push-asetus on yhdessä paikassa palvelimen ympäristössä, eikä avainta
 * paistateta niputettuun JS:ään myös kirjautumattomille.
 */
export async function GET() {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  return NextResponse.json({
    publicKey: vapidPublicKey(),
    devices: (await getSubscriptions(user)).map(s => ({
      endpoint: s.endpoint,
      label: s.label,
      createdAt: s.createdAt,
      lastSentAt: s.lastSentAt,
    })),
  })
}

export async function POST(req: NextRequest) {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const body = (await req.json()) as {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
    label?: string
  }

  if (!body.endpoint || !body.keys?.p256dh || !body.keys.auth) {
    return NextResponse.json({ error: 'endpoint ja keys vaaditaan' }, { status: 400 })
  }

  const devices = await addSubscription(user, {
    endpoint: body.endpoint,
    keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
    label: body.label || 'Tuntematon laite',
  })

  return NextResponse.json({ devices: devices.map(s => ({ endpoint: s.endpoint, label: s.label })) })
}

export async function DELETE(req: NextRequest) {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const endpoint = req.nextUrl.searchParams.get('endpoint')
  if (!endpoint) return NextResponse.json({ error: 'endpoint puuttuu' }, { status: 400 })

  const devices = await removeSubscription(user, endpoint)
  return NextResponse.json({ devices: devices.map(s => ({ endpoint: s.endpoint, label: s.label })) })
}
