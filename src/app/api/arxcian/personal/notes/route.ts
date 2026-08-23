import { NextRequest, NextResponse } from 'next/server'
import { withStoreErrors } from '@/lib/arxcian/personal/storeResponse'
import { currentUser, currentOwner, visibleTo } from '@/lib/session'
import { getNotes, addNote, removeNote, promoteNoteToGoal } from '@/lib/arxcian/personal/notes'
import type { Owner, SessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Kirjastofunktiot palauttavat koko sisäisen listan — suodatetaan aina
// näkyvyyden mukaan täällä, ks. goals/route.ts.
function respond(notes: Awaited<ReturnType<typeof getNotes>>, user: SessionUser) {
  return NextResponse.json({ notes: visibleTo(notes, user) })
}

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })
  return respond(await getNotes(user), user)
}

async function postHandler(req: NextRequest) {
  const me = await currentOwner()
  if (!me) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const body = (await req.json()) as { text?: string; owner?: Owner }
  if (!body.text?.trim()) return NextResponse.json({ error: 'text vaaditaan' }, { status: 400 })
  const owner: Owner = body.owner === 'shared' ? 'shared' : me

  return respond(await addNote({ owner, text: body.text.trim() }), me)
}

/** Ylentää muistiinpanon tavoitteeksi. */
async function patchHandler(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const { id } = (await req.json()) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id puuttuu' }, { status: 400 })

  return respond(await promoteNoteToGoal(id, user), user)
}

async function deleteHandler(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id puuttuu' }, { status: 400 })

  return respond(await removeNote(id, user), user)
}

// Kirjoitusvirhe on saatava vastaukseen asti, ei vain lokiin — ks.
// [storeResponse.ts](src/lib/arxcian/personal/storeResponse.ts).
export const POST = (req: NextRequest) => withStoreErrors(() => postHandler(req))
export const PATCH = (req: NextRequest) => withStoreErrors(() => patchHandler(req))
export const DELETE = (req: NextRequest) => withStoreErrors(() => deleteHandler(req))
