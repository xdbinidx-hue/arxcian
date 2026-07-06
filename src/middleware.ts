import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const USERS: Record<string, string> = {
  'albin': '1023',
  'arbnor': '1023',
  'guest': 'guest',
}

export function middleware(request: NextRequest) {
  const auth = request.cookies.get('rjmob_auth')?.value
  const isLoginPage = request.nextUrl.pathname === '/login'
  const isApi = request.nextUrl.pathname.startsWith('/api')

  if (isApi) return NextResponse.next()
  if (isLoginPage) return NextResponse.next()

  if (!auth || !USERS[auth]) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
