import { NextRequest, NextResponse } from 'next/server'
import { currentUser, currentOwner, visibleTo } from '@/lib/session'
import {
  getTodos,
  addTodo,
  toggleTodoDone,
  rescheduleTodo,
  removeTodo,
  clearDoneTodos,
} from '@/lib/arxcian/personal/todos'
import type { Owner, SessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Kirjastofunktiot palauttavat koko sisäisen listan — suodatetaan aina
// näkyvyyden mukaan täällä, ks. notes/route.ts.
function respond(todos: Awaited<ReturnType<typeof getTodos>>, user: SessionUser) {
  return NextResponse.json({ todos: visibleTo(todos, user) })
}

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })
  return respond(await getTodos(user), user)
}

export async function POST(req: NextRequest) {
  const me = await currentOwner()
  if (!me) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const body = (await req.json()) as {
    title?: string
    owner?: Owner
    date?: string | null
    remindAt?: string | null
  }
  if (!body.title?.trim()) return NextResponse.json({ error: 'title vaaditaan' }, { status: 400 })
  const owner: Owner = body.owner === 'shared' ? 'shared' : me

  const todos = await addTodo({
    owner,
    title: body.title.trim().slice(0, 300),
    date: body.date ?? null,
    remindAt: body.remindAt ?? null,
  })
  return respond(todos, me)
}

/** Merkitsee tehdyksi (`action: 'toggle'`) tai siirtää toiselle päivälle. */
export async function PATCH(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const body = (await req.json()) as {
    id?: string
    action?: 'toggle' | 'schedule'
    date?: string | null
    remindAt?: string | null
  }
  if (!body.id) return NextResponse.json({ error: 'id puuttuu' }, { status: 400 })

  if (body.action === 'schedule') {
    const todos = await rescheduleTodo(
      body.id,
      { date: body.date ?? null, remindAt: body.remindAt ?? null },
      user,
    )
    return respond(todos, user)
  }

  return respond(await toggleTodoDone(body.id, user), user)
}

export async function DELETE(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  // ?tehdyt=1 siivoaa kaikki tehdyt, muuten poistetaan yksi id:llä.
  if (req.nextUrl.searchParams.get('tehdyt') === '1') {
    return respond(await clearDoneTodos(user), user)
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id puuttuu' }, { status: 400 })

  return respond(await removeTodo(id, user), user)
}
