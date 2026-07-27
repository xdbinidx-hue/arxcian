import { NextRequest, NextResponse } from 'next/server'
import { currentUser, currentOwner, visibleTo } from '@/lib/session'
import { getGoals, addGoal, toggleGoalDone, removeGoal } from '@/lib/arxcian/personal/goals'
import { GOAL_AREAS, type GoalArea } from '@/lib/arxcian/personal/types'
import type { Owner, SessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Kirjastofunktiot palauttavat koko sisäisen listan (kaikkien käyttäjien
// tietueet) — jokainen vastaus on suodatettava näkyvyyden mukaan täällä
// ennen lähettämistä, muuten toisen käyttäjän yksityiset tietueet
// vuotaisivat mutatoivan pyynnön vastauksessa.
function respond(goals: Awaited<ReturnType<typeof getGoals>>, user: SessionUser) {
  return NextResponse.json({ goals: visibleTo(goals, user) })
}

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })
  return respond(await getGoals(user), user)
}

export async function POST(req: NextRequest) {
  const me = await currentOwner()
  if (!me) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const body = (await req.json()) as {
    area?: GoalArea
    title?: string
    description?: string
    targetDate?: string | null
    owner?: Owner
  }
  if (!body.area || !GOAL_AREAS.includes(body.area) || !body.title?.trim()) {
    return NextResponse.json({ error: 'area ja title vaaditaan' }, { status: 400 })
  }
  const owner: Owner = body.owner === 'shared' ? 'shared' : me

  const goals = await addGoal({
    owner,
    area: body.area,
    title: body.title.trim(),
    description: body.description?.trim() ?? '',
    targetDate: body.targetDate ?? null,
  })
  return respond(goals, me)
}

export async function PATCH(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const { id } = (await req.json()) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id puuttuu' }, { status: 400 })

  return respond(await toggleGoalDone(id), user)
}

export async function DELETE(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id puuttuu' }, { status: 400 })

  return respond(await removeGoal(id), user)
}
