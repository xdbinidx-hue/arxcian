import { kv } from '../kv'
import type { WatchList } from './types'

/**
 * Nähtyjen tunnisteiden rekisteri.
 *
 * **Eri avain kuin sisältövälimuisti, tarkoituksella.** Uutuus ei saa johtua
 * sisällön välimuistista: [fetchNews.ts](../news/fetchNews.ts) päättelee sen
 * 60 artikkelin listasta jolla on 5 h TTL, joten avaimen kadotessa kaikki
 * näyttää uudelta. Tiivistyksessä se maksaa vain tokeneita, ilmoituksissa se
 * olisi ilmoitusryöppy.
 *
 * Elinikä on selvästi pidempi kuin minkään sisältöavaimen, ja se uusitaan
 * joka ajolla — aktiivisesti seurattu lista ei siis vanhene koskaan.
 */

const TTL_SECONDS = 180 * 24 * 60 * 60

function key(lista: WatchList): string {
  return `arxcian:watch:seen:${lista}`
}

/**
 * Erottaa uudet ja merkitsee ne nähdyiksi samalla kertaa.
 *
 * `sadd` palauttaa 1 kun tunniste oli uusi ja 0 kun se oli jo joukossa, joten
 * erotus ja merkintä tapahtuvat yhdellä atomisella kutsulla per tunniste —
 * lue-vertaa-kirjoita kahden ajon välissä hukkaisi toisen tuloksen.
 *
 * **Ensimmäinen ajo ei tuota uutuuksia.** Kun joukkoa ei vielä ole, koko
 * syöte olisi määritelmällisesti uutta ja jokainen lähde purskauttaisi
 * viisitoista ilmoitusta kerralla. Silloin kaikki merkitään nähdyiksi ja
 * palautetaan tyhjä: uutuus alkaa seuraavasta ajosta. Sama koskee tilannetta
 * jossa avain on kadonnut — se on tunnistamattomissa ensimmäisestä ajosta,
 * ja hiljaisuus on oikea vastaus kumpaankin.
 */
export async function diffAndMark(lista: WatchList, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []

  const k = key(lista)
  const client = kv()

  const tunnettu = await client.exists(k)

  // Rinnakkain: @upstash/redis niputtaa kutsut automaattisesti, joten tästä
  // ei tule viittätoista erillistä kierrosta.
  const lisatty = await Promise.all(ids.map(id => client.sadd(k, id)))
  await client.expire(k, TTL_SECONDS)

  if (!tunnettu) {
    console.log(
      `[watch] ${lista}: ensimmäinen ajo, ${ids.length} tunnistetta merkittiin nähdyiksi ilman ilmoituksia`,
    )
    return []
  }

  return ids.filter((_, i) => lisatty[i] === 1)
}

/** Poistaa listan rekisterin. Vain testaukseen ja käsin nollaukseen. */
export async function forgetSeen(lista: WatchList): Promise<void> {
  await kv().del(key(lista))
}
