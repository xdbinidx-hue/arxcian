// RJ-Mob laskentasäännöt
export const LAPIMENO = 0.65
export const NORMAL_MULT = 5.0
// Krenarin sopimus: liittymäprovisiosta hän saa nelinkertaisen, ja RJ-Mob saa
// siitä neljäsosan. Kun liittymäprovisio on 100 €, Krenar saa 400 € ja RJ-Mob
// 100 €. Tavallisella myyjällä sama 100 € tuottaa myyjälle 100 € ja RJ-Mobille
// viisinkertaisen (NORMAL_MULT) — Krenar on siis RJ-Mobille selvästi kalliimpi.
//
// Ohjeen "jaettuna neljällä" tarkoittaa neljäsosaa **Krenarin provisiosta**,
// ei neljäsosaa liittymä€:sta. Aiemmin se oli luettu jälkimmäisellä tavalla,
// jolloin RJ-Mobin tulo Krenarin liittymistä laskettiin nelinkertaisesti liian
// pieneksi (100 € myynnistä 25 € eikä 100 €).
export const KRENAR_SELLER_MULT = 4.0
export const KRENAR_RJMOB_MULT = KRENAR_SELLER_MULT / 4
export const SIVU_KERROIN = 1.35
export const FSEC_RECURRING = 1.5
export const PAYOUT_DELAY_MONTHS = 3

// F-Secure provisiot (myyjä). RJ-Mob saa saman verran provisiota+bonusta kuin myyjä,
// ja lisäksi passiivitulon (ks. laskeMyyja: rjmobFsec).
export const FSEC_TOTAL_SELLER = 7
export const FSEC_INTERNET_SELLER = 3.5

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
  teho: number         // laskettu normaali tunnit (myyntiseuranta), leikkurin jälkeen
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
  // RJ-Mob saa F-Securesta saman verran provisiota+bonusta kuin myyjä, ja lisäksi
  // passiivitulon (kk-tulo × 12 kk) tämän kuukauden uusista asiakkuuksista.
  const rjmobFsec = fsecEur + bonus + (fsecKpl * FSEC_RECURRING * 12)

  if (tyyppi === 'ref' || tyyppi === 'standi') {
    return {
      nimi, tyyppi, liittKpl, liittEur, fsecKpl, fsecTotalKpl, fsecInternetKpl,
      fsecEur, fsecBonus: bonus, kassa, tunnit, palkkaTunnit, dnaUusmyyntiKpl, dnaBonus: 0,
      rjmobLiitt: 0, rjmobKassa: 0, rjmobFsec: 0, rjmobTulo: 0,
      myyjaProv: 0, provisioYhteensa: 0, palkkaBrutto: 0, tyokulu: 0, netto: 0, roi: null,
      teho: 0, tehoStatus: 'special', fsecFV: fsecKpl * FSEC_RECURRING * 12,
      fsecLeikkuri: false, fsecLeikkuriEur: 0, tappiollinen: false,
    }
  }

  let rjmobLiitt: number
  let myyjaProv: number

  if (tyyppi === 'krenar') {
    rjmobLiitt = liittEur * KRENAR_RJMOB_MULT
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
    teho, tehoStatus, fsecFV, fsecLeikkuri, fsecLeikkuriEur, tappiollinen,
  }
}

export function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('fi-FI', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
