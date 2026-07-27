import { NextResponse } from 'next/server'
import { currentOwner } from '@/lib/session'
import { clearTokens } from '@/lib/arxcian/personal/calendar/oauth'
import { invalidate } from '@/lib/arxcian/cache'

export const dynamic = 'force-dynamic'

/** Poistaa tallennetut tokenit ja välimuistin. Ei peruuta lupaa Googlen
 *  päässä — sen voi tehdä osoitteessa myaccount.google.com/permissions. */
export async function POST() {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  await clearTokens(user)
  await invalidate(`calendar:events:${user}`)
  return NextResponse.json({ ok: true })
}
