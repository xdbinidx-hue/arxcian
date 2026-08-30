import { NextRequest, NextResponse } from 'next/server'
import { haeMyyjat } from '@/lib/rjmobMyyjatDrive'

/**
 * `myyjat.md` ja sen erot koodin tuntipalkkoihin.
 *
 * Ei välimuistia: tiedostoa muokkaa ihminen joka haluaa nähdä muutoksen heti,
 * ja vastaus on pieni. Drive-virhe palautetaan varoituksena eikä statuksena —
 * sivun muut luvut ovat oikein siitä huolimatta, ja hiljainen katoaminen olisi
 * pahempi kuin näkyvä huomautus.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('kuukausi')
  const kuukausiOrder = raw && Number.isInteger(Number(raw)) ? Number(raw) : null
  const fileId = req.nextUrl.searchParams.get('fileId')

  try {
    return NextResponse.json(await haeMyyjat(kuukausiOrder, fileId), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({
      kuukausiOrder, tiedosto: null, paivitetty: null, rivit: [], palkkamuutokset: [],
      varoitukset: [`myyjat.md:n luku Drivestä epäonnistui: ${msg}`], nimivaroitukset: [],
    }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
