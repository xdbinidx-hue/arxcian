import { NextRequest, NextResponse } from 'next/server'
import { cachedJson } from '@/lib/apiCache'
import { loadTargets, TavoitteetPuuttuu } from '@/lib/rjmobTargets'

/**
 * Yhden myyntiseurantataulukon tavoitteet ja toteuma selaimelle.
 *
 * Varsinainen laskenta on kirjastossa (lib/rjmobTargets.ts), jotta myös
 * ajastettu työ pääsee siihen käsiksi ilman istuntoa ja HTTP-kierrosta.
 * Tämä reitti on enää ohut kuori: parametrin tarkistus, välimuistiotsakkeet
 * ja virheen muotoilu.
 */
export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get('fileId')
  if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 })

  try {
    return cachedJson(await loadTargets(fileId))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    // Puuttuva Tavoitteet-välilehti on väärä valinta, ei palvelinvirhe.
    const status = e instanceof TavoitteetPuuttuu ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
