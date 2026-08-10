import { NextRequest, NextResponse } from 'next/server'
import { currentOwner } from '@/lib/session'
import { removeAccount, removeAllAccounts } from '@/lib/arxcian/personal/calendar/accounts'

export const dynamic = 'force-dynamic'

/**
 * Poistaa tallennetut tokenit ja välimuistin. Ei peruuta lupaa Googlen
 * päässä — sen voi tehdä osoitteessa myaccount.google.com/permissions.
 *
 * Bodyn `accountId` katkaisee vain yhden tilin. Ilman sitä katkaistaan
 * kaikki, jotta selaimen välimuistista tuleva vanha JS-nippu käyttäytyy
 * kuten ennen eikä tee mitään yllättävää.
 */
export async function POST(req: NextRequest) {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  let accountId: unknown = null
  try {
    const body = await req.json()
    accountId = body?.accountId
  } catch {
    // Tyhjä body on sallittu: tarkoittaa "katkaise kaikki".
  }

  if (typeof accountId === 'string' && accountId) {
    const remaining = await removeAccount(user, accountId)
    return NextResponse.json({ ok: true, remaining: remaining.length })
  }

  await removeAllAccounts(user)
  return NextResponse.json({ ok: true, remaining: 0 })
}
