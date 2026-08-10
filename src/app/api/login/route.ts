import { NextRequest, NextResponse } from 'next/server'
import {
  getSession,
  USER_SESSION_DAYS,
  USER_IDS,
  type UserId,
} from '@/lib/session'
import { checkRateLimit } from '@/lib/arxcian/rateLimit'

/** Tunnukset ympäristömuuttujista, ei kovakoodattuna. */
function pinFor(user: UserId): string | undefined {
  return process.env[`${user.toUpperCase()}_PIN`]
}

export async function POST(req: NextRequest) {
  // Nelinumeroinen PIN on brute-forcattavissa ilman yritysrajoitusta.
  // IP luetaan vain luotetusta lähteestä: x-forwarded-for ei kelpaa, koska
  // kutsuja voi asettaa sen vasemman arvon itse ja saisi jokaisella yrityksellä
  // uuden rajoituskiintiön. req.ip ja x-real-ip tulevat Vercelin proxyltä
  // eivätkä ole asiakkaan asetettavissa.
  const ip = req.ip ?? req.headers.get('x-real-ip') ?? 'tuntematon'
  if (!(await checkRateLimit('login', ip, 10, 15 * 60, true))) {
    return NextResponse.json({ error: 'Liikaa kirjautumisyrityksiä. Yritä myöhemmin uudelleen.' }, { status: 429 })
  }

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

  return NextResponse.json({ error: 'Väärä käyttäjätunnus tai salasana' }, { status: 401 })
}
