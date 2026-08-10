import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getIronSession } from 'iron-session'
import { sessionOptions, sessionUser, type SessionData } from '@/lib/session'

function isPublic(pathname: string) {
  return (
    pathname === '/login' ||
    pathname.startsWith('/api/login') ||
    pathname.startsWith('/api/logout') ||
    // Cron-reitti todentaa itse CRON_SECRETilla. Istuntoa vaativa
    // middleware estäisi Vercelin ajastetut kutsut kokonaan.
    pathname.startsWith('/api/arxcian/cron') ||
    // Drive-webhookit kutsutaan ilman istuntoa: /api/webhook/drive on Googlen
    // kutsuma ja todentaa itse x-goog-channel-token-otsakkeella,
    // /api/webhook/register ajetaan vercel.jsonin cronista.
    pathname.startsWith('/api/webhook/')
  )
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  // Kaikki API-reitit vaativat istunnon, myös RJ-Mobin vanhat. Ne olivat
  // pitkään auki internetiin (maksukuitit, tavoitteet, työvuorot luettavissa
  // pelkällä osoitteella) — RJ-Mobin sivut ovat client-komponentteja ja
  // hakevat suhteellisilla poluilla, joten eväste kulkee mukana normaalisti.
  const res = NextResponse.next()
  const session = await getIronSession<SessionData>(request, res, sessionOptions())
  const user = sessionUser(session)

  const isApi = pathname.startsWith('/api/')

  if (!user) {
    if (isApi) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return res
}

export const config = {
  // PWA:n tiedostojen on oltava haettavissa ilman istuntoa, muuten
  // asennus kotiruudulle ei onnistu. Ne eivät sisällä mitään arkaluontoista.
  // Sama koskee /textures/-hakemistoa (maapallon NASA-kuva, public domain):
  // ilman poikkeusta jokainen tekstuurihaku kiertäisi turhaan istunto-
  // tarkistuksen läpi ja palauttaisi 307:n kirjautumattomille.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|textures/|sw.js).*)',
  ],
}
