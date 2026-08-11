import { NextRequest, NextResponse } from 'next/server'
import { cachedJson } from '@/lib/apiCache'
import { loadDashData } from '@/lib/rjmobSheets'

/**
 * Yhden myyntiseurantataulukon luvut selaimelle.
 *
 * Varsinainen laskenta on kirjastossa (lib/rjmobSheets.ts), jotta myös
 * ajastettu työ pääsee siihen käsiksi ilman istuntoa ja HTTP-kierrosta.
 * Tämä reitti on enää ohut kuori: parametrin tarkistus, välimuistiotsakkeet
 * ja virheen muotoilu.
 */
export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get('fileId')
  if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 })

  try {
    return cachedJson(await loadDashData(fileId))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
