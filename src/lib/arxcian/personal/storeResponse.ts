import { NextResponse } from 'next/server'
import { StoreWriteError } from './ownedStore'

/**
 * Muuntaa epäonnistuneen kirjoituksen oikeaksi HTTP-vastaukseksi.
 *
 * Ilman tätä `StoreWriteError` olisi Nextille tavallinen poikkeus ja
 * käyttäjä saisi geneerisen 500:n ilman syytä — tai pahempaa, aiemmin
 * epäonnistunut kirjoitus palautti `200 OK` ja listan josta käyttäjän
 * lisäys puuttui. Molemmat ovat sama vika eri asteisena: tulos ei kerro
 * mitä oikeasti tapahtui.
 *
 * Törmäys ja kova virhe erotetaan, koska korjaus on eri: edellinen menee
 * läpi kun sivu päivitetään, jälkimmäinen ei mene läpi ennen kuin Redis
 * vastaa taas.
 */
export async function withStoreErrors(
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await handler()
  } catch (e) {
    if (e instanceof StoreWriteError) {
      const conflict = e.reason === 'conflict'
      return NextResponse.json(
        {
          error: conflict
            ? 'Toinen muutos ehti väliin. Päivitä sivu ja yritä uudelleen.'
            : 'Tallennus epäonnistui. Yritä hetken kuluttua uudelleen.',
        },
        { status: conflict ? 409 : 503 },
      )
    }
    throw e
  }
}
