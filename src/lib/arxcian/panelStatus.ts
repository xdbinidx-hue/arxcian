import { readFetchStatus } from './fetchStatus'
import { yhdistaHakutilat, type PanelFetchState } from './panelStatusLogic'

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
 *
 * Yhdistelysäännöt ja tyypit ovat
 * [panelStatusLogic.ts](panelStatusLogic.ts):ssä, jotta ne ovat testattavissa
 * ilman Redisiä. Ne viedään täältä eteenpäin, joten kutsujat eivät muutu.
 */

export {
  TUNTEMATON,
  yhdistaHakutilat,
  type PanelFetchState,
} from './panelStatusLogic'

/** Lukee hakutilat Redisistä ja yhdistää ne, ks. yhdistaHakutilat. */
export async function panelFetchState(
  keys: string | readonly string[],
  fetchedAt?: number | null,
): Promise<PanelFetchState> {
  const lista = typeof keys === 'string' ? [keys] : keys
  const tilat = (await Promise.all(lista.map(readFetchStatus))).filter(t => t !== null)
  return yhdistaHakutilat(tilat, fetchedAt)
}
