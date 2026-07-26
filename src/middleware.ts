import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getIronSession } from 'iron-session'
import { sessionOptions, sessionUser, type SessionData } from '@/lib/session'

/** arxcianin osiot ovat henkilökohtaisia: vieraskäyttäjä ei pääse niihin. */
const ARXCIAN_PREFIX = '/arxcian'
const ARXCIAN_API_PREFIX = '/api/arxcian'

/** RJ-Mobin etusivu, jonne vieras ohjataan. */
const GUEST_HOME = '/tuotto'

function isPublic(pathname: string) {
  return (
    pathname === '/login' ||
    pathname.startsWith('/api/login') ||
    pathname.startsWith('/api/logout')
  )
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  // RJ-Mobin nykyiset API-reitit toimivat ennallaan.
  // arxcianin omat reitit vaativat aina istunnon.
  const isRjmobApi = pathname.startsWith('/api/') && !pathname.startsWith(ARXCIAN_API_PREFIX)
  if (isRjmobApi) return NextResponse.next()

  const res = NextResponse.next()
  const session = await getIronSession<SessionData>(request, res, sessionOptions())
  const user = sessionUser(session)

  const isArxcian = pathname.startsWith(ARXCIAN_PREFIX) || pathname.startsWith(ARXCIAN_API_PREFIX)
  const isApi = pathname.startsWith('/api/')

  if (!user) {
    if (isApi) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user === 'guest' && isArxcian) {
    if (isApi) return NextResponse.json({ error: 'Ei oikeutta' }, { status: 403 })
    return NextResponse.redirect(new URL(GUEST_HOME, request.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
