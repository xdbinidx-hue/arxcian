import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@/lib/arxcian/kv'
import { generateMonth } from '@/lib/shiftSchedule'
import { lueKuukaudenSyote } from '@/lib/shifts/tyovuoroDrive'
import { keyFor } from '@/lib/shifts/shiftStore'

/**
 * Generoi kuukauden vuorolista Drive-taulukon tapahtumista.
 *
 * Kirjoittaa **vain luonnokseen** (`shifts:draft:<YYYY-MM>`). Vahvistettuun
 * listaan ei kosketa täältä millään syötteellä — se on `/api/shifts/vahvista`.
 */
export async function POST(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month') ?? ''
  const osuma = month.match(/^(\d{4})-(\d{2})$/)
  if (!osuma) {
    return NextResponse.json({ error: 'month vaaditaan muodossa YYYY-MM' }, { status: 400 })
  }
  const vuosi = Number(osuma[1])
  const kuukausi = Number(osuma[2])

  try {
    const { syote, tiedosto, valilehti } = await lueKuukaudenSyote(vuosi, kuukausi)
    const tulos = generateMonth(vuosi, kuukausi, syote)

    await kv().set(keyFor('draft', month), tulos.days)

    return NextResponse.json({
      ok: true,
      month,
      // Lähde kerrotaan aina: jos luvut näyttävät oudoilta, ensimmäinen
      // kysymys on mistä tiedostosta ne tulivat.
      lahde: {
        nimi: tiedosto.name,
        id: tiedosto.id,
        mimeType: tiedosto.mimeType,
        muokattu: tiedosto.modifiedTime,
        valilehti,
      },
      days: tulos.days,
      vajeet: tulos.vajeet,
      tunnit: tulos.tunnit,
      vuorot: tulos.vuorot,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
