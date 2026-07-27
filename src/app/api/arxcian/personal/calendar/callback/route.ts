import { NextRequest, NextResponse } from 'next/server'
import { currentOwner, getSession } from '@/lib/session'
import { exchangeCode, storeTokens } from '@/lib/arxcian/personal/calendar/oauth'

export const dynamic = 'force-dynamic'

function back(origin: string, status: string) {
  return NextResponse.redirect(new URL(`/arxcian/personal?kalenteri=${status}`, origin))
}

/** Googlen paluuosoite: vaihtaa koodin tokeneiksi ja sitoo ne käyttäjään. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin

  const user = await currentOwner()
  if (!user) return NextResponse.redirect(new URL('/login', origin))

  const params = req.nextUrl.searchParams
  const error = params.get('error')
  if (error) return back(origin, error === 'access_denied' ? 'peruutettu' : 'virhe')

  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) return back(origin, 'virhe')

  // CSRF: tunnisteen on täsmättävä istuntoon ja se kelpaa vain kerran.
  const session = await getSession()
  const expected = session.oauthState
  session.oauthState = undefined
  await session.save()

  if (!expected || expected !== state) return back(origin, 'virhe')

  try {
    const tokens = await exchangeCode(origin, code)
    if (!tokens.refresh_token && !tokens.access_token) return back(origin, 'virhe')
    await storeTokens(user, tokens)
    return back(origin, 'yhdistetty')
  } catch (e) {
    console.error('[calendar] koodin vaihto epäonnistui', e)
    return back(origin, 'virhe')
  }
}
