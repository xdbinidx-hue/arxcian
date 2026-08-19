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

function seenKey(lista: WatchList): string {
  return `arxcian:watch:seen:${lista}`
}

/**
 * Lähteet joiden takakatalogi on jo vaimennettu.
 *
 * **Erillinen listan omasta rekisteristä.** Vaimennus lähdekohtaisesti eikä
 * listakohtaisesti on olennaista: kun Albin lisää taulukkoon uuden kanavan —
 * eli tekee juuri sen mitä varten taulukko on olemassa — sen viidentoista
 * videon takakatalogi olisi listakohtaisella suojalla "uutta" yhdellä
 * kertaa ja valuisi inboxiin. Se on täsmälleen se purske jota suoja estää.
 */
function initKey(lista: WatchList): string {
  return `arxcian:watch:alustetut:${lista}`
}

/**
 * Erottaa uudet ja merkitsee ne nähdyiksi samalla kertaa.
 *
 * `sadd` palauttaa 1 kun tunniste oli uusi ja 0 kun se oli jo joukossa, joten
 * erotus ja merkintä tapahtuvat yhdellä atomisella kutsulla per tunniste —
 * lue-vertaa-kirjoita kahden ajon välissä hukkaisi toisen tuloksen.
 *
 * **Uuden lähteen ensimmäinen ajo ei tuota uutuuksia.** Sen koko syöte olisi
 * määritelmällisesti uutta ja purskauttaisi viisitoista ilmoitusta kerralla.
 * Silloin tunnisteet merkitään nähdyiksi ja jätetään pois tuloksesta; uutuus
 * alkaa seuraavasta ajosta. Sama koskee kadonnutta avainta — se on
 * erottamaton ensimmäisestä ajosta, ja hiljaisuus on oikea vastaus
 * kumpaankin.
 *
 * `items` on `[lähdetunniste, sisältötunniste]` -pareja, jotta vaimennus
 * osataan kohdistaa oikeaan lähteeseen.
 */
export async function diffAndMark(
  lista: WatchList,
  items: { sourceKey: string; id: string }[],
): Promise<string[]> {
  if (items.length === 0) return []

  const client = kv()
  const sk = seenKey(lista)
  const ik = initKey(lista)

  // Mitkä lähteet on jo alustettu. Yksi kutsu, ei yhtä per lähde.
  const alustetut = new Set(await client.smembers<string[]>(ik))
  const lahteet = Array.from(new Set(items.map(i => i.sourceKey)))
  const uudetLahteet = lahteet.filter(l => !alustetut.has(l))

  // Rinnakkain: @upstash/redis niputtaa kutsut automaattisesti, joten tästä
  // ei tule yhtä kierrosta per tunniste.
  const lisatty = await Promise.all(items.map(i => client.sadd(sk, i.id)))
  await client.expire(sk, TTL_SECONDS)

  if (uudetLahteet.length > 0) {
    await client.sadd(ik, uudetLahteet[0], ...uudetLahteet.slice(1))
    await client.expire(ik, TTL_SECONDS)
    console.log(
      `[watch] ${lista}: uusi lähde vaimennettu ensimmäisellä ajolla (${uudetLahteet.join(', ')})`,
    )
  }

  // Uutta on vain se mikä oli sekä tuntematon tunniste **että** jo
  // alustetusta lähteestä.
  const uudet: string[] = []
  items.forEach((item, i) => {
    if (lisatty[i] === 1 && !uudetLahteet.includes(item.sourceKey)) uudet.push(item.id)
  })
  return uudet
}

/** Poistaa listan rekisterit. Vain testaukseen ja käsin nollaukseen. */
export async function forgetSeen(lista: WatchList): Promise<void> {
  await kv().del(seenKey(lista))
  await kv().del(initKey(lista))
}
