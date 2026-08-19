import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@/lib/arxcian/kv'
import { DayInfo } from '@/lib/shiftSchedule'
import { kirjoitaTyovuorot } from '@/lib/shifts/tyovuoroDriveKirjoitus'
import { keyFor } from '@/lib/shifts/shiftStore'

/**
 * Vahvista luonnos: kopioi se vahvistettuun listaan ja kirjoita Driveen.
 *
 * `?kuiva=1` kertoo mitä kirjoitettaisiin kirjoittamatta mitään — sama kuri
 * kuin Winpos-putkessa, jossa kuiva-ajo paljasti oikean bugin. Kuiva-ajossa
 * **ei kirjoiteta myöskään KV:hen**, jotta ajo on aidosti sivuvaikutukseton.
 */
export async function POST(req: NextRequest) {
  const kuivaAjo = ['1', 'true', 'kylla'].includes(
    (req.nextUrl.searchParams.get('kuiva') ?? '').toLowerCase(),
  )

  try {
    const body = await req.json()
    const month: string | undefined = body?.month
    const days: DayInfo[] | undefined = body?.days
    const osuma = (month ?? '').match(/^(\d{4})-(\d{2})$/)
    if (!osuma) {
      return NextResponse.json({ error: 'month vaaditaan muodossa YYYY-MM' }, { status: 400 })
    }
    if (!Array.isArray(days) || days.length === 0) {
      return NextResponse.json({ error: 'days[] vaaditaan eikä se saa olla tyhjä' }, { status: 400 })
    }

    const vuosi = Number(osuma[1])
    const kuukausi = Number(osuma[2])

    // Drive ensin: jos kirjoitus kaatuu, vahvistettu lista ei ehdi muuttua
    // ja käyttäjä voi yrittää uudelleen ilman että KV ja taulukko ovat eri
    // mieltä siitä mikä kuukauden lista on.
    const drive = await kirjoitaTyovuorot(vuosi, kuukausi, days, { kuivaAjo })

    if (!kuivaAjo) {
      await kv().set(keyFor('final', month!), days)
    }

    return NextResponse.json({
      ok: true,
      kuivaAjo,
      month,
      viesti: kuivaAjo
        ? `Kuiva-ajo: ei kirjoitettu mitään. Kohde ${drive.alue}, ${drive.vuoroja} vuoroa ja ${drive.poissaoloja} poissaolomerkintää.`
        : `Vahvistettu ja kirjoitettu tiedostoon "${drive.tiedosto.nimi}" (${drive.vuoroja} vuoroa).`,
      drive,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, kuivaAjo, error: msg }, { status: 500 })
  }
}
