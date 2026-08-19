import { NextRequest, NextResponse } from 'next/server'
import { currentOwner } from '@/lib/session'
import { subscriptionKeyState, vapidPublicKey } from '@/lib/arxcian/push/send'
import {
  addSubscription,
  getSubscriptions,
  removeSubscription,
} from '@/lib/arxcian/push/subscriptions'
import { replanQuietly } from '@/lib/arxcian/push/schedule'

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
      // Selain ei voi päätellä tätä itse: `PushSubscription` ei kerro
      // luotettavasti millä avaimella se tehtiin, ja vain palvelin tietää
      // mikä avain on nyt voimassa. Ilman tätä laite jäisi hiljaa listalle
      // toimimattomana.
      avainTila: subscriptionKeyState(s),
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
    // Palvelimen omasta ympäristöstä eikä asiakkaan rungosta: selain haki
    // avaimen juuri tästä samasta reitistä, joten palvelimen arvo on sama
    // mutta ei ole väärennettävissä.
    appServerKey: vapidPublicKey() ?? undefined,
  })

  // Ensimmäinen laite: ilman tätä jono olisi tyhjä siihen asti kunnes cron
  // seuraavan kerran ajaa, eli laite lisättäisiin eikä mitään tapahtuisi.
  await replanQuietly(user)

  return NextResponse.json({ devices: devices.map(s => ({ endpoint: s.endpoint, label: s.label })) })
}

export async function DELETE(req: NextRequest) {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const endpoint = req.nextUrl.searchParams.get('endpoint')
  if (!endpoint) return NextResponse.json({ error: 'endpoint puuttuu' }, { status: 400 })

  const devices = await removeSubscription(user, endpoint)
  // Viimeisen laitteen poisto tyhjentää jonon, ks. planForUser.
  await replanQuietly(user)
  return NextResponse.json({ devices: devices.map(s => ({ endpoint: s.endpoint, label: s.label })) })
}
