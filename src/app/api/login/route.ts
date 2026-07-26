import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import {
  getSession,
  guestOptions,
  GUEST_MAX_USES,
  GUEST_SESSION_HOURS,
  USER_SESSION_DAYS,
  USER_IDS,
  type GuestData,
  type UserId,
} from '@/lib/session'

/** Tunnukset ympäristömuuttujista, ei kovakoodattuna. */
function pinFor(user: UserId): string | undefined {
  return process.env[`${user.toUpperCase()}_PIN`]
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()
  const user = String(username ?? '').trim().toLowerCase()
  const pin = String(password ?? '')

  // Varsinaiset käyttäjät
  const known = USER_IDS.find(id => id === user)
  if (known) {
    const expected = pinFor(known)
    if (expected && pin === expected) {
      const session = await getSession()
      session.user = known
      session.expiresAt = Date.now() + USER_SESSION_DAYS * 24 * 60 * 60 * 1000
      await session.save()
      return NextResponse.json({ ok: true, user: known })
    }
    return NextResponse.json({ error: 'Väärä käyttäjätunnus tai salasana' }, { status: 401 })
  }

  // Vieraskäyttäjä: tunnin istunto, rajattu määrä kirjautumisia
  const guestPin = process.env.GUEST_PIN
  if (guestPin && pin === guestPin) {
    const guest = await getIronSession<GuestData>(cookies(), guestOptions())
    const uses = guest.uses ?? 0

    if (uses >= GUEST_MAX_USES) {
      return NextResponse.json(
        { error: `Vieraskäyttäjän kirjautumiskerrat täynnä (max ${GUEST_MAX_USES})` },
        { status: 401 },
      )
    }

    const session = await getSession()
    session.user = 'guest'
    session.expiresAt = Date.now() + GUEST_SESSION_HOURS * 60 * 60 * 1000
    await session.save()

    guest.uses = uses + 1
    await guest.save()

    return NextResponse.json({ ok: true, guest: true })
  }

  return NextResponse.json({ error: 'Väärä käyttäjätunnus tai salasana' }, { status: 401 })
}
