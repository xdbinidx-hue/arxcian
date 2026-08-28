// Työvuorolistan kirjoitussuunnitelma — puhdas päättely ilman Sheets-rajapintaa.
//
// Sama kuri kuin Winpos-putken [suunnitelma.ts](src/lib/winpos/suunnitelma.ts):ssä:
// mitä soluihin kirjoitetaan ja mitä värjätään päätetään täällä, jotta se
// voidaan testata oikeasti eikä vain lukemalla koodia. Kaikki taulukon tila
// tulee sisään argumenttina.
import type { DayInfo, StoreName } from '../shiftSchedule'
// Ajonaikainen tuonti .ts-päätteellä: testi ajetaan `node --test`illä suoraan
// TypeScriptiä vastaan eikä Noden ESM-resolveri osaa extensiotonta muotoa.
import { PLACE_LETTER, onTapahtuma } from '../shiftSchedule.ts'
// ".ts"-pääte on tahallinen: tämä moduuli on yksikkötestattu ja Noden
// ESM-resolveri vaatii päätteen (ks. tsconfigin allowImportingTsExtensions).
import { ENSIMMAINEN_PAIVARIVI, MYYJA_SARAKKEET, viimeinenPaivarivi, sarakeIndeksi } from './tyovuoroExcel.ts'

/**
 * Kirjoitusalueen sarakerajat: **B–AH**, eli täsmälleen myyjien kolme
 * saraketta yhdestätoista myyjästä.
 *
 * Rajaus on tarkoituksella suorakaide eikä yksittäisiä soluja: näin on
 * mahdotonta osua vahingossa sarakkeeseen A (Pvm), AR (Tapahtumat) tai
 * AU (Toiveet). Ne ovat Albinin omaa syötettä, ja niiden ylikirjoitus söisi
 * juuri sen tiedon josta koko generointi lähtee.
 */
export const EKA_SARAKE = sarakeIndeksi('B')   // 1
export const VIKA_SARAKE = sarakeIndeksi('AH') // 33

/** Vuoro-, tunti- ja myymäläsarakkeen värit myymälöittäin. */
export const MYYMALA_VARIT: Record<StoreName, string> = {
  Malmi: 'FECACA', Easton: 'FED7AA', Kivistö: 'FEF08A',
}
/** Onnenpäivän / oman myymälän tapahtuman kirkkaat värit. */
export const MYYMALA_SOLO_VARIT: Record<StoreName, string> = {
  Malmi: 'E06666', Easton: 'F6B26B', Kivistö: 'FFFF00',
}

/**
 * Tapahtumavuoron täyttöväri taulukossa. Neutraali harmaa erottaa sen
 * myymäläsävyistä: tapahtumassa oleva myyjä ei miehitä mitään myymälää.
 */
export const TAPAHTUMA_VARI = 'E5E7EB'

export interface Kirjoitussuunnitelma {
  /** Ensimmäinen kirjoitettava rivi (1-pohjainen). */
  ekaRivi: number
  /** Viimeinen kirjoitettava rivi (1-pohjainen). */
  vikaRivi: number
  ekaSarake: number
  vikaSarake: number
  /** A1-alue jonka sisään kirjoitus rajoittuu, esim. "B4:AH33". */
  alue: string
  /** Solujen arvot. `arvot[r][c]`, r = rivi ekaRivistä, c = sarake ekaSarakkeesta. */
  arvot: string[][]
  /** Taustavärit samassa muodossa; `null` = ei täyttöä (valkoinen). */
  varit: (string | null)[][]
  /** Montako vuoroa suunnitelma kirjoittaa (tarkistusluku kuiva-ajoon). */
  vuoroja: number
  /** Montako poissaolomerkintää säilytetään. */
  poissaoloja: number
}

function a1Sarake(indeksi: number): string {
  let n = indeksi + 1
  let s = ''
  while (n > 0) {
    const jaannos = (n - 1) % 26
    s = String.fromCharCode(65 + jaannos) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** "10:00" → "10", "10:30" → "10.30" — sama muoto kuin taulukossa ennestään. */
export function muotoileAika(t: string): string {
  return t.endsWith(':00') ? t.slice(0, -3).replace(/^0/, '') : t.replace(':', '.')
}

/**
 * Rakenna kirjoitussuunnitelma vahvistetusta listasta.
 *
 * **Poissaolomerkinnät kirjoitetaan takaisin.** Kirjoitusalue on täsmälleen
 * sama jossa Albinin omat merkinnät ("Nizza", "loma") ovat, joten pelkkä
 * tyhjennys söisi ne — ja seuraava generointi ei enää löytäisi poissaoloja
 * lainkaan. Merkintä palautetaan siis samaan soluun josta se luettiin.
 */
export function rakennaKirjoitussuunnitelma(
  days: DayInfo[], vuosi: number, kuukausi: number,
): Kirjoitussuunnitelma {
  const ekaRivi = ENSIMMAINEN_PAIVARIVI
  const vikaRivi = viimeinenPaivarivi(vuosi, kuukausi)
  const leveys = VIKA_SARAKE - EKA_SARAKE + 1
  const korkeus = vikaRivi - ekaRivi + 1

  const arvot: string[][] = Array.from({ length: korkeus }, () => Array<string>(leveys).fill(''))
  const varit: (string | null)[][] = Array.from({ length: korkeus }, () => Array<string | null>(leveys).fill(null))

  const byDate = new Map<string, DayInfo>()
  for (const d of days) byDate.set(d.date, d)

  let vuoroja = 0
  let poissaoloja = 0

  for (let rivi = ekaRivi; rivi <= vikaRivi; rivi++) {
    const paiva = rivi - ekaRivi + 1
    const date = `${vuosi}-${String(kuukausi).padStart(2, '0')}-${String(paiva).padStart(2, '0')}`
    const day = byDate.get(date)
    if (!day) continue
    const r = rivi - ekaRivi

    for (const sarakkeet of MYYJA_SARAKKEET) {
      const cVuoro = sarakkeet.vuoro - EKA_SARAKE
      const cTunnit = sarakkeet.tunnit - EKA_SARAKE
      const cMyymala = sarakkeet.myymala - EKA_SARAKE

      const shift = day.shifts.find(s => s.seller === sarakkeet.seller)
      if (shift) {
        arvot[r][cVuoro] = `${muotoileAika(shift.start)}-${muotoileAika(shift.end)}`
        arvot[r][cTunnit] = String(shift.hours)
        arvot[r][cMyymala] = PLACE_LETTER[shift.store]
        // Väritetään VAIN myymäläsarake — vuoro- ja tuntisarake jäävät
        // valkoisiksi, jolloin taulukko pysyy luettavana eikä muutu
        // väriseinäksi.
        // Soolo on aina myymäläkohtainen (onnenpäivä), joten tapahtuma
        // tarkistetaan ensin — muuten indeksointi osuisi tyhjään.
        varit[r][cMyymala] = onTapahtuma(shift.store)
          ? TAPAHTUMA_VARI
          : shift.solo
            ? MYYMALA_SOLO_VARIT[shift.store]
            : MYYMALA_VARIT[shift.store]
        vuoroja++
        continue
      }

      const poissa = day.absences[sarakkeet.seller]
      if (poissa) {
        arvot[r][cVuoro] = poissa
        poissaoloja++
      }
    }
  }

  return {
    ekaRivi,
    vikaRivi,
    ekaSarake: EKA_SARAKE,
    vikaSarake: VIKA_SARAKE,
    alue: `${a1Sarake(EKA_SARAKE)}${ekaRivi}:${a1Sarake(VIKA_SARAKE)}${vikaRivi}`,
    arvot,
    varit,
    vuoroja,
    poissaoloja,
  }
}
