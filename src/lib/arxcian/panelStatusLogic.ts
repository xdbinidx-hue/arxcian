// Paneelin hakutilan yhdistely: monta hakutilaa + välimuistin kirjekuoren
// aikaleima → yksi tila jonka Panel näyttää.
//
// ⚠️ Tässä tiedostossa EI SAA OLLA ajonaikaisia importteja (`import type` on
// ok, se katoaa käännöksessä). Syy on sama kuin prayerLogic.ts:ssä ja
// shiftSchedule.ts:ssä: testit ajetaan `node --test`illä suoraan
// TypeScriptiä vastaan, eikä Noden ESM-resolveri osaa extensiotonta
// `./polku`-muotoa jota Next taas vaatii.
//
// Redis-luku on panelStatus.ts:ssä, joka uudelleenvie nämä eteenpäin.

import type { FetchStatus } from './fetchStatus'

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
 * Yhdistää hakutilat ja kirjekuoren aikaleiman paneelin näyttämäksi tilaksi.
 *
 * `fetchedAt` on välimuistin kirjekuoren aikaleima, ja se **voittaa cronin
 * aikaleiman aina kun se on uudempi**. Kirjekuori kirjoitetaan vain
 * onnistuneesta hausta, joten se on datan todellinen ikä; cronin
 * `lastSuccess` kertoo vain milloin ajastettu haku viimeksi onnistui. Nämä
 * eroavat aina kun sivu on itse hakenut datan, eli aina kun TTL ehtii
 * umpeutua cron-ajojen välissä. Ilman tätä paneeli näytti edellisen cron-ajon
 * kellonajan sekunteja sitten haetulle luvulle.
 *
 * Huom. ettei tämä koske kaikkia paneeleita samalla tavalla: `hub-channels`,
 * `watch-*`, `news-*` ja `trading-ict` kirjoittavat hakutilansa itse
 * kirjastoissaan, joten niillä oma haku päivittää myös `lastSuccess`in eivätkä
 * luvut eroa. Ero syntyy vain niillä joiden tilan kirjoittaa `cron.ts`:n
 * `kirjaaYritys`: `hub-weather`, `hub-prayer`, `trading-quotes`,
 * `rjmob-summary`.
 *
 * Vanhentuneisuutta kirjekuoren iästä ei silti päätellä — sitä varten on
 * hakutila. Kirjekuori kumoaa merkin vain kun se on todistettavasti uudempi
 * kuin kaatunut yritys.
 *
 * **Monta avainta yhdistetään pessimistisesti.** Watchin postilaatikko syntyy
 * kahdesta listasta, ja jos toinen niistä on kaatunut, paneelin sisältö on
 * vajaa vaikka toinen olisi tuore: `fetchedAt` on siksi vanhin onnistuminen ja
 * `stale` tosi jos yksikin on stale. Optimistinen yhdistäminen näyttäisi
 * terveeltä juuri silloin kun se ei ole. Monen avaimen kutsujat eivät välitä
 * kirjekuoren aikaleimaa lainkaan, joten kumoaminen ei kosketa niitä.
 *
 * **Puuttuva avain jätetään yhdistelyn ulkopuolelle, ei lasketa viaksi.**
 * Avainta ei ole ennen ensimmäistä ajoa, ja silloin "kaikki on vanhentunutta"
 * olisi hälytys tyhjästä — sama päättely kuin watchin ensimmäisessä ajossa,
 * jossa hiljaisuus on oikea vastaus.
 */
export function yhdistaHakutilat(
  tilat: readonly FetchStatus[],
  fetchedAt?: number | null,
): PanelFetchState {
  if (tilat.length === 0) {
    return { ...TUNTEMATON, fetchedAt: fetchedAt ?? null }
  }

  const cronStale = tilat.some(t => t.lastSuccess === null || t.lastSuccess < t.lastAttempt)
  const onnistumiset = tilat.map(t => t.lastSuccess).filter((ms): ms is number => ms !== null)
  // Vanhin onnistuminen, ei uusin: paneeli on niin tuore kuin sen huonoin lähde.
  const cronHetki = onnistumiset.length > 0 ? Math.min(...onnistumiset) : null
  const attemptedAt = Math.max(...tilat.map(t => t.lastAttempt))

  const omaHaku = fetchedAt ?? null
  const omaHakuUudempi = omaHaku !== null && (cronHetki === null || omaHaku > cronHetki)

  // Onnistunut oma haku kaatuneen cron-yrityksen jälkeen kumoaa merkin: data
  // ei ole vanhempaa kuin miltä näyttää, vaan juuri haettua. Ilman tätä aamun
  // kaatunut cron värjäisi paneelin punaiseksi koko päiväksi vaikka jokainen
  // sivulataus hakisi luvut onnistuneesti uudelleen.
  const omaHakuKumoaa = omaHaku !== null && omaHaku > attemptedAt

  return {
    fetchedAt: omaHakuUudempi ? omaHaku : cronHetki,
    attemptedAt,
    stale: cronStale && !omaHakuKumoaa,
    // Kaatuneiden lähteiden lista kuuluu sille yritykselle joka kaatui. Jos
    // oma haku on sitä uudempi, lista kertoisi menneestä.
    failed: omaHakuKumoaa ? [] : tilat.flatMap(t => t.failed),
  }
}
