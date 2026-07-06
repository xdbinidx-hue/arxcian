import { NextRequest, NextResponse } from 'next/server'

const USERS: Record<string, string> = {
  'albin': '1023',
  'arbnor': '1023',
}

const GUEST_PASSWORD = '0626'
const GUEST_MAX_USES = 5
const GUEST_SESSION_HOURS = 1

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  // Normal users
  if (USERS[username] && USERS[username] === password) {
    const res = NextResponse.json({ ok: true })
    res.cookies.set('rjmob_auth', username, {
      httpOnly: true,
      secure: true,
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })
    return res
  }

  // Guest user
  if (password === GUEST_PASSWORD) {
    // Check usage count from cookie
    const guestData = req.cookies.get('rjmob_guest_data')?.value
    let uses = 0
    
    if (guestData) {
      try {
        const parsed = JSON.parse(guestData)
        uses = parsed.uses ?? 0
      } catch {}
    }

    if (uses >= GUEST_MAX_USES) {
      return NextResponse.json({ error: 'Vieraskäyttäjän kirjautumiskerrat täynnä (max 5)' }, { status: 401 })
    }

    const res = NextResponse.json({ ok: true, guest: true })
    
    // Set auth cookie - expires in 1 hour
    res.cookies.set('rjmob_auth', 'guest', {
      httpOnly: true,
      secure: true,
      maxAge: 60 * 60 * GUEST_SESSION_HOURS,
      path: '/',
    })

    // Track usage count
    res.cookies.set('rjmob_guest_data', JSON.stringify({ uses: uses + 1 }), {
      httpOnly: true,
      secure: true,
      maxAge: 60 * 60 * 24 * 365, // 1 year to track uses
      path: '/',
    })

    return res
  }

  return NextResponse.json({ error: 'Väärä käyttäjätunnus tai salasana' }, { status: 401 })
}
