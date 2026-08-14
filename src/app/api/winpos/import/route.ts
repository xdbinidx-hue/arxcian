import { NextResponse } from 'next/server'
import { importWinposReports } from '@/lib/winpos/kassamyynti'

/**
 * Winpos-raporttien tuonti käsin käynnistettynä.
 *
 * Ajastettu ajo kulkee cron-rekisterin työn `winpos-import` kautta, joka
 * kutsuu samaa kirjastofunktiota — tätä reittiä ei siis tarvitse lisätä
 * middlewaren `isPublic()`-listaan. Reitti vaatii istunnon kuten muutkin
 * API-reitit, eikä uutta julkista päätepistettä synny.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET() {
  try {
    const tulos = await importWinposReports()
    return NextResponse.json({ ok: true, ...tulos })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
