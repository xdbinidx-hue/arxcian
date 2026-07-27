import { NextRequest, NextResponse } from 'next/server'
import { currentOwner } from '@/lib/session'
import { getAlerts, addAlert, removeAlert } from '@/lib/arxcian/trading/alerts'
import type { AlertCondition } from '@/lib/arxcian/trading/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })
  return NextResponse.json({ alerts: await getAlerts() })
}

export async function POST(req: NextRequest) {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const body = (await req.json()) as {
    symbol?: string
    label?: string
    condition?: AlertCondition
    threshold?: number
  }

  if (!body.symbol || !body.label || !body.condition || typeof body.threshold !== 'number') {
    return NextResponse.json({ error: 'symbol, label, condition ja threshold vaaditaan' }, { status: 400 })
  }
  if (body.condition !== 'above' && body.condition !== 'below') {
    return NextResponse.json({ error: 'condition on oltava "above" tai "below"' }, { status: 400 })
  }

  const alerts = await addAlert({
    symbol: body.symbol,
    label: body.label,
    condition: body.condition,
    threshold: body.threshold,
    createdBy: user,
  })
  return NextResponse.json({ alerts })
}

export async function DELETE(req: NextRequest) {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id puuttuu' }, { status: 400 })

  const alerts = await removeAlert(id)
  return NextResponse.json({ alerts })
}
