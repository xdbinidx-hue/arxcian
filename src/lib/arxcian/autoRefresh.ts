// Paneelin automaattisen haun ehto: kannattaako hakea nyt.
//
// ⚠️ Tässä tiedostossa EI SAA OLLA ajonaikaisia importteja (`import type` on
// ok, se katoaa käännöksessä). Sama syy kuin panelStatusLogic.ts:ssä ja
// prayerLogic.ts:ssä: testit ajetaan `node --test`illä suoraan TypeScriptiä
// vastaan, eikä Noden ESM-resolveri osaa extensiotonta `./polku`-muotoa jota
// Next taas vaatii.
//
// React-puoli on PanelRefresh.tsx:ssä, joka pitää kirjaa ajoista ja kutsuu
// tätä. Ehto on täällä siksi, että kaksi silmukkaa joita se estää eivät näy
// katsomalla — ne näkyvät vasta tuotannossa Sheets-kutsujen määrässä.

export type AutoRefreshEhto = {
  /** Unix ms nyt. */
  nyt: number
  /** Minuutteina: tätä vanhempi data haetaan uudelleen. Sama luku toimii jäähynä. */
  ikarajaMin: number
  /** Unix ms: milloin näytetty data haettiin, tai null jos ei tiedetä. */
  fetchedAt: number | null
  /** Unix ms: milloin tämä työ ajettiin viimeksi automaattisesti, tai null. */
  edellinenAutomaatti: number | null
  /** Onko välilehti esillä. Taustavälilehti ei hae. */
  nakyvissa: boolean
}

/**
 * Saako automaattisen haun ajaa nyt.
 *
 * Kolme ehtoa, ja jokainen niistä estää oman vikansa:
 *
 * - **Taustavälilehti ei hae.** Kotiruudulta avattu PWA jää auki päiviksi, ja
 *   ilman tätä jokainen taustalla oleva ikkuna hakisi omansa.
 * - **Tuoretta dataa ei haeta uudelleen.** Sama sääntö kuin `fetchAndCache`ssa
 *   — sivulataus ei kysy lähteeltä sitä mitä sillä jo on.
 * - **Edellisestä automaattiajosta on kuluttava ikäraja.** Tämä on se ehto
 *   joka ei näy koodia lukemalla: ilman sitä *epäonnistunut* haku jättää
 *   `fetchedAt`in vanhaksi, jolloin ajon jälkeinen uudelleenrenderöinti
 *   toteaa datan yhä vanhaksi ja hakee heti uudelleen. Kaatunut lähde on
 *   juuri se tilanne jossa silmukka syntyy, ja juuri se jota ei saa hakata.
 *
 * `fetchedAt: null` tarkoittaa ettei hakuaikaa tiedetä — silloin haetaan,
 * koska tuoreuden puolesta ei ole todistetta. Jäähy koskee silti.
 */
export function saakoAjaaAutomaattisesti(ehto: AutoRefreshEhto): boolean {
  const { nyt, ikarajaMin, fetchedAt, edellinenAutomaatti, nakyvissa } = ehto

  if (!nakyvissa) return false

  const ikaraja = ikarajaMin * 60_000
  if (ikaraja <= 0) return false

  if (edellinenAutomaatti !== null && nyt - edellinenAutomaatti < ikaraja) return false
  if (fetchedAt !== null && nyt - fetchedAt < ikaraja) return false

  return true
}
