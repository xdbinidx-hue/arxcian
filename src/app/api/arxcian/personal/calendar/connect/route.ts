import { NextRequest, NextResponse } from 'next/server'
import { currentOwner, getSession } from '@/lib/session'
import { authUrl, isConfigured } from '@/lib/arxcian/personal/calendar/oauth'

export const dynamic = 'force-dynamic'

/** Aloittaa Google-valtuutuksen. Vain kirjautunut arxcian-käyttäjä. */
export async function GET(req: NextRequest) {
  const user = await currentOwner()
  if (!user) return NextResponse.redirect(new URL('/login', req.nextUrl.origin))

  if (!isConfigured()) {
    return NextResponse.redirect(new URL('/arxcian/personal?kalenteri=ei-konfiguroitu', req.nextUrl.origin))
  }

  // Kertakäyttöinen CSRF-tunniste istuntoon — callback hylkää pyynnön jos se ei täsmää.
  const state = crypto.randomUUID()
  const session = await getSession()
  session.oauthState = state
  await session.save()

  return NextResponse.redirect(authUrl(req.nextUrl.origin, state))
}
