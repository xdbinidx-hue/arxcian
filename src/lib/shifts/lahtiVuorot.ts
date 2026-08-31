// Lahden (Holma, Syke) työvuorot Drive-taulukon LAHTI-välilehdeltä.
//
// ⚠️ Tässä tiedostossa EI SAA OLLA ajonaikaisia importteja muualta kuin
// `.ts`-päätteisistä sisarmoduuleista — sama syy kuin
// [tyovuoroExcel.ts](tyovuoroExcel.ts):ssä: testit ajetaan `node --test`illä
// suoraan TypeScriptiä vastaan.
import { ENSIMMAINEN_PAIVARIVI, sarakeIndeksi, viimeinenPaivarivi } from './tyovuoroExcel.ts'

/**
 * Lahden vuorot ovat **samassa työkirjassa kuin PK-seudun**, omalla
 * välilehdellään (todettu 31.8.2026 — välilehdet olivat siihen asti
 * `Taulukko1` ja jaettiin samana iltana `PK-SEUTU`:ksi ja `LAHTI`:ksi).
 *
 * Kaksi asiaa tekee tästä oman lukijansa eikä `jasennaTyovuorotaulukko`n
 * parametria:
 *
 * - **Sarakekartta on eri.** LAHTI-välilehdellä on kahdeksan myyjää eri
 *   järjestyksessä, ja Tapahtumat/Toiveet ovat AF/AI eivät AR/AU.
 * - **Generaattori ei koske Lahteen.** PK-lukijan tuotos on generaattorin
 *   syöte (poissaolot, onnenpäivät, miehitys); Lahdesta luetaan vain
 *   toteutuneet vuorot run ratea varten. Miehityssääntöjä, aukioloja eikä
 *   vuoropohjia ei ole olemassa Lahdelle, eikä niitä saa päätellä tästä
 *   taulukosta taaksepäin.
 */
export const LAHTI_VALILEHTI = 'LAHTI'

/**
 * Myyjien sarakkeet LAHTI-välilehdellä, kolme saraketta kutakin.
 *
 * Luettu taulukon riviltä 3 (31.8.2026). Sarakkeet Z ja AC ovat tyhjiä
 * `Myyjä`-paikanpitäjiä eivätkä ole tässä; nimetön sarake ei voi tuottaa
 * vuoroja kenellekään.
 *
 * **Basri Salihi puuttuu välilehdeltä**, vaikka hän teki elokuussa 2026
 * 30 h Holmassa. Se on taulukon tila eikä lukijan vika — hänelle ei siksi
 * synny vuoroikkunaa, ja run rate näyttää hänelle viivaa. Jos hänelle
 * lisätään sarake, se lisätään tähän.
 */
export const LAHTI_MYYJA_SARAKKEET = ([
  ['Albin Rashica', 'B'], ['Arbnor Rashica', 'E'], ['Steven Sainio', 'H'],
  ['Jami Tonteri', 'K'], ['Joni Viljamaa', 'N'], ['Atte Kröger', 'Q'],
  ['Leo Rossi', 'T'], ['Daniel Miettinen', 'W'],
] as [string, string][]).map(([seller, eka]) => {
  const i = sarakeIndeksi(eka)
  return { seller, vuoro: i, tunnit: i + 1, myymala: i + 2 }
})

/** Yksi luettu vuoro. Vain se mitä run rate tarvitsee. */
export type LahtiVuoro = {
  seller: string
  /** YYYY-MM-DD */
  date: string
  /** Myymäläsarakkeen merkintä sellaisenaan, esim. "H", "S", "jkl". */
  paikka: string
  tunnit: number
}

/**
 * Poissaolosanat vuorosarakkeessa.
 *
 * **LAHTI-välilehdellä ei voi käyttää PK-puolen `onPoissaolo`a**, joka
 * tulkitsee minkä tahansa kirjaimia sisältävän solun poissaoloksi. Siellä
 * sääntö toimii, koska tapahtumat merkitään myymäläsarakkeeseen ja
 * vuorosarakkeessa on aina kellonaika. Täällä tapahtumat kirjoitetaan
 * **koodina vuorosarakkeeseen** tuntien kanssa, ja ne ovat työpäiviä:
 *
 * | Solu | Tunnit | Mikä | Lasketaanko |
 * |---|---|---|---|
 * | `YLÖ` | 11 | Ylöjärven tapahtuma | kyllä |
 * | (tyhjä) + paikka `jkl` | 10 | Jyväskylän tapahtuma | kyllä |
 * | `Saikku` | 9 | sairauspoissaolo | **ei** |
 * | `vapaa` / `loma` | tyhjä | vapaapäivä | ei |
 *
 * Sairauspoissaololle on merkitty tunnit, joten pelkkä "onko tunteja"
 * -sääntö laskisi sen työpäiväksi. Se on juuri väärin päin: myyjä ei ollut
 * myymässä, joten päivä ei kuulu ennusteen nimittäjään.
 *
 * Lista on tarkoituksella sanalista eikä "kaikki teksti": tuntemattoman
 * koodin (uusi tapahtumapaikka) on turvallisempaa laskea työpäiväksi kuin
 * kadota hiljaa — tapahtumat ovat pitkiä päiviä ja niitä tulee lisää.
 */
const POISSAOLOSANAT = ['vapaa', 'loma', 'saikku', 'sairas', 'sairaus', 'poissa']

function onPoissaolomerkinta(vuoroSolu: string): boolean {
  const t = vuoroSolu.toLowerCase()
  return POISSAOLOSANAT.some(s => t.includes(s))
}

/**
 * Onko rivin solupari oikeasti vuoro.
 *
 * Ratkaisu tehdään **tuntisarakkeesta** eikä kellonajasta: taulukossa on
 * tapahtumapäiviä joissa kellonaika on jätetty tyhjäksi mutta tunnit ja
 * paikka on merkitty (`| 10 | jkl`). Ne ovat työpäiviä siinä missä muutkin,
 * ja kellonaikaa vaatimalla ne katoaisivat.
 */
function onVuoro(vuoroSolu: string, tunnitSolu: string): boolean {
  if (onPoissaolomerkinta(vuoroSolu)) return false
  const t = tunnitSolu.replace(',', '.').trim()
  if (t === '') return false
  const n = Number(t)
  return Number.isFinite(n) && n > 0
}

function teksti(rivi: string[] | undefined, sarake: number): string {
  return (rivi?.[sarake] ?? '').toString().trim()
}

/**
 * Jäsennä LAHTI-välilehden solut vuoroiksi.
 *
 * @param rivit Koko välilehden solut tekstinä. Indeksi 0 = rivi 1.
 */
export function jasennaLahtiVuorot(
  rivit: string[][], vuosi: number, kuukausi: number,
): LahtiVuoro[] {
  const paivia = new Date(vuosi, kuukausi, 0).getDate()
  const viimeinen = viimeinenPaivarivi(vuosi, kuukausi)
  const vuorot: LahtiVuoro[] = []

  for (let paiva = 1; paiva <= paivia; paiva++) {
    const riviNro = ENSIMMAINEN_PAIVARIVI + paiva - 1
    if (riviNro > viimeinen) break
    const rivi = rivit[riviNro - 1]
    const date = `${vuosi}-${String(kuukausi).padStart(2, '0')}-${String(paiva).padStart(2, '0')}`

    for (const s of LAHTI_MYYJA_SARAKKEET) {
      const vuoroSolu = teksti(rivi, s.vuoro)
      const tunnitSolu = teksti(rivi, s.tunnit)
      if (!onVuoro(vuoroSolu, tunnitSolu)) continue
      vuorot.push({
        seller: s.seller,
        date,
        paikka: teksti(rivi, s.myymala),
        tunnit: Number(tunnitSolu.replace(',', '.')),
      })
    }
  }

  return vuorot
}

/**
 * Myyjä → vuorot päättyneisiin päiviin asti ja koko kuukaudessa.
 *
 * Sama muoto kuin `laskeVuoroIkkuna`n tuotos
 * ([shiftSchedule.ts](../shiftSchedule.ts)), jotta run rate voi yhdistää
 * PK-listan ja Lahden ilman muunnosta. Raja on ISO-päivämääränä ja
 * vertaillaan merkkijonona samasta syystä kuin siellä.
 */
export function lahtiVuoroIkkuna(
  vuorot: LahtiVuoro[], viimeinenPaattynyt: string,
): Record<string, { paattyneet: number; kaikki: number }> {
  const ikkuna: Record<string, { paattyneet: number; kaikki: number }> = {}
  for (const v of vuorot) {
    const prev = ikkuna[v.seller] ?? { paattyneet: 0, kaikki: 0 }
    ikkuna[v.seller] = {
      paattyneet: prev.paattyneet + (v.date <= viimeinenPaattynyt ? 1 : 0),
      kaikki: prev.kaikki + 1,
    }
  }
  return ikkuna
}
