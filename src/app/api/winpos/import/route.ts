import { NextRequest, NextResponse } from 'next/server'
import { importWinposReports } from '@/lib/winpos/kassamyynti'

/**
 * Winpos-raporttien tuonti, **vain käsin käynnistettävänä**.
 *
 * Tuontia ei ole kytketty cron-rekisteriin tarkoituksella: kirjoitus menee
 * elävään taulukkoon, joten ajastus otetaan käyttöön vasta kun tuonti on
 * nähty toimivaksi oikealla raportilla.
 *
 * `?kuiva=1` kertoo mitä kirjoitettaisiin kirjoittamatta mitään: mihin
 * tiedostoon ja alueeseen, montako riviä, montako nimikorjauskaavaa
 * jouduttaisiin kopioimaan alaspäin ja miltä ensimmäiset rivit näyttäisivät.
 * Kuiva ajo ei myöskään merkitse tiedostoa käsitellyksi, joten sen voi
 * toistaa vapaasti.
 *
 * Reitti vaatii istunnon kuten muutkin API-reitit — middlewaren
 * `isPublic()`-listaan ei tarvitse koskea.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const kuivaAjo = ['1', 'true', 'kylla'].includes(
    (req.nextUrl.searchParams.get('kuiva') ?? '').toLowerCase(),
  )

  try {
    const tulos = await importWinposReports({ kuivaAjo })
    return NextResponse.json({ ok: true, ...tulos })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, kuivaAjo, error: msg }, { status: 500 })
  }
}
