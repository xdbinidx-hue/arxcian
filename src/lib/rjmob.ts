// RJ-Mob laskentasäännöt
export const LAPIMENO = 0.65
export const NORMAL_MULT = 5.0
// Krenarin erikoismalli (tuottoseuranta_ohje):
//
//   "RJ-Mob-liittymätulo lasketaan kaavalla liittymä euroa kertaa 0,65 kertaa 5.
//    Krenarille on erikois malli. Krenar saa liittymä euroa kertaa 0,65 kertaa 4."
//
// RJ-Mobin puolella vaihtuu siis vain kerroin 5 → 4; läpimeno 0,65 on mukana
// kuten tavallisillakin myyjillä. Krenarin oma provisio on liittymäprovisio
// kertaa 4 ilman läpimenoa, ja hänen työkulussaan ei ole sivukulukerrointa
// eikä tuntipalkkaa — ne ovat saman ohjeen työkulu-osiossa.
export const KRENAR_SELLER_MULT = 4.0
export const KRENAR_RJMOB_MULT = 4.0
export const SIVU_KERROIN = 1.35
export const FSEC_RECURRING = 1.5
export const PAYOUT_DELAY_MONTHS = 3

// F-Secure kertaprovisiot. Myyjän ja RJ-Mobin luvut ovat eri (ohjeet):
// myyntiseuranta_ohje antaa myyjälle internet 3,50 € ja total 7,00 €,
// tuottoseuranta_ohje RJ-Mobille internet 5 € ja total 10 €.
export const FSEC_TOTAL_SELLER = 7
export const FSEC_INTERNET_SELLER = 3.5
export const FSEC_TOTAL_RJMOB = 10
export const FSEC_INTERNET_RJMOB = 5

/**
 * F-Secure-leikkuri: alle kuuden F-Securen kuukaudesta myyjän provisioista
 * leikataan 30 %.
 *
 * Leikkaus osuu liittymä-, kassa- ja F-Secure-provisioon. **Bonuksiin se ei
 * osu** — ei F-Secure-portaisiin eikä DNA-uusmyyntibonukseen.
 *
 * Leikkuri pienentää sitä mitä myyjälle maksetaan, ei sitä mitä RJ-Mob
 * liittymistä ja kassasta saa: `rjmobTulo` lasketaan leikkaamattomista
 * luvuista ja vain `provisioYhteensa`, palkka ja teho pienenevät.
 *
 * Voimassa elokuusta 2026 alkaen. Sitä vanhemmat kuukaudet lasketaan ilman
 * leikkuria, jottei historia muutu takautuvasti — kuukausi tunnistetaan
 * myyntiseurantatiedoston nimestä samalla `vuosi × 100 + kuukausi`
 * -järjestyksellä jota käytetään muuallakin.
 */
export const FSEC_LEIKKURI_RAJA = 6
export const FSEC_LEIKKURI_OSUUS = 0.3
export const FSEC_LEIKKURI_ALKAA = 202608

/** Osuuko leikkuri: kuukausi voimassa ja F-Secureja alle rajan. */
export function fsecLeikkuriOsuu(fsecKpl: number, kuukausiOrder: number | null): boolean {
  if (kuukausiOrder === null || kuukausiOrder < FSEC_LEIKKURI_ALKAA) return false
  return fsecKpl < FSEC_LEIKKURI_RAJA
}

// F-Secure bonusportaat
export function fsecBonus(kpl: number): number {
  if (kpl >= 80) return 1000
  if (kpl >= 45) return 450
  if (kpl >= 25) return 250
  if (kpl >= 15) return 100
  return 0
}

// DNA Uusmyynti -bonusportaat. Myyjä ja RJ-Mob saavat saman verran.
export function dnaBonus(kpl: number): number {
  if (kpl >= 75) return 550
  if (kpl >= 55) return 350
  if (kpl >= 30) return 200
  return 0
}

export const TUNTIPALKAT: Record<string, number> = {
  'Basri Salihi': 15,
  'Salihi Basri': 15,
  'Vladimir Kogan': 10,
  'Kogan Vladimir': 10,
  'Antti Kiljala': 11,
  'Kiljala Antti': 11,
  'Ramin Kadiri': 10,
  'Kadiri Ramin': 10,
  'Daniel Miettinen': 10,
  'Miettinen Daniel': 10,
  // Ei enää töissä, mutta esiintyvät vanhemmissa (2025) myyntiseuranta-/maksukuittitiedostoissa
  // pelkkinä etuniminä — Petri/Markus/Vili käyttävät oletuspalkkaa (13 €/h), Kasper poikkeaa siitä.
  'Kasper': 10,
  default: 13,
}

export const REF_SELLERS: string[] = []
export const OWNER_SELLERS = ['Arbnor Rashica', 'Rashica Arbnor', 'Albin Rashica', 'Rashica Albin']
export const KRENAR_SELLERS = ['Krenar Bajqinovci', 'Bajqinovci Krenar']
export const STANDI_SELLERS = ['Jussi Kanerva', 'Kanerva Jussi', 'Esa Peltola', 'Peltola Esa']
export const SKIP_ROWS = ['yhteensä', 'total', 'yht.']

export const RJ_MOB_SELLERS = [
  'Hamza Hanif', 'Hanif Hamza',
  'Basri Salihi', 'Salihi Basri',
  'Arbnor Rashica', 'Rashica Arbnor',
  'Albin Rashica', 'Rashica Albin',
  'Alec Fambro', 'Fambro Alec',
  'Jami Tonteri', 'Tonteri Jami',
  'Joona Huttunen', 'Huttunen Joona',
  'Krenar Bajqinovci', 'Bajqinovci Krenar',
  'Atte Kröger', 'Kröger Atte',
  'Joni Viljamaa', 'Viljamaa Joni',
  'Kasperi Kemppainen', 'Kemppainen Kasperi',
  'Lauri Ukkonen', 'Ukkonen Lauri',
  'Leo Rossi', 'Rossi Leo',
  'Vladimir Kogan', 'Kogan Vladimir',
  'Steven Sainio', 'Sainio Steven',
  'Antti Kiljala', 'Kiljala Antti',
  'Ramin Kadiri', 'Kadiri Ramin',
  'Daniel Miettinen', 'Miettinen Daniel',
]

export function isRJMobSeller(nimi: string): boolean {
  return RJ_MOB_SELLERS.some(r => r.toLowerCase() === nimi.toLowerCase())
}
// Petri oli tiimissä marraskuusta maaliskuuhun (myyntiseuranta_ohje) — muina kuukausina
// hänen rivinsä ei kuulu laskelmiin vaikka nimi esiintyisikin tiedostossa. Nimi esiintyy
// tiedostosta riippuen joko pelkkänä "Petri" (maksukuitit) tai täydellisenä "Kaijanniemi
// Petri" / "Petri Kaijanniemi" (myyntiseuranta) — tarkistetaan onko "petri" jompikumpi
// välilyönnillä erotetuista nimiosista, ei vaadita täsmällistä koko nimen osumaa.
const PETRI_ACTIVE_MONTHS = [11, 12, 1, 2, 3]
export function isRJMobSellerForMonth(nimi: string, monthNum: number | null): boolean {
  if (isRJMobSeller(nimi)) return true
  const isPetri = nimi.trim().toLowerCase().split(/\s+/).includes('petri')
  if (monthNum !== null && isPetri && PETRI_ACTIVE_MONTHS.includes(monthNum)) return true
  return false
}
export function getTuntipalkka(nimi: string): number {
  return TUNTIPALKAT[nimi] ?? TUNTIPALKAT.default
}
export function isRefSeller(nimi: string): boolean {
  return REF_SELLERS.some(r => r.toLowerCase() === nimi.toLowerCase())
}
/**
 * Myyjät joiden tehoa ei ilmoiteta eikä lasketa keskiarvoon (Albinin pyyntö
 * 17.8.2026). Albin ei tee myyntivuoroja, joten hänen liittymäprovisionsa
 * jakautuisi lähes nollille tunneille ja näyttäisi mielivaltaista lukua.
 *
 * Arbnor ei ole listalla vaikka on samalla tavalla omistaja: hän tekee
 * myyntivuoroja (elokuussa 2026 48 h), joten hänen tehonsa on mielekäs.
 */
export const NO_TEHO_SELLERS = ['Albin Rashica', 'Rashica Albin']
export function tehoaEiArvioida(nimi: string): boolean {
  return NO_TEHO_SELLERS.some(r => r.toLowerCase() === nimi.toLowerCase())
}

export function isOwner(nimi: string): boolean {
  return OWNER_SELLERS.some(r => r.toLowerCase() === nimi.toLowerCase())
}
export function isKrenar(nimi: string): boolean {
  return KRENAR_SELLERS.some(r => r.toLowerCase() === nimi.toLowerCase())
}
export function isStandi(nimi: string): boolean {
  return STANDI_SELLERS.some(r => r.toLowerCase() === nimi.toLowerCase())
}
export function shouldSkip(nimi: string): boolean {
  return SKIP_ROWS.some(s => nimi.toLowerCase().includes(s))
}

export interface SellerRaw {
  nimi: string
  liittKpl: number
  liittEur: number
  fsecKpl: number
  fsecTotalKpl: number
  fsecInternetKpl: number
  fsecEur: number
  kassa: number
  tunnit: number       // normaali työ (myyntiseuranta)
  palkkaTunnit: number // kokonaistunnit (tuottoseuranta)
  dnaUusmyyntiKpl: number
}

export interface SellerResult {
  nimi: string
  tyyppi: 'normal' | 'owner' | 'krenar' | 'ref' | 'standi'
  liittKpl: number
  liittEur: number
  fsecKpl: number
  fsecTotalKpl: number
  fsecInternetKpl: number
  fsecEur: number
  fsecBonus: number
  kassa: number
  tunnit: number       // normaali työ
  palkkaTunnit: number // kokonaistunnit
  dnaUusmyyntiKpl: number
  dnaBonus: number
  rjmobLiitt: number
  rjmobKassa: number
  rjmobFsec: number
  rjmobTulo: number
  myyjaProv: number
  // Leikkurin jälkeen: myyjaProv + kassa + fsecEur (leikattuina) + fsecBonus + dnaBonus
  provisioYhteensa: number
  palkkaBrutto: number
  tyokulu: number
  netto: number
  roi: number | null
  // --- Tuottoseurannan asteikko: Krenarilla liittymäprovisio x4 ---
  /** Liittymäteho: myyjän liittymäprovisio / tunnit. */
  tehoLiitt: number
  teho: number         // laskettu normaali tunnit (myyntiseuranta), leikkurin jälkeen
  /** Total teho: liittymä + kassakate + F-Secure -provisio / tunnit. Ilman bonuksia. */
  tehoTotal: number

  // --- Myyntiseurannan asteikko: liittymäprovisio x1 kaikilla, Krenar mukaan lukien ---
  /** Liittymäteho myyntiseurannan asteikolla. */
  myyntiTehoLiitt: number
  /** Liittymä + kassakate / tunnit myyntiseurannan asteikolla. */
  myyntiTeho: number
  /** Liittymä + kassakate + F-Secure / tunnit myyntiseurannan asteikolla. */
  myyntiTehoTotal: number

  tehoStatus: 'green' | 'amber' | 'red' | 'special'
  fsecFV: number
  /** F-Secure-leikkuri osui: alle rajan jääneistä provisioista leikattiin 30 %. */
  fsecLeikkuri: boolean
  /** Montako euroa leikkuri vei myyjän provisioista. */
  fsecLeikkuriEur: number
  /** Työkulu ylittää RJ-Mobin tuoton — eri asia kuin fsecLeikkuri. */
  tappiollinen: boolean
}

/**
 * `kuukausiOrder` on vuosi × 100 + kuukausi myyntiseurantatiedoston nimestä.
 * Sitä tarvitaan vain F-Secure-leikkurin voimaantulon ratkaisemiseen; ilman
 * sitä laskenta menee kuten ennen leikkuria.
 */
export function laskeMyyja(raw: SellerRaw, kuukausiOrder: number | null = null): SellerResult {
  const { nimi, liittEur, liittKpl, fsecKpl, fsecTotalKpl, fsecInternetKpl, fsecEur, kassa, tunnit, palkkaTunnit, dnaUusmyyntiKpl } = raw

  const tyyppi = isOwner(nimi) ? 'owner'
    : isKrenar(nimi) ? 'krenar'
    : isRefSeller(nimi) ? 'ref'
    : isStandi(nimi) ? 'standi'
    : 'normal'

  const bonus = fsecBonus(fsecKpl)
  const dnaBonusEur = dnaBonus(dnaUusmyyntiKpl)

  // RJ-Mobin F-Secure-tulo on kaksiosainen (tuottoseuranta_ohje): kertaprovisio
  // omilla luvuillaan (internet 5 €, total 10 €) ja passiivitulo 1,50 € per
  // asiakkuus. Passiivitulossa ei ole ×12: se oli koodissa vuosiarvona, mutta
  // ohje laskee kuukauden tuloon vain kertakorvauksen. Vuosiarvo on edelleen
  // omana lukunaan `fsecFV`, jota tuottoseuranta näyttää erikseen.
  //
  // Bonus on mukana molemmissa päissä tarkoituksella: RJ-Mob saa sen
  // mobiilipisteeltä ja maksaa sen kokonaan myyjälle, joten se kasvattaa sekä
  // tuloa että työkulua eikä vaikuta nettoon.
  //
  // Kun total/internet-jakoa ei ole (vanha formaatti lukee vain valmiin
  // provision), kertaprovisio johdetaan myyjän provisiosta: RJ-Mobin ja myyjän
  // suhde on sama molemmissa tuotteissa (10/7 = 5/3,5), joten skaalaus on tarkka.
  const fsecKplTiedossa = fsecTotalKpl + fsecInternetKpl > 0
  const rjmobFsecKerta = fsecKplTiedossa
    ? (fsecTotalKpl * FSEC_TOTAL_RJMOB) + (fsecInternetKpl * FSEC_INTERNET_RJMOB)
    : fsecEur * (FSEC_TOTAL_RJMOB / FSEC_TOTAL_SELLER)
  const rjmobFsec = rjmobFsecKerta + bonus + (fsecKpl * FSEC_RECURRING)

  if (tyyppi === 'ref' || tyyppi === 'standi') {
    return {
      nimi, tyyppi, liittKpl, liittEur, fsecKpl, fsecTotalKpl, fsecInternetKpl,
      fsecEur, fsecBonus: bonus, kassa, tunnit, palkkaTunnit, dnaUusmyyntiKpl, dnaBonus: 0,
      rjmobLiitt: 0, rjmobKassa: 0, rjmobFsec: 0, rjmobTulo: 0,
      myyjaProv: 0, provisioYhteensa: 0, palkkaBrutto: 0, tyokulu: 0, netto: 0, roi: null,
      tehoLiitt: 0, teho: 0, tehoTotal: 0,
      myyntiTehoLiitt: 0, myyntiTeho: 0, myyntiTehoTotal: 0,
      tehoStatus: 'special', fsecFV: fsecKpl * FSEC_RECURRING * 12,
      fsecLeikkuri: false, fsecLeikkuriEur: 0, tappiollinen: false,
    }
  }

  let rjmobLiitt: number
  let myyjaProv: number

  if (tyyppi === 'krenar') {
    // Läpimeno koskee Krenariakin — vain kerroin on 4 eikä 5.
    rjmobLiitt = liittEur * LAPIMENO * KRENAR_RJMOB_MULT
    myyjaProv = liittEur * KRENAR_SELLER_MULT
  } else {
    rjmobLiitt = liittEur * LAPIMENO * NORMAL_MULT
    // Myyjän oma provisio (työkulun ja tehon pohja) on liittymä€ SELLAISENAAN, ei
    // LAPIMENO-kertoimella diskontattuna — LAPIMENO koskee vain RJ-Mobin omaa tuloa
    // (rjmobLiitt yllä). Todennettu tuotantodatasta: myyntiseurannan oma "Provikka"-
    // sarake (= Kassaprovisio + Liittymäprovisio) täsmää tähän raakaan liittymä€-arvoon,
    // ei LAPIMENOlla kerrottuna versioon.
    myyjaProv = liittEur
  }

  // RJ-Mobin oma tulo lasketaan aina leikkaamattomista luvuista: leikkuri
  // pienentää myyjälle maksettavaa provisiota, ei sitä mitä liittymä tai
  // kassatapahtuma tuo taloon.
  const rjmobKassa = kassa * 5.0
  const rjmobTulo = rjmobLiitt + rjmobKassa + rjmobFsec + dnaBonusEur

  // F-Secure-leikkuri: liittymä-, kassa- ja F-Secure-provisiosta 30 % pois,
  // bonuksiin ei kosketa.
  //
  // Omistajat jäävät ulkopuolelle: heille ei makseta provisiota vaan he saavat
  // RJ-Mobin tuoton sellaisenaan (palkkaBrutto ja tyokulu ovat nolla), joten
  // leikkurilla ei ole mitään mistä leikata. Ilman rajausta he näkyisivät
  // leikattujen listalla ja vääristäisivät sekä lukumäärää että summaa.
  const fsecLeikkuri = tyyppi !== 'owner' && fsecLeikkuriOsuu(fsecKpl, kuukausiOrder)
  const jaljelle = fsecLeikkuri ? 1 - FSEC_LEIKKURI_OSUUS : 1
  const myyjaProvNetto = myyjaProv * jaljelle
  const kassaNetto = kassa * jaljelle
  const fsecEurNetto = fsecEur * jaljelle
  const fsecLeikkuriEur = (myyjaProv + kassa + fsecEur) - (myyjaProvNetto + kassaNetto + fsecEurNetto)

  // Teho lasketaan normaali tunnit (myyntiseuranta) ja leikkurin JÄLKEEN: se
  // kertoo mitä myyjä oikeasti ansaitsee tunnissa. Huomaa ettei teho siksi
  // enää vastaa kaavaa (myyjaProv + kassa) / tunnit näillä kentillä — ne ovat
  // leikkaamattomat, koska ne ovat taulukon omia lukuja.
  const teho = tunnit > 0 ? (myyjaProvNetto + kassaNetto) / tunnit : 0

  // Myyntiseuranta näyttää kolme teholukua (myyntiseuranta_ohje): liittymä,
  // liittymä + kassakate ja total. Keskimmäinen on jo `teho`, joten kaikki
  // kolme lasketaan täällä samasta pohjasta — muuten sivu laskisi ne itse
  // raa'asta `liittEur`-sarakkeesta, jolloin Krenarin nelinkertainen provisio
  // ja F-Secure-leikkuri jäisivät pois ja sama teho näyttäisi Myyntiseurannassa
  // eri lukua kuin tuottoseurannassa.
  //
  // Total tehossa ovat mukana vain provisiot, ei F-Secure- eikä
  // DNA-uusmyyntibonusta: ohje sanoo "liittymä + kassakate + f-secure
  // provisio", ja bonukset ovat portaittaisia kertasuorituksia joita ei
  // ansaita tunnissa.
  const tehoLiitt = tunnit > 0 ? myyjaProvNetto / tunnit : 0
  const tehoTotal = tunnit > 0 ? (myyjaProvNetto + kassaNetto + fsecEurNetto) / tunnit : 0

  // Myyntiseurannan teholuvut lasketaan liittymäprovisiolla **sellaisenaan
  // (x1)**, myös Krenarilla — yllä olevat tuottoseurannan luvut käyttävät
  // Krenarin omaa nelinkertaista provisiota (KRENAR_SELLER_MULT).
  //
  // Ero on tarkoituksellinen eikä bugi. Myyntiseuranta vertaa myyjien
  // myyntisuoritusta keskenään, ja siellä Krenarin sopimuskerroin tekisi
  // hänestä nelinkertaisen ilman että hän on myynyt euroakaan enempää:
  // elokuussa 2026 hänen liittymätehonsa on 36,80 €/h tuottoseurannan
  // asteikolla mutta 9,20 €/h myyntiseurannan asteikolla. Tuottoseuranta taas
  // mittaa mitä myyjälle todella maksetaan, ja siellä kerroin kuuluu mukaan.
  //
  // Muille kuin Krenarille sarjat ovat numeerisesti identtiset, koska
  // myyjaProv = liittEur. **Muuta molemmat päät tai kumpaakaan.**
  const myyntiProvNetto = liittEur * jaljelle
  const myyntiTehoLiitt = tunnit > 0 ? myyntiProvNetto / tunnit : 0
  const myyntiTeho = tunnit > 0 ? (myyntiProvNetto + kassaNetto) / tunnit : 0
  const myyntiTehoTotal = tunnit > 0 ? (myyntiProvNetto + kassaNetto + fsecEurNetto) / tunnit : 0

  const fsecFV = fsecKpl * FSEC_RECURRING * 12

  // Myyjän provisiot yhteensä (pohjapalkan päälle tuleva osuus, myös työkulun provisiopohja).
  const provisioYhteensa = myyjaProvNetto + kassaNetto + fsecEurNetto + bonus + dnaBonusEur

  let palkkaBrutto = 0
  let tyokulu = 0
  let netto = 0
  let roi: number | null = null
  let tappiollinen = false

  if (tyyppi === 'owner') {
    palkkaBrutto = 0
    tyokulu = 0
    netto = rjmobTulo
    roi = null
  } else if (tyyppi === 'krenar') {
    palkkaBrutto = provisioYhteensa
    tyokulu = palkkaBrutto
    netto = rjmobTulo - tyokulu
    roi = tyokulu > 0 ? (netto / tyokulu) * 100 : 0
  } else {
    const tp = getTuntipalkka(nimi)
    // Palkka lasketaan kokonaistunneista
    const pohja = palkkaTunnit * tp
    palkkaBrutto = pohja + provisioYhteensa
    tyokulu = palkkaBrutto * SIVU_KERROIN
    netto = rjmobTulo - tyokulu
    roi = tyokulu > 0 ? (netto / tyokulu) * 100 : 0

    // Tappiollinen: työkulu ylittää RJ-Mobin tuoton. Eri asia kuin
    // F-Secure-leikkuri, jolla on oma kenttänsä.
    if (tyokulu > rjmobTulo) tappiollinen = true
  }

  // Krenarin teho lasketaan ja arvioidaan kuten muillakin. Se mittaa myyjän
  // omaa ansiota tunnille, ja Krenarin nelinkertainen provisio on hänen
  // todellinen ansionsa — ei siis erikoistapaus. Omistajilla arviota ei tehdä,
  // koska heillä ei ole provisiopohjaista palkkaa lainkaan.
  const tehoStatus = tyyppi === 'owner' ? 'special'
    : teho >= 9 ? 'green'
    : teho >= 7 ? 'amber'
    : 'red'

  return {
    nimi, tyyppi, liittKpl, liittEur, fsecKpl, fsecTotalKpl, fsecInternetKpl,
    fsecEur, fsecBonus: bonus, kassa, tunnit, palkkaTunnit, dnaUusmyyntiKpl, dnaBonus: dnaBonusEur,
    rjmobLiitt, rjmobKassa, rjmobFsec, rjmobTulo,
    myyjaProv, provisioYhteensa, palkkaBrutto, tyokulu, netto, roi,
    tehoLiitt, teho, tehoTotal,
    myyntiTehoLiitt, myyntiTeho, myyntiTehoTotal,
    tehoStatus, fsecFV, fsecLeikkuri, fsecLeikkuriEur, tappiollinen,
  }
}

export function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('fi-FI', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
