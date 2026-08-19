// Työvuorolista-taulukon lukija.
//
// Jäsennysfunktio on tarkoituksella **puhdas**: sisään annetaan jo luettu
// soluruudukko, ei tiedostoa eikä Drive-yhteyttä. Näin taulukon rakenteen
// tulkinta on yksikkötestattavissa ilman verkkoa, ja Drive-puoli
// ([tyovuoroDrive.ts](src/lib/shifts/tyovuoroDrive.ts)) jää ohueksi kuoreksi.
//
// Huom. `import type` on tahallinen: se katoaa käännöksessä, joten tämä
// tiedosto latautuu sellaisenaan `node --test`iin ilman käännösvaihetta.
// Ajonaikaista importtia ei saa lisätä. Ks. src/lib/shiftSchedule.ts.
import type { StoreName, KuukaudenSyote, PaivanSyote } from '../shiftSchedule'

/** Ensimmäinen päivärivi (1-pohjainen). Rivi 3 on otsikot. */
export const ENSIMMAINEN_PAIVARIVI = 4

/**
 * Viimeinen rivi johon päivä voi osua. Rivi 35 on tuntisummakaavat
 * (`=SUM(C4:C33)`) ja rivit 37–68 Huoltolista — niihin ei kosketa koskaan.
 *
 * ⚠️ **Avoin asia 31 päivän kuukausissa.** Toimeksiannon "rivit 4–33" on
 * mitattu syyskuun tiedostosta, jossa on 30 päivää: 4…33 on täsmälleen 30
 * riviä, ja summakaava `SUM(C4:C33)` kattaa juuri ne. Elokuussa on 31
 * päivää, jolloin viimeinen päivä osuu riville 34. Siksi päivärivit
 * johdetaan kuukauden pituudesta eikä kiinnitetä 33:een — muuten kuukauden
 * viimeinen päivä katoaisi.
 *
 * Ennen ensimmäistä 31 päivän kuukauden kirjoitusta on tarkistettava
 * oikeasta tiedostosta ulottuuko summakaava riville 34. Jos ei, kaava on
 * korjattava taulukossa, ei koodissa.
 */
export const TURVARAJA_RIVI = 34

/** Kuukauden viimeinen päivärivi. */
export function viimeinenPaivarivi(vuosi: number, kuukausi: number): number {
  const paivia = new Date(vuosi, kuukausi, 0).getDate()
  return Math.min(ENSIMMAINEN_PAIVARIVI + paivia - 1, TURVARAJA_RIVI)
}

/** A1-sarakekirjaimet 0-pohjaiseksi indeksiksi: A→0, Z→25, AA→26. */
export function sarakeIndeksi(kirjaimet: string): number {
  let n = 0
  for (const merkki of kirjaimet.toUpperCase()) {
    n = n * 26 + (merkki.charCodeAt(0) - 64)
  }
  return n - 1
}

export interface MyyjaSarakkeet {
  seller: string
  /** Vuorosarake ("10-16") — tänne myös poissaolomerkintä ("Nizza"). */
  vuoro: number
  /** Tuntisarake (luku). */
  tunnit: number
  /** Myymäläsarake (M/E/K) — ainoa joka väritetään. */
  myymala: number
}

/**
 * Myyjien sarakkeet taulukossa, kolme saraketta kutakin.
 *
 * Nimet on kirjoitettu tähän kokonaisina eikä tuotu `ROSTER_COLUMNS`ista,
 * koska ajonaikainen import estäisi `node --test`in (ks. tiedoston alku).
 * Yhdenmukaisuus rosterin kanssa on varmistettu testillä
 * `tyovuoroExcel.test.mts`, joten nimien erkaneminen kaataa testin eikä
 * jää huomaamatta.
 */
export const MYYJA_SARAKKEET: MyyjaSarakkeet[] = [
  ['Albin Rashica', 'B'], ['Arbnor Rashica', 'E'], ['Alec Fambro', 'H'],
  ['Joona Huttunen', 'K'], ['Krenar Bajqinovci', 'N'], ['Kasperi Kemppainen', 'Q'],
  ['Vladimir Kogan', 'T'], ['Hamza Hanif', 'W'], ['Lauri Ukkonen', 'Z'],
  ['Antti Kiljala', 'AC'], ['Ramin Kadiri', 'AF'],
].map(([seller, eka]) => {
  const i = sarakeIndeksi(eka as string)
  return { seller: seller as string, vuoro: i, tunnit: i + 1, myymala: i + 2 }
})

/** Tapahtumat-sarake (yhdistetty AR:AT). */
export const TAPAHTUMAT_SARAKE = sarakeIndeksi('AR')
/**
 * Toiveet-sarake (yhdistetty AU:AW).
 *
 * **Tätä ei lueta.** Sarakkeessa on toiveiden lisäksi viikkorutiini- ja
 * onnenpäivälegenda, eli vapaata selitystekstiä jossa esiintyy myymälöiden
 * nimiä ja sana "OP". Automaattinen luku tekisi siitä valheellisia
 * onnenpäiviä. Vakio on tässä vain dokumentoimassa että sarake on tiedossa
 * ja ohitetaan tarkoituksella.
 */
export const TOIVEET_SARAKE = sarakeIndeksi('AU')

/** Myymälän tunnistus tapahtumatekstistä. Kivistö kirjoitetaan usein
 *  ilman ä:tä, joten molemmat muodot kelpaavat. */
const MYYMALA_ALIAKSET: { store: StoreName; aliakset: string[] }[] = [
  { store: 'Malmi', aliakset: ['malmi'] },
  { store: 'Easton', aliakset: ['easton'] },
  { store: 'Kivistö', aliakset: ['kivistö', 'kivisto'] },
]

/** Kellonaikaväli, esim. "10-16", "10.00-16.00", "10:00 – 16:00". */
const KELLONAIKA = /^\d{1,2}([.:]\d{2})?\s*[-–—]\s*\d{1,2}([.:]\d{2})?$/

function teksti(rivi: string[] | undefined, sarake: number): string {
  return (rivi?.[sarake] ?? '').toString().trim()
}

/**
 * Onko tapahtumateksti *oman* myymälän tapahtuma tai onnenpäivä.
 *
 * Ehtona on sekä myymälän nimi että sana "OP"/"Tapahtuma". Muiden
 * myymälöiden merkinnät ("Iisalmi Tapahtuma", "Holma OP", "Syke Tapahtuma",
 * "Nokia Tapahtuma") jäävät siis pelkiksi merkinnöiksi eivätkä vaikuta
 * vuoroihin. Yhdellä rivillä voi olla monta myymälää:
 * "Easton, Kivistö OP" ja "Easton OP / Kivistö OP" tuottavat molemmat kaksi.
 */
export function soloMyymalat(tapahtumateksti: string): StoreName[] {
  const t = tapahtumateksti.toLowerCase()
  if (!/\bop\b/.test(t) && !t.includes('tapahtuma')) return []
  const out: StoreName[] = []
  for (const { store, aliakset } of MYYMALA_ALIAKSET) {
    // Sanarajaus estää "Iisalmi" → "Malmi" -tyyppiset väärät osumat.
    if (aliakset.some(a => new RegExp(`(^|[^a-zåäö])${a}([^a-zåäö]|$)`).test(t))) out.push(store)
  }
  return out
}

/**
 * Onko solun teksti poissaolomerkintä.
 *
 * Vuorosarakkeessa on normaalisti kellonaikaväli. Mikä tahansa muu
 * kirjaimia sisältävä teksti ("Nizza", "loma", "vapaa") on poissaolo.
 * Kirjainvaatimus on tarkoituksellinen: pelkkä irrallinen numero on
 * näppäilyvirhe, ei loma, eikä siitä pidä tehdä poissaoloa.
 */
export function onPoissaolo(soluteksti: string): boolean {
  const t = soluteksti.trim()
  if (!t) return false
  if (KELLONAIKA.test(t)) return false
  return /[a-zåäöA-ZÅÄÖ]/.test(t)
}

/**
 * Jäsennä taulukon soluruudukko generaattorin syötteeksi.
 *
 * @param rivit Koko välilehden solut tekstinä. Indeksi 0 = rivi 1.
 */
export function jasennaTyovuorotaulukko(
  rivit: string[][], vuosi: number, kuukausi: number,
): KuukaudenSyote {
  const paivia = new Date(vuosi, kuukausi, 0).getDate()
  const viimeinen = viimeinenPaivarivi(vuosi, kuukausi)
  const paivat: PaivanSyote[] = []

  for (let paiva = 1; paiva <= paivia; paiva++) {
    const riviNro = ENSIMMAINEN_PAIVARIVI + paiva - 1
    if (riviNro > viimeinen) break
    const rivi = rivit[riviNro - 1]

    const tapahtumateksti = teksti(rivi, TAPAHTUMAT_SARAKE)
    const poissaolot: { seller: string; label: string }[] = []
    for (const s of MYYJA_SARAKKEET) {
      const solu = teksti(rivi, s.vuoro)
      if (onPoissaolo(solu)) poissaolot.push({ seller: s.seller, label: solu })
    }

    paivat.push({
      date: `${vuosi}-${String(kuukausi).padStart(2, '0')}-${String(paiva).padStart(2, '0')}`,
      tapahtumat: tapahtumateksti ? [tapahtumateksti] : [],
      soloMyymalat: soloMyymalat(tapahtumateksti),
      poissaolot,
    })
  }

  return { vuosi, kuukausi, paivat }
}
