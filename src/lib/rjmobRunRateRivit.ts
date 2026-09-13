import { tapahtumaMittari, type TapahtumaOikaisu } from './rjmobTapahtumaRunRate.ts'
import { runRateMittari, pctTavoitteesta } from './rjmob.ts'
import type { RunRateRivi, RunRateNayttoRivi } from '@/components/rjmob/RunRateTaulukko'

/**
 * Toteumien ja tavoitteiden yhdistäminen run rate -riveiksi.
 *
 * Puhdas ja jaettu, koska sama yhdistely tarvitaan Myyntiseurannan run rate
 * -näkymässä ja luku-API:ssa. Toteumat annetaan **valmiiksi
 * normalisoituna** (`RunRateToteuma`), koska sivut lukevat ne eri
 * rajapinnoista ja kassakate on niissä eri asteikossa: myymälärivin `kassa`
 * on jo kassakate (×10), myyjärivin `kassa` kassaprovisio (÷10). Kerroin
 * kuuluu kutsujalle joka tuntee oman lähteensä — **älä yhdenmukaista
 * kertoimia täällä.**
 */

export type RunRateToteuma = {
  nimi: string
  liittymat: number
  fsecure: number
  /** Kassakate euroina, alv 0. */
  kassakate: number
}

export type RunRateTavoite = {
  liittymat: number | null
  fsecure: number | null
  kassakate: number | null
}

export type Ikkuna = { paattyneet: number; kaikki: number }

const EI_TAVOITETTA: RunRateTavoite = { liittymat: null, fsecure: null, kassakate: null }

function rivi(t: RunRateToteuma, tavoite: RunRateTavoite, ikkuna: Ikkuna, naytaIkkuna: boolean): RunRateRivi {
  return {
    nimi: t.nimi,
    ikkuna: naytaIkkuna ? ikkuna : null,
    liittymat: runRateMittari(t.liittymat, tavoite.liittymat, ikkuna.paattyneet, ikkuna.kaikki),
    fsecure: runRateMittari(t.fsecure, tavoite.fsecure, ikkuna.paattyneet, ikkuna.kaikki),
    kassakate: runRateMittari(t.kassakate, tavoite.kassakate, ikkuna.paattyneet, ikkuna.kaikki),
  }
}

/**
 * Myymälärivit. Jokainen myymälä jakaa saman työpäiväikkunan (ma–la ilman
 * pyhiä), joten rivikohtaista sarakettä ei näytetä.
 */
export function myymalaRivit(
  toteumat: RunRateToteuma[],
  tavoitteet: Record<string, RunRateTavoite>,
  ikkuna: Ikkuna,
  tapahtumat: Record<string, TapahtumaOikaisu> = {},
): RunRateRivi[] {
  return toteumat.map(t => oikaise(rivi(t, tavoitteet[t.nimi] ?? EI_TAVOITETTA, ikkuna, false), ikkuna, tapahtumat[t.nimi]))
}

/**
 * Myyjärivit. Ikkuna on **myyjän omat vuorot** työvuorolistasta, ei myymälän
 * aukiolopäivät: myyjä joka tekee kolme vuoroa viikossa ei ole jäljessä
 * siksi että myymälä on auki kuutena päivänä.
 *
 * Ilman vuoroja ikkuna on 0/0, jolloin `runRateMittari` palauttaa ennusteeksi
 * `null` — juuri niin kuin pitää: myyjä joka ei ole vielä tehnyt vuoroa ei
 * ole nollatahdissa vaan ilman tahtia.
 */
export function myyjaRivit(
  toteumat: RunRateToteuma[],
  tavoitteet: Record<string, RunRateTavoite>,
  vuorot: Record<string, Ikkuna>,
  tapahtumat: Record<string, TapahtumaOikaisu> = {},
): RunRateRivi[] {
  return toteumat.map(t =>
    oikaise(rivi(t, tavoitteet[t.nimi] ?? EI_TAVOITETTA, vuorot[t.nimi] ?? { paattyneet: 0, kaikki: 0 }, true), vuorot[t.nimi] ?? { paattyneet: 0, kaikki: 0 }, tapahtumat[t.nimi]),
  )
}

/** Tavoitenäkymä sisältää myös myyjät joilta puuttuu myyntirivi. */
export function myyjaTavoiteRivit(
  toteumat: RunRateToteuma[],
  tavoitteet: Record<string, RunRateTavoite>,
  vuorot: Record<string, Ikkuna>,
  tapahtumat: Record<string, TapahtumaOikaisu> = {},
): RunRateNayttoRivi[] {
  const rivit: RunRateNayttoRivi[] = myyjaRivit(toteumat, tavoitteet, vuorot, tapahtumat)
  // Tallennettu tavoite näkyy myös ennen ensimmäistä myyntiriviä.
  // Puuttuvasta toteumasta ei päätellä nollamyyntiä tai ennustetta.
  const nimet = new Set(toteumat.map(t => t.nimi))
  const ilmanToteumaa = (tavoite: number | null) => ({ tavoite, toteuma: null, ennuste: null, pct: null })
  for (const [nimi, tavoite] of Object.entries(tavoitteet)) {
    if (nimet.has(nimi)) continue
    rivit.push({
      nimi,
      ikkuna: vuorot[nimi] ?? null,
      liittymat: ilmanToteumaa(tavoite.liittymat),
      fsecure: ilmanToteumaa(tavoite.fsecure),
      kassakate: ilmanToteumaa(tavoite.kassakate),
    })
  }
  return rivit
}

/**
 * Yhteensä-rivi.
 *
 * Myyjätaulukossakin ikkuna on **myymälätason työpäivät** eikä myyjien
 * ikkunoiden summa: tiimi kokonaisuutena tekee myymälän aukiolopäivät, ja
 * vuorojen summaaminen antaisi nimittäjäksi henkilötyövuorot, jolloin
 * yhteensä-rivin ennuste olisi eri suuretta kuin myymälätaulukon sama luku.
 */
export function yhteensaRivi(
  toteumat: RunRateToteuma[],
  tavoite: RunRateTavoite,
  ikkuna: Ikkuna,
): Omit<RunRateRivi, 'nimi' | 'ikkuna'> {
  const summa = (valitse: (t: RunRateToteuma) => number) => toteumat.reduce((s, t) => s + valitse(t), 0)
  const kaikki: RunRateToteuma = {
    nimi: 'Yhteensä',
    liittymat: summa(t => t.liittymat),
    fsecure: summa(t => t.fsecure),
    kassakate: summa(t => t.kassakate),
  }
  const { liittymat, fsecure, kassakate } = rivi(kaikki, tavoite, ikkuna, false)
  return { liittymat, fsecure, kassakate }
}

/**
 * Tavoitteiden summa. **Puuttuva mittari on `null` eikä nolla**: jos yksikään
 * rivi ei ole asettanut tavoitetta, nollasumma tekisi tavoitteesta sellaisen
 * jonka jokainen ylittää — ja yhteensä-rivi näyttäisi vihreää tyhjästä.
 */
export function tavoiteSumma(tavoitteet: RunRateTavoite[]): RunRateTavoite {
  const summa = (valitse: (t: RunRateTavoite) => number | null): number | null => {
    const luvut = tavoitteet.map(valitse).filter((n): n is number => n !== null)
    return luvut.length > 0 ? luvut.reduce((a, b) => a + b, 0) : null
  }
  return {
    liittymat: summa(t => t.liittymat),
    fsecure: summa(t => t.fsecure),
    kassakate: summa(t => t.kassakate),
  }
}

/** Vain liittymäennustetta oikaistaan vahvistetulla liittymäerittelyllä. */
function oikaise(r: RunRateRivi, ikkuna: Ikkuna, tapahtuma?: TapahtumaOikaisu): RunRateRivi {
  if (!tapahtuma) return r
  const { huomautus, ...liittymat } = tapahtumaMittari(r.liittymat, ikkuna, tapahtuma)
  return { ...r, liittymat, tapahtumaHuomautus: huomautus }
}

/** Tapahtumakorjatun taulukon liittymäennuste summataan riveistä. Puuttuva
 * rivi tekee koko ennusteesta puuttuvan; osasummaa ei nimetä kokonaiseksi. */
export function tapahtumaYhteensa(
  yhteensa: Omit<RunRateRivi, 'nimi' | 'ikkuna'>, rivit: RunRateNayttoRivi[],
): Omit<RunRateRivi, 'nimi' | 'ikkuna'> {
  if (!rivit.some(r => r.tapahtumaHuomautus)) return yhteensa
  const ennuste = rivit.some(r => r.liittymat.ennuste === null) ? null
    : rivit.reduce((sum, r) => sum + r.liittymat.ennuste!, 0)
  return { ...yhteensa, liittymat: { ...yhteensa.liittymat, ennuste, pct: pctTavoitteesta(ennuste, yhteensa.liittymat.tavoite) } }
}
