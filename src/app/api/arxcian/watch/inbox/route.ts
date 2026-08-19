import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@/lib/session'
import { clearInbox, readInbox } from '@/lib/arxcian/watch/inbox'

export const dynamic = 'force-dynamic'

/**
 * Watch-inbox. Suodatus tehdään kirjastossa `visibleTo()`llä palvelimella,
 * ei selaimessa — Personalin kanavat voivat olla henkilökohtaisia ja Albin ja
 * Arbnor voivat käyttää samaa laitetta.
 */
export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })
  return NextResponse.json({ items: await readInbox(user) })
}

/** ?id=<tunniste> poistaa yhden, ilman parametria tyhjentää kaikki näkyvät. */
export async function DELETE(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  const removed = await clearInbox(user, id ? [id] : undefined)
  return NextResponse.json({ removed, items: await readInbox(user) })
}
