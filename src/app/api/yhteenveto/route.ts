import { NextRequest, NextResponse } from 'next/server'
import { avainKelpaa } from '@/lib/arxcian/jaettuAvain'
import { buildYhteenveto } from '@/lib/arxcian/yhteenveto'

/**
 * RJ-Mobin kuukausiyhteenveto koneluettavana, jaetulla avaimella.
 *
 * Olemassa siksi että ajastettu Etelän Härät -yhteenveto haki luvut Albinin
 * omalla selaimella, eli toimi vain kun Mac oli hereillä ja työpöytäsovellus
 * auki. Klo 9:00 se ei ole, joten rutiini epäonnistui. Tämän reitin kautta
 * ajo pyörii pilvestä ilman selainta.
 *
 * **Vain luku.** Reitti ei kirjoita mitään eikä ota parametreja.
 *
 * Todennus on tässä reitissä eikä middlewaressa: kutsuja on ajastettu tehtävä
 * jolla ei ole istuntoevästettä, joten `/api/yhteenveto` on middlewaren
 * ohituslistalla ja tarkistaa avaimen itse. Ilman ohitusta vastaus olisi
 * login-sivun HTML eikä JSON.
 */

export const dynamic = 'force-dynamic'

/** Vastaus ei saa jäädä Vercelin reunavälimuistiin — luvut muuttuvat päivän mittaan. */
const OTSAKKEET = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' }

export async function GET(req: NextRequest) {
  const odotettu = process.env.YHTEENVETO_AVAIN

  // Konfiguroimaton ja väärä avain ovat eri vikoja ja vaativat eri korjauksen:
  // 503 kertoo ylläpitäjälle että muuttuja puuttuu ajavasta deploysta, 401
  // kutsujalle ettei avain kelpaa. Tyhjä avain ei saa koskaan kelvata.
  if (!odotettu) {
    return NextResponse.json({ virhe: 'ei käytössä' }, { status: 503, headers: OTSAKKEET })
  }

  // Otsake ensisijaisena: kyselyparametrit päätyvät palvelinlokeihin ja
  // selainhistoriaan, otsake ei. Kumpaakaan ei kirjoiteta lokiin täältä.
  const annettu = req.headers.get('x-arxcian-avain') ?? req.nextUrl.searchParams.get('avain')

  if (!avainKelpaa(annettu, odotettu)) {
    // Ei vihjeitä siitä kumpi meni pieleen — puuttuva ja väärä avain vastaavat samoin.
    return NextResponse.json({ virhe: 'ei oikeutta' }, { status: 401, headers: OTSAKKEET })
  }

  try {
    return NextResponse.json(await buildYhteenveto(), { headers: OTSAKKEET })
  } catch (e: unknown) {
    return NextResponse.json(
      { virhe: e instanceof Error ? e.message : String(e) },
      { status: 500, headers: OTSAKKEET },
    )
  }
}
