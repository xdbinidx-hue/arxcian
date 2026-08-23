import { NextRequest, NextResponse } from 'next/server'
import { withStoreErrors } from '@/lib/arxcian/personal/storeResponse'
import { currentUser, currentOwner, visibleTo } from '@/lib/session'
import { getHabits, addHabit, toggleHabitToday, removeHabit } from '@/lib/arxcian/personal/habits'
import type { Owner, SessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Kirjastofunktiot palauttavat koko sisäisen listan — suodatetaan aina
// näkyvyyden mukaan täällä, ks. goals/route.ts.
function respond(habits: Awaited<ReturnType<typeof getHabits>>, user: SessionUser) {
  return NextResponse.json({ habits: visibleTo(habits, user) })
}

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })
  return respond(await getHabits(user), user)
}

async function postHandler(req: NextRequest) {
  const me = await currentOwner()
  if (!me) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const body = (await req.json()) as { title?: string; owner?: Owner }
  if (!body.title?.trim()) return NextResponse.json({ error: 'title vaaditaan' }, { status: 400 })
  const owner: Owner = body.owner === 'shared' ? 'shared' : me

  return respond(await addHabit({ owner, title: body.title.trim() }), me)
}

/** Kääntää tämän päivän tehty-tilan. */
async function patchHandler(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const { id } = (await req.json()) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id puuttuu' }, { status: 400 })

  return respond(await toggleHabitToday(id, user), user)
}

async function deleteHandler(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id puuttuu' }, { status: 400 })

  return respond(await removeHabit(id, user), user)
}

// Kirjoitusvirhe on saatava vastaukseen asti, ei vain lokiin — ks.
// [storeResponse.ts](src/lib/arxcian/personal/storeResponse.ts).
export const POST = (req: NextRequest) => withStoreErrors(() => postHandler(req))
export const PATCH = (req: NextRequest) => withStoreErrors(() => patchHandler(req))
export const DELETE = (req: NextRequest) => withStoreErrors(() => deleteHandler(req))
