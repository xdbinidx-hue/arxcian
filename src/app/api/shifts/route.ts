import { NextRequest, NextResponse } from 'next/server'
import { DayInfo } from '@/lib/shiftSchedule'
import { KUUKAUSI_MUOTO, lueLista, parseTila, tallennaLista } from '@/lib/shifts/shiftStore'

/**
 * Työvuorolistan luonnos ja vahvistettu lista.
 *
 * Vahvistus (luonnos → final + Drive) on omassa reitissään
 * `/api/shifts/vahvista`, jotta generointipolku ei pääse finaliin edes
 * vahingossa. Avaimet ja migraatio: [shiftStore.ts](src/lib/shifts/shiftStore.ts).
 */
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month')
  if (!month || !KUUKAUSI_MUOTO.test(month)) {
    return NextResponse.json({ error: 'month vaaditaan muodossa YYYY-MM' }, { status: 400 })
  }
  const tila = parseTila(req.nextUrl.searchParams.get('tila') ?? 'final')
  if (!tila) return NextResponse.json({ error: "tila on 'draft' tai 'final'" }, { status: 400 })

  try {
    return NextResponse.json({ tila, month, days: await lueLista(tila, month) })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * Tallenna lista.
 *
 * `tila` on pakollinen eikä sillä ole oletusta: oletus `draft` piilottaisi
 * kutsujan virheen ja oletus `final` olisi suoraan vaarallinen.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const month: string | undefined = body?.month
    const days: DayInfo[] | undefined = body?.days
    const tila = parseTila(body?.tila)

    if (!month || !KUUKAUSI_MUOTO.test(month)) {
      return NextResponse.json({ error: 'month vaaditaan muodossa YYYY-MM' }, { status: 400 })
    }
    if (!tila) return NextResponse.json({ error: "tila on 'draft' tai 'final'" }, { status: 400 })
    if (!Array.isArray(days)) {
      return NextResponse.json({ error: 'days[] vaaditaan' }, { status: 400 })
    }

    await tallennaLista(tila, month, days)
    return NextResponse.json({ ok: true, tila, month, days: days.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
