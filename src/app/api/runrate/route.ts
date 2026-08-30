import { NextRequest, NextResponse } from 'next/server'
import { loadRunRate } from '@/lib/rjmobRunRate'

/**
 * Kuukauden tavoitteet, työpäivät ja myyjien vuorot run rate -näkymälle.
 *
 * **Ei `cachedJson`ia.** Albinin vaatimus on että luvut päivittyvät heti kun
 * tavoitetaulukko Drivessä päivittyy, ja `s-maxage=300` tarkoittaisi että
 * juuri kirjattu tavoite näkyisi vasta viiden minuutin päästä. Kuorma on
 * pieni: kaksi Drive-listausta, yksi lataus ja yksi KV-luku.
 *
 * Toteumat tulevat erikseen `/api/sheets`istä ja `/api/targets`ista, jotka
 * saavat välimuistittua kuten ennenkin — tavoite on se joka muuttuu käsin.
 */
export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get('fileId')
  if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 })

  try {
    return NextResponse.json(await loadRunRate(fileId), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
