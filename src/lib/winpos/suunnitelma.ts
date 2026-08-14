import type { WinposRivi } from './winpos-parser'

/**
 * Kirjoituksen päättely ilman Sheets-rajapintaa.
 *
 * Erotettu omaksi puhtaaksi funktiokseen, jotta rivikaton laajennus ja
 * kirjoitusalueen tyhjennys voidaan testata oikeasti eikä vain lukemalla
 * koodia. Kaikki taulukon tila tulee sisään argumenttina.
 */

/** Ensimmäinen datarivi; rivi 1 on otsikko. */
export const ENSIMMAINEN_DATARIVI = 2

/**
 * Kassamyynti-välilehden sarakkeet ja mistä Winpos-rivin kentästä ne
 * täytetään.
 *
 * ⚠️ Nimisarakkeeseen kirjoitetaan `nimiRaaka` eikä `nimi` — tämä näyttää
 * virheeltä jos katsoo vain tätä päätä, mutta on tahallista.
 *
 * Taulukossa on kaksi nimisaraketta ja kierto niiden välillä:
 *
 *   sarake C ("Nimi")         Winposin RAAKANIMI, esim. "Steven"
 *                             — tämä kirjoitetaan tässä
 *   sarake A ("Nimikorjaus")  =XLOOKUP(C2; J:J; K:K; C2) kääntää sen koko
 *                             nimeksi "Steven Sainio" hakutaulusta J:K
 *   lukupää                   [rjmobTargets.ts](src/lib/rjmobTargets.ts)
 *                             lukee sarakkeen A eli korjatun nimen, joka
 *                             on ainoa muoto joka matchaa RJ_MOB_SELLERS-
 *                             listaan
 *
 * Jos tähän "korjataan" koko nimi (`r.nimi`), XLOOKUP ei löydä sitä
 * hakutaulusta — kaava palauttaa varana saman koko nimen, joten pinnalta
 * kaikki näyttää toimivan. Mutta samalla nimikartan ylläpito siirtyy
 * hiljaa taulukosta koodiin ([winpos-myyjat.ts](src/lib/winpos/winpos-myyjat.ts)),
 * ja uusi myyjä alkaa vaatia koodimuutoksen sen sijaan että Albin lisäisi
 * rivin hakutauluun. Älä muuta toista päätä koskematta toiseen.
 */
export const SARAKKEET: { otsikot: string[]; arvo: (r: WinposRivi) => string | number }[] = [
  { otsikot: ['koodi'], arvo: r => r.koodi },
  { otsikot: ['nimi'], arvo: r => r.nimiRaaka },
  { otsikot: ['myynti'], arvo: r => r.myynti },
  { otsikot: ['kate'], arvo: r => r.kate },
  { otsikot: ['palautus'], arvo: r => r.palautus },
  { otsikot: ['alennus'], arvo: r => r.alennus },
  { otsikot: ['kuittien määrä', 'kuitit', 'kuitti'], arvo: r => r.kuitit },
]

export type Taulukkotila = {
  /** Otsikkorivin solut sellaisenaan. */
  otsikot: string[]
  /** Sarakkeen A solut kaavamuodossa. Indeksi 0 = rivi 1. */
  aSarake: string[]
  /** Datalohkon nykyinen sisältö riveittäin. Indeksi 0 = rivi 1. */
  nykyisetRivit: string[][]
}

export type Kirjoitussuunnitelma = {
  /** Datalohkon ensimmäinen ja viimeinen sarakeindeksi (0 = A). */
  eka: number
  vika: number
  /** Kirjoitettavat solut riveittäin, sarakejärjestyksessä eka..vika. */
  taulukko: (string | number)[][]
  /** Sarakkeeseen A lisättävät nimikorjauskaavat. */
  lisattavatKaavat: { rivi: number; kaava: string }[]
  /** A1-alue joka tyhjennetään ennen kirjoitusta. */
  tyhjennettavaAlue: string
  /** A1-alue johon rivit kirjoitetaan. */
  kirjoitettavaAlue: string
}

export function sarakeKirjain(index: number): string {
  return String.fromCharCode(65 + index)
}

/**
 * Otsikkohaku nimen perusteella, ei paikan — mutta **täsmällinen osuma
 * ensin**.
 *
 * Pelkkä `includes` ei riitä tällä välilehdellä: haku `'nimi'` osuisi
 * sarakkeeseen `Nimikorjaus` (sarake A) ennen varsinaista `Nimi`-saraketta
 * (sarake C), koska A tulee ensin. Silloin datalohko alkaisi sarakkeesta A
 * ja kirjoitus tuhoaisi nimikorjauskaavat — tai käytännössä keskeytyisi
 * turvarajaan eikä tuonti toimisi lainkaan.
 *
 * Siksi jokaiselle hakusanalle etsitään ensin täsmälleen vastaava otsikko ja
 * vasta sitten osittainen. `Kate(alv0)` löytyy edelleen haulla `'kate'`.
 */
function etsiSarake(otsikot: string[], haut: string[]): number {
  const normi = (s: string) => s.toLowerCase().trim()
  for (const h of haut) {
    const tarkka = otsikot.findIndex(o => normi(o) === normi(h))
    if (tarkka >= 0) return tarkka
  }
  for (const h of haut) {
    const osittainen = otsikot.findIndex(o => normi(o).includes(normi(h)))
    if (osittainen >= 0) return osittainen
  }
  return -1
}

/**
 * Siirtää kaavan viittaukset toiselle riville: `=XLOOKUP(C77; ...)` → `C78`.
 * Sarakeviittaukset ilman rivinumeroa (`J:J`) jäävät koskematta.
 */
export function siirraKaava(kaava: string, mistaRivi: number, minneRivi: number): string {
  return kaava.replace(new RegExp(`(\\$?[A-Z]{1,3}\\$?)${mistaRivi}\\b`, 'g'), `$1${minneRivi}`)
}

export function suunnitteleKirjoitus(tila: Taulukkotila, rivit: WinposRivi[]): Kirjoitussuunnitelma {
  const indeksit = SARAKKEET.map(s => etsiSarake(tila.otsikot, s.otsikot))
  const puuttuvat = SARAKKEET.filter((_, i) => indeksit[i] < 0).map(s => s.otsikot[0])
  if (puuttuvat.length > 0) {
    throw new Error(`Kassamyynti-välilehdeltä puuttuu sarake: ${puuttuvat.join(', ')}`)
  }

  const eka = Math.min.apply(null, indeksit)
  const vika = Math.max.apply(null, indeksit)

  // Turvaraja: sarakkeessa A on nimikorjauskaava, eikä sen päälle kirjoiteta
  // dataa koskaan. Jos otsikkohaku osuisi siihen, keskeytetään.
  if (eka === 0) {
    throw new Error('Sarakekohdistus osui sarakkeeseen A, jossa on nimikorjauskaava — kirjoitus keskeytetty.')
  }

  const viimeinenUusiRivi = ENSIMMAINEN_DATARIVI + rivit.length - 1

  // --- Nimikorjauskaavan kattavuus sarakkeessa A ---
  let viimeinenKaavaRivi = 0
  let malliRivi = 0
  for (let i = 0; i < tila.aSarake.length; i++) {
    if ((tila.aSarake[i] ?? '').startsWith('=')) {
      viimeinenKaavaRivi = i + 1
      malliRivi = i + 1
    }
  }

  const lisattavatKaavat: { rivi: number; kaava: string }[] = []
  if (viimeinenUusiRivi > viimeinenKaavaRivi) {
    if (malliRivi === 0) {
      throw new Error(
        'Sarakkeesta A ei löytynyt yhtään nimikorjauskaavaa, joten sitä ei voi laajentaa ' +
          `${rivit.length} riville. Kirjoitus keskeytetty — rivi jonka nimi ei korjaudu on pahempi kuin puuttuva rivi.`,
      )
    }
    const malli = tila.aSarake[malliRivi - 1]
    for (let r = viimeinenKaavaRivi + 1; r <= viimeinenUusiRivi; r++) {
      lisattavatKaavat.push({ rivi: r, kaava: siirraKaava(malli, malliRivi, r) })
    }
  }

  // --- Nykyinen datan laajuus, jotta lyhyempi raportti ei jätä jämiä ---
  let viimeinenNykyinenRivi = ENSIMMAINEN_DATARIVI - 1
  for (let i = 0; i < tila.nykyisetRivit.length; i++) {
    const rivi = tila.nykyisetRivit[i] ?? []
    if (rivi.some(c => String(c ?? '').trim() !== '')) viimeinenNykyinenRivi = i + 1
  }

  const tyhjennettavaLoppu = Math.max(viimeinenNykyinenRivi, viimeinenUusiRivi, ENSIMMAINEN_DATARIVI)

  const leveys = vika - eka + 1
  const taulukko = rivit.map(r => {
    const solut: (string | number)[] = new Array(leveys).fill('')
    SARAKKEET.forEach((s, i) => {
      solut[indeksit[i] - eka] = s.arvo(r)
    })
    return solut
  })

  return {
    eka,
    vika,
    taulukko,
    lisattavatKaavat,
    tyhjennettavaAlue: `${sarakeKirjain(eka)}${ENSIMMAINEN_DATARIVI}:${sarakeKirjain(vika)}${tyhjennettavaLoppu}`,
    kirjoitettavaAlue: `${sarakeKirjain(eka)}${ENSIMMAINEN_DATARIVI}:${sarakeKirjain(vika)}${Math.max(viimeinenUusiRivi, ENSIMMAINEN_DATARIVI)}`,
  }
}
