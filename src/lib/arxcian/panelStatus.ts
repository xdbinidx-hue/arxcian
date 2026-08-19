import { readFetchStatus } from './fetchStatus'

/**
 * Paneelin hakutila: milloin data haettiin ja onnistuiko viimeisin yritys.
 *
 * **Miksi tämä on oma apurinsa.** Sama päättely oli aiemmin kirjoitettuna
 * kanavapaneeliin, ja muut paneelit näyttivät välimuistin sisällön kertomatta
 * milloin se haettiin — juuri se maksoi tunnin 19.8.2026, kun RJ-Mobin luvut
 * olivat vanhat eikä paneeli sanonut siitä mitään. Kun tieto tulee yhdestä
 * paikasta, uusi paneeli ei voi vahingossa jättää sitä pois.
 *
 * **Vanhentuneisuus on mitattu, ei pääteltyä.** Tila tulee
 * [fetchStatus.ts](fetchStatus.ts):n avaimesta, joka kirjoitetaan **jokaisella**
 * ajolla myös kaatuneella. Datan iästä ei saa päätellä mitään: ajoväli on yön
 * yli laillisesti 12 h (20:00 → 08:00), joten ikäraja joko hälyttäisi joka
 * aamu turhaan tai ei huomaisi menetettyä päivää.
 */
export type PanelFetchState = {
  /** Unix ms: milloin data viimeksi saatiin lähteestä. null jos ei tiedetä. */
  fetchedAt: number | null
  /** Unix ms: milloin hakua viimeksi yritettiin, onnistui tai ei. */
  attemptedAt: number | null
  /** Viimeisin yritys epäonnistui — näytetty data on siis vanhempaa kuin miltä näyttää. */
  stale: boolean
  /** Lähteet jotka kaatuivat viimeisimmällä yrityksellä. */
  failed: string[]
}

export const TUNTEMATON: PanelFetchState = {
  fetchedAt: null,
  attemptedAt: null,
  stale: false,
  failed: [],
}

/**
 * Kokoaa paneelin hakutilan yhdestä tai useammasta hakutila-avaimesta.
 *
 * `fetchedAt` on varana välimuistin kirjekuoren aikaleima: se kirjoitetaan
 * vain onnistuneesta hausta, joten se kelpaa hakuajaksi silloin kun erillistä
 * hakutilaa ei vielä ole (esim. ensimmäinen ajo uuden koodin jälkeen).
 * Vanhentuneisuutta siitä ei voi päätellä — sitä varten on hakutila.
 *
 * **Monta avainta yhdistetään pessimistisesti.** Watchin postilaatikko syntyy
 * kahdesta listasta, ja jos toinen niistä on kaatunut, paneelin sisältö on
 * vajaa vaikka toinen olisi tuore: `fetchedAt` on siksi vanhin onnistuminen ja
 * `stale` tosi jos yksikin on stale. Optimistinen yhdistäminen näyttäisi
 * terveeltä juuri silloin kun se ei ole.
 *
 * **Puuttuva avain jätetään yhdistelyn ulkopuolelle, ei lasketa viaksi.**
 * Avainta ei ole ennen ensimmäistä ajoa, ja silloin "kaikki on vanhentunutta"
 * olisi hälytys tyhjästä — sama päättely kuin watchin ensimmäisessä ajossa,
 * jossa hiljaisuus on oikea vastaus. Hinta on tiedossa: jos kahdesta listasta
 * toinen on ajanut ja toisen avain puuttuu, paneeli näyttää ajaneen listan
 * ajan eikä kerro toisesta mitään. Konfiguroimaton ja rikki ovat eri tiloja,
 * ja vain jälkimmäinen ansaitsee merkin.
 */
export async function panelFetchState(
  keys: string | readonly string[],
  fetchedAt?: number | null,
): Promise<PanelFetchState> {
  const lista = typeof keys === 'string' ? [keys] : keys
  const tilat = (await Promise.all(lista.map(readFetchStatus))).filter(t => t !== null)

  if (tilat.length === 0) {
    return { ...TUNTEMATON, fetchedAt: fetchedAt ?? null }
  }

  const stale = tilat.some(t => t.lastSuccess === null || t.lastSuccess < t.lastAttempt)
  const onnistumiset = tilat.map(t => t.lastSuccess).filter((ms): ms is number => ms !== null)

  return {
    // Vanhin onnistuminen, ei uusin: paneeli on niin tuore kuin sen huonoin lähde.
    fetchedAt: onnistumiset.length > 0 ? Math.min(...onnistumiset) : (fetchedAt ?? null),
    attemptedAt: Math.max(...tilat.map(t => t.lastAttempt)),
    stale,
    failed: tilat.flatMap(t => t.failed),
  }
}
