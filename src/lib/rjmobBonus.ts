/**
 * Myymäläpäällikköbonus 1.9.2026 alkaen.
 *
 * Korvaa vanhan päällikkömallin (vastuulisä, brutto-€/h-perusteinen
 * liittymäbonus, lekurit) **kokonaan**. Elokuu 2026 ja sitä vanhemmat
 * kuukaudet lasketaan yhä vanhoilla säännöillä — `bonusmalliVoimassa`
 * on se portti, ja sen ohittaminen laskisi historian uusiksi.
 *
 * Moduuli on tarkoituksella puhdas: ei Drive-yhteyttä, ei välimuistia, ei
 * istuntoa. Tavoitteet tulevat parametrina ([rjmobBonusTavoitteet.ts]),
 * toteumat myyntiseurannan myymälätaulukosta ([rjmobSheets.ts]).
 */

// ".ts"-pääte on tahallinen: tämä moduuli on yksikkötestattu ja Noden
// ESM-resolveri ei osaa extensiotonta eikä "@/"-alkuista muotoa.
import { SIVU_KERROIN } from './rjmob.ts'

/** Kuukausi `vuosi × 100 + kuukausi` -järjestyksenä, sama sääntö kuin muualla. */
export const BONUSMALLI_ALKAA = 202609

export function bonusmalliVoimassa(kuukausiOrder: number | null): boolean {
  return kuukausiOrder !== null && kuukausiOrder >= BONUSMALLI_ALKAA
}

export type Myymala = 'Malmi' | 'Holma' | 'Syke' | 'Easton' | 'Kivistö'
export type BonusTaso = 1 | 2 | 3
export type Mittari = 'liittymat' | 'fsecure' | 'kassakate'

export const MITTARIT: readonly Mittari[] = ['liittymat', 'fsecure', 'kassakate']

export const MITTARI_NIMI: Record<Mittari, string> = {
  liittymat: 'Liittymät',
  fsecure: 'F-Secure',
  kassakate: 'Kassakate',
}

export const MITTARI_YKSIKKO: Record<Mittari, 'kpl' | '€'> = {
  liittymat: 'kpl',
  fsecure: 'kpl',
  kassakate: '€',
}

/**
 * Portaat, ei liukumaa: alle 100 % ei maksa mitään, 100,0–119,9 % maksaa
 * pienen summan ja 120,0 % tai yli ison. **Yli 120 % ei maksa enempää** —
 * iso summa on katto, ei väliporras.
 */
export const PORRAS_SATA = 100
export const PORRAS_SATAKAKSI = 120

/** Kolmen mittarin summat tasoittain. Rivin maksimi on iso summa × 3. */
export const TASO_SUMMAT: Record<BonusTaso, Record<Mittari, { sata: number; satakaksi: number }>> = {
  1: {
    liittymat: { sata: 300, satakaksi: 400 },
    fsecure: { sata: 300, satakaksi: 400 },
    kassakate: { sata: 150, satakaksi: 200 },
  },
  2: {
    liittymat: { sata: 200, satakaksi: 300 },
    fsecure: { sata: 200, satakaksi: 300 },
    kassakate: { sata: 100, satakaksi: 150 },
  },
  3: {
    liittymat: { sata: 125, satakaksi: 200 },
    fsecure: { sata: 125, satakaksi: 200 },
    kassakate: { sata: 50, satakaksi: 100 },
  },
}

/**
 * Päällikkö ja taso ovat myymälän ominaisuuksia, eivät ihmisen.
 *
 * Jos Alec siirtyisi Malmille, hän ei nousisi tasolle 1 — Alecin myymälä on
 * aina Easton. Siksi taso luetaan tästä taulukosta myymälän kautta eikä
 * päällikön nimestä.
 *
 * **Arbnorille ei makseta**, koska hän on RJ-Mobin omistaja ja bonus palaisi
 * hänelle itselleen. Malmin taso 1 on silti olemassa: prosentit ja
 * teoreettinen bonus lasketaan ja näytetään vertailua varten, mutta
 * maksettava summa ja kulukirjaus ovat 0 €.
 */
export type MyymalaTiedot = {
  myymala: Myymala
  taso: BonusTaso
  paallikko: string
  /** €/h. Arbnor 0 (omistaja). */
  tuntipalkka: number
  maksetaan: boolean
  /** Myyntiseurannan myymälätaulukon normalisoitu avain. */
  storeKey: string
}

export const MYYMALAT: readonly MyymalaTiedot[] = [
  { myymala: 'Malmi', taso: 1, paallikko: 'Arbnor Rashica', tuntipalkka: 0, maksetaan: false, storeKey: 'Helsinki, Malmi' },
  { myymala: 'Holma', taso: 1, paallikko: 'Joni Viljamaa', tuntipalkka: 14, maksetaan: true, storeKey: 'Lahti, Holma' },
  { myymala: 'Syke', taso: 2, paallikko: 'Leo Rossi', tuntipalkka: 14, maksetaan: true, storeKey: 'Lahti, Syke' },
  { myymala: 'Easton', taso: 3, paallikko: 'Alec Fambro', tuntipalkka: 14, maksetaan: true, storeKey: 'Helsinki, Easton' },
  { myymala: 'Kivistö', taso: 3, paallikko: 'Joona Huttunen', tuntipalkka: 14, maksetaan: true, storeKey: 'Vantaa, Kivistö' },
]

export function myymalanTiedot(myymala: Myymala): MyymalaTiedot {
  const t = MYYMALAT.find(m => m.myymala === myymala)
  if (!t) throw new Error(`Tuntematon myymälä: ${myymala}`)
  return t
}

/**
 * Myymälätaulukon avain (esim. "Helsinki, Malmi") tai vapaa kustannuspaikka
 * bonusmyymäläksi. Sama osajonovertailu kuin `readStores`in
 * `normalizeStoreName`illa, jotta kaupunkietuliite ja ä/a eivät erota
 * lukupäätä bonuslaskennasta.
 */
export function myymalaAvaimesta(raw: string): Myymala | null {
  const k = raw.toLowerCase()
  if (k.includes('malmi')) return 'Malmi'
  if (k.includes('holma')) return 'Holma'
  if (k.includes('syke')) return 'Syke'
  if (k.includes('easton')) return 'Easton'
  if (k.includes('kivistö') || k.includes('kivisto')) return 'Kivistö'
  return null
}

/** Yhden mittarin tavoite. `null` = tavoitetta ei ole asetettu. */
export type MittariTavoite = number | null

export type MyymalaTavoite = {
  liittymat: MittariTavoite
  fsecure: MittariTavoite
  kassakate: MittariTavoite
  /**
   * Kuinka monta liittymää tavoitteesta tulee erillisestä tapahtumasta.
   * **Analyysitieto, ei bonuslaskennan osa** — bonus lasketaan aina koko
   * lukitusta tavoitteesta. Tämä kertoo mistä iso luku oikeasti tulee, jotta
   * tapahtumakuukautta ei verrata arkikuukauteen suoraan.
   */
  tapahtumaLiittymat?: number
}

export type MyymalaToteuma = {
  liittymat: number
  fsecure: number
  /** Myymälätaulukon **iso** kassakateluku (`stores[].kassa`), ei kassaprovisio. */
  kassakate: number
}

export type Porras = 'ei' | 'sata' | 'satakaksi'

export type MittariTulos = {
  mittari: Mittari
  tavoite: MittariTavoite
  toteuma: number
  /** `null` kun tavoite puuttuu — prosenttia ei arvata. */
  pct: number | null
  porras: Porras | null
  bonus: number
}

export type MyymalaBonus = {
  myymala: Myymala
  taso: BonusTaso
  paallikko: string
  maksetaan: boolean
  mittarit: MittariTulos[]
  /** Kolmen mittarin summa siinäkin tapauksessa ettei sitä makseta. */
  teoreettinen: number
  /** Maksettava summa: 0 € kun `maksetaan` on epätosi. */
  maksettava: number
  /** Maksettava × sivukulukerroin — tämä on tuottoseurannan kulu. */
  kulu: number
  varoitukset: string[]
}

/**
 * Portaan valinta. Vertailu tehdään **raa'alla suhteella**, ei pyöristetyllä
 * prosentilla: 119,96 % näyttäisi pyöristettynä 120,0 %:lta mutta ei ole yli
 * portaan, ja portaan väärä puoli on tässä 75–100 euron ero.
 */
export function bonusPorras(toteuma: number, tavoite: MittariTavoite): Porras | null {
  if (tavoite === null || !(tavoite > 0)) return null
  const pct = (toteuma / tavoite) * 100
  if (pct >= PORRAS_SATAKAKSI) return 'satakaksi'
  if (pct >= PORRAS_SATA) return 'sata'
  return 'ei'
}

/**
 * Sivukulullinen kulu sentin tarkkuudella. Ilman pyöristystä 325 × 1,35 on
 * liukuluvuissa 438,75000000000006, ja se luku päätyisi tuottoseurannan
 * summiin ja testien odotuksiin sellaisenaan.
 */
export function sivukuluineen(euroa: number): number {
  return Math.round(euroa * SIVU_KERROIN * 100) / 100
}

export function porraSumma(taso: BonusTaso, mittari: Mittari, porras: Porras | null): number {
  if (porras === null || porras === 'ei') return 0
  const s = TASO_SUMMAT[taso][mittari]
  return porras === 'satakaksi' ? s.satakaksi : s.sata
}

/** Myymälän teoreettinen maksimi, kun kaikki kolme mittaria yltävät 120 %:iin. */
export function tasonMaksimi(taso: BonusTaso): number {
  return MITTARIT.reduce((s, m) => s + TASO_SUMMAT[taso][m].satakaksi, 0)
}

/**
 * Yhden myymälän bonus.
 *
 * Kolme mittaria maksavat **itsenäisesti**: myymälä voi saada
 * liittymäbonuksen vaikka F-Secure jäisi nollaan. Puuttuva tavoite antaa
 * kyseiselle mittarille 0 € ja varoituksen — edellisen kuun tavoitetta ei
 * käytetä eikä lukua arvata.
 *
 * **F-Secure-leikkuri (alle 6 kpl/kk → −30 %) ei kosketa tähän lainkaan.**
 * Se koskee vain myyjän ja päällikön omia provisioita.
 */
export function laskeMyymalanBonus(
  myymala: Myymala,
  tavoite: MyymalaTavoite | null,
  toteuma: MyymalaToteuma,
): MyymalaBonus {
  const tiedot = myymalanTiedot(myymala)
  const varoitukset: string[] = []

  const mittarit: MittariTulos[] = MITTARIT.map(mittari => {
    const t = tavoite ? tavoite[mittari] : null
    const arvo = toteuma[mittari]
    const porras = bonusPorras(arvo, t)
    if (porras === null) {
      varoitukset.push(`${MITTARI_NIMI[mittari]}: tavoite puuttuu — bonus 0 €`)
    }
    return {
      mittari,
      tavoite: t,
      toteuma: arvo,
      pct: t !== null && t > 0 ? (arvo / t) * 100 : null,
      porras,
      bonus: porraSumma(tiedot.taso, mittari, porras),
    }
  })

  const teoreettinen = mittarit.reduce((s, m) => s + m.bonus, 0)
  const maksettava = tiedot.maksetaan ? teoreettinen : 0

  return {
    myymala,
    taso: tiedot.taso,
    paallikko: tiedot.paallikko,
    maksetaan: tiedot.maksetaan,
    mittarit,
    teoreettinen,
    maksettava,
    kulu: sivukuluineen(maksettava),
    varoitukset,
  }
}

export type BonusKuukausi = {
  /** Kuukausi jolta bonus ansaitaan. */
  ansaintaOrder: number
  /** Kuukausi jolle kulu kirjataan — ansaintakuukausi + 1. */
  maksuOrder: number
  myymalat: MyymalaBonus[]
  /** Yhteensä maksettava, ilman sivukuluja. */
  maksettavaYhteensa: number
  /** Yhteensä kuluna tuottoseurantaan, sivukulut mukana. */
  kuluYhteensa: number
  /** Teoreettinen maksimi jos kaikki maksettavat myymälät osuisivat 120 %:iin. */
  maksimi: number
}

/**
 * Bonus kirjataan kuluksi **sille kuulle jolloin se maksetaan**, ei sille
 * jolta se ansaitaan: syyskuun bonus maksetaan lokakuun palkassa, joten se on
 * lokakuun kulu. Tämä vastaa pankkitiliä ja kirjanpitoa.
 *
 * Seuraus on tietoinen ja hyväksytty: hyvä myyntikuukausi näyttää
 * tuottoseurannassa vähän liian hyvältä ja sitä seuraava vähän liian
 * raskaalta. **Älä "korjaa" tätä ansaintakuukaudeksi.**
 */
export function maksukuukausi(ansaintaOrder: number): number {
  const vuosi = Math.floor(ansaintaOrder / 100)
  const kk = ansaintaOrder % 100
  return kk >= 12 ? (vuosi + 1) * 100 + 1 : vuosi * 100 + kk + 1
}

/** Käänteinen: mistä kuusta tälle kuulle kirjattu bonus on ansaittu. */
export function ansaintakuukausi(maksuOrder: number): number {
  const vuosi = Math.floor(maksuOrder / 100)
  const kk = maksuOrder % 100
  return kk <= 1 ? (vuosi - 1) * 100 + 12 : vuosi * 100 + kk - 1
}

export function laskeKuukaudenBonukset(
  ansaintaOrder: number,
  tavoitteet: Partial<Record<Myymala, MyymalaTavoite>> | null,
  toteumat: Partial<Record<Myymala, MyymalaToteuma>>,
): BonusKuukausi {
  const myymalat = MYYMALAT.map(m =>
    laskeMyymalanBonus(
      m.myymala,
      tavoitteet?.[m.myymala] ?? null,
      toteumat[m.myymala] ?? { liittymat: 0, fsecure: 0, kassakate: 0 },
    ),
  )

  const maksettavaYhteensa = myymalat.reduce((s, m) => s + m.maksettava, 0)

  return {
    ansaintaOrder,
    maksuOrder: maksukuukausi(ansaintaOrder),
    myymalat,
    maksettavaYhteensa,
    kuluYhteensa: sivukuluineen(maksettavaYhteensa),
    maksimi: MYYMALAT.filter(m => m.maksetaan).reduce((s, m) => s + tasonMaksimi(m.taso), 0),
  }
}

/**
 * Myymälätaulukon rivit bonuslaskennan toteumiksi.
 *
 * Kassakate luetaan `kassa`-kentästä (×10), **ei** `kassaRjmob`ista (×1) eikä
 * myyjien kassaprovisiosta: suureiden ero on noin kymmenkertainen, ja
 * väärästä laskettuna kassakatetavoitetta ei saavuttaisi ikinä kukaan.
 */
export function toteumatMyymalataulukosta(
  stores: Record<string, { liittKpl: number; fsecKpl: number; kassa: number }>,
): Partial<Record<Myymala, MyymalaToteuma>> {
  const out: Partial<Record<Myymala, MyymalaToteuma>> = {}
  for (const [key, s] of Object.entries(stores)) {
    const myymala = myymalaAvaimesta(key)
    if (!myymala) continue
    const prev = out[myymala] ?? { liittymat: 0, fsecure: 0, kassakate: 0 }
    out[myymala] = {
      liittymat: prev.liittymat + s.liittKpl,
      fsecure: prev.fsecure + s.fsecKpl,
      kassakate: prev.kassakate + s.kassa,
    }
  }
  return out
}
