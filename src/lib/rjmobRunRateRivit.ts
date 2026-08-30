import { runRateMittari } from '@/lib/rjmob'
import type { RunRateRivi } from '@/components/rjmob/RunRateTaulukko'

/**
 * Toteumien ja tavoitteiden yhdistäminen run rate -riveiksi.
 *
 * Puhdas ja jaettu, koska sama yhdistely tarvitaan Myyntiseurannassa ja
 * Tavoitteet ja Run Rate -sivulla. Toteumat annetaan **valmiiksi
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
): RunRateRivi[] {
  return toteumat.map(t => rivi(t, tavoitteet[t.nimi] ?? EI_TAVOITETTA, ikkuna, false))
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
): RunRateRivi[] {
  return toteumat.map(t =>
    rivi(t, tavoitteet[t.nimi] ?? EI_TAVOITETTA, vuorot[t.nimi] ?? { paattyneet: 0, kaikki: 0 }, true),
  )
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
