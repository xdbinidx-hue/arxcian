import { NextRequest, NextResponse } from 'next/server'
import { currentOwner, USER_IDS, type Owner } from '@/lib/session'
import {
  addTradingTime,
  getTradingTimes,
  removeTradingTime,
  toggleTradingTime,
} from '@/lib/arxcian/trading/notifyStore'
import { replanQuietly } from '@/lib/arxcian/push/schedule'

export const dynamic = 'force-dynamic'

function parseOwner(value: unknown, fallback: Owner): Owner {
  if (value === 'shared') return 'shared'
  return USER_IDS.find(id => id === value) ?? fallback
}

export async function GET() {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })
  return NextResponse.json({ times: await getTradingTimes(user) })
}

export async function POST(req: NextRequest) {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const body = (await req.json()) as {
    label?: string
    zone?: string
    minutes?: number
    days?: number[]
    leadMinutes?: number
    owner?: string
  }

  if (!body.label?.trim() || typeof body.minutes !== 'number' || !Array.isArray(body.days)) {
    return NextResponse.json({ error: 'label, minutes ja days vaaditaan' }, { status: 400 })
  }
  if (body.days.length === 0) {
    return NextResponse.json({ error: 'Vähintään yksi viikonpäivä vaaditaan' }, { status: 400 })
  }

  // Vyöhyke tarkistetaan yrittämällä muotoilua: väärä IANA-nimi heittää tässä
  // eikä vasta ajastimessa, jossa virhe kaataisi koko ilmoituskierroksen.
  const zone = body.zone || 'Europe/Helsinki'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
  } catch {
    return NextResponse.json({ error: `Tuntematon aikavyöhyke: ${zone}` }, { status: 400 })
  }

  const times = await addTradingTime(
    {
      owner: parseOwner(body.owner, user),
      label: body.label.trim(),
      zone,
      minutes: body.minutes,
      days: body.days.filter(d => typeof d === 'number'),
      leadMinutes: typeof body.leadMinutes === 'number' ? body.leadMinutes : 0,
    },
    user,
  )
  // Uusi aika jonoon heti eikä vasta seuraavassa cron-ajossa: tunnin päähän
  // lisätty killzone olisi muuten mennyt jo ohi kun suunnittelija seuraavan
  // kerran herää.
  await replanQuietly(user)

  return NextResponse.json({ times })
}

export async function PATCH(req: NextRequest) {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id puuttuu' }, { status: 400 })

  const times = await toggleTradingTime(id, user)
  await replanQuietly(user)
  return NextResponse.json({ times })
}

export async function DELETE(req: NextRequest) {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id puuttuu' }, { status: 400 })

  return NextResponse.json({ times: await removeTradingTime(id, user) })
}
