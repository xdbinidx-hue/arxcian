import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { DayInfo } from '@/lib/shiftSchedule'

function keyFor(month: string) {
  return `shifts:${month}`
}

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month')
  if (!month) return NextResponse.json({ error: 'month required (YYYY-MM)' }, { status: 400 })

  try {
    const days = await kv.get<DayInfo[]>(keyFor(month))
    return NextResponse.json({ days: days ?? [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const month: string | undefined = body?.month
    const days: DayInfo[] | undefined = body?.days
    if (!month || !Array.isArray(days)) {
      return NextResponse.json({ error: 'month and days[] required' }, { status: 400 })
    }
    await kv.set(keyFor(month), days)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
