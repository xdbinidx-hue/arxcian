// RJ-Mob laskentasäännöt
export const LAPIMENO = 0.65
export const NORMAL_MULT = 5.0
export const KRENAR_SELLER_MULT = 4.0
export const KRENAR_RJMOB_MULT = 1.0
export const SIVU_KERROIN = 1.35
export const FSEC_RECURRING = 1.5
export const PAYOUT_DELAY_MONTHS = 3

// F-Secure provisiot
export const FSEC_TOTAL_SELLER = 7
export const FSEC_INTERNET_SELLER = 3.5
export const FSEC_TOTAL_RJMOB = 10
export const FSEC_INTERNET_RJMOB = 5

// F-Secure bonusportaat
export function fsecBonus(kpl: number): number {
  if (kpl >= 80) return 1000
  if (kpl >= 45) return 450
  if (kpl >= 25) return 250
  if (kpl >= 15) return 100
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
  rjmobLiitt: number
  rjmobKassa: number
  rjmobFsec: number
  rjmobTulo: number
  myyjaProv: number
  palkkaBrutto: number
  tyokulu: number
  netto: number
  roi: number | null
  teho: number         // laskettu normaali tunnit (myyntiseuranta)
  tehoStatus: 'green' | 'amber' | 'red' | 'special'
  fsecFV: number
  leikkuri: boolean
}

export function laskeMyyja(raw: SellerRaw): SellerResult {
  const { nimi, liittEur, liittKpl, fsecKpl, fsecTotalKpl, fsecInternetKpl, fsecEur, kassa, tunnit, palkkaTunnit } = raw

  const tyyppi = isOwner(nimi) ? 'owner'
    : isKrenar(nimi) ? 'krenar'
    : isRefSeller(nimi) ? 'ref'
    : isStandi(nimi) ? 'standi'
    : 'normal'

  const bonus = fsecBonus(fsecKpl)
  const rjmobFsec = (fsecTotalKpl * FSEC_TOTAL_RJMOB) + (fsecInternetKpl * FSEC_INTERNET_RJMOB) + bonus

  if (tyyppi === 'ref' || tyyppi === 'standi') {
    return {
      nimi, tyyppi, liittKpl, liittEur, fsecKpl, fsecTotalKpl, fsecInternetKpl,
      fsecEur, fsecBonus: bonus, kassa, tunnit, palkkaTunnit,
      rjmobLiitt: 0, rjmobKassa: 0, rjmobFsec: 0, rjmobTulo: 0,
      myyjaProv: 0, palkkaBrutto: 0, tyokulu: 0, netto: 0, roi: null,
      teho: 0, tehoStatus: 'special', fsecFV: fsecKpl * FSEC_RECURRING * 12, leikkuri: false,
    }
  }

  let rjmobLiitt: number
  let myyjaProv: number

  if (tyyppi === 'krenar') {
    rjmobLiitt = liittEur * NORMAL_MULT
    myyjaProv = liittEur * KRENAR_SELLER_MULT
  } else {
    rjmobLiitt = liittEur * LAPIMENO * NORMAL_MULT
    myyjaProv = liittEur * LAPIMENO
  }

  const rjmobKassa = kassa * 5.0
  const rjmobTulo = rjmobLiitt + rjmobKassa + rjmobFsec

  // Teho lasketaan normaali tunnit (myyntiseuranta)
  const teho = tunnit > 0 ? (myyjaProv + kassa) / tunnit : 0
  const fsecFV = fsecKpl * FSEC_RECURRING * 12

  let palkkaBrutto = 0
  let tyokulu = 0
  let netto = 0
  let roi: number | null = null
  let leikkuri = false

  if (tyyppi === 'owner') {
    palkkaBrutto = 0
    tyokulu = 0
    netto = rjmobTulo
    roi = null
  } else if (tyyppi === 'krenar') {
    palkkaBrutto = myyjaProv + kassa + fsecEur + bonus
    tyokulu = palkkaBrutto
    netto = rjmobTulo - tyokulu
    roi = tyokulu > 0 ? (netto / tyokulu) * 100 : 0
  } else {
    const tp = getTuntipalkka(nimi)
    // Palkka lasketaan kokonaistunneista
    const pohja = palkkaTunnit * tp
    const prov = myyjaProv + kassa + fsecEur + bonus
    palkkaBrutto = pohja + prov
    tyokulu = palkkaBrutto * SIVU_KERROIN
    netto = rjmobTulo - tyokulu
    roi = tyokulu > 0 ? (netto / tyokulu) * 100 : 0

    // Leikkuri: jos tyokulu > rjmobTulo
    if (tyokulu > rjmobTulo) leikkuri = true
  }

  const tehoStatus = tyyppi === 'owner' || tyyppi === 'krenar' ? 'special'
    : teho >= 9 ? 'green'
    : teho >= 7 ? 'amber'
    : 'red'

  return {
    nimi, tyyppi, liittKpl, liittEur, fsecKpl, fsecTotalKpl, fsecInternetKpl,
    fsecEur, fsecBonus: bonus, kassa, tunnit, palkkaTunnit,
    rjmobLiitt, rjmobKassa, rjmobFsec, rjmobTulo,
    myyjaProv, palkkaBrutto, tyokulu, netto, roi,
    teho, tehoStatus, fsecFV, leikkuri,
  }
}

export function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('fi-FI', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
