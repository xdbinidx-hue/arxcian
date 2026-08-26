// Myymäläpäällikköbonuksen kuukausitavoitteet.
//
// ".ts"-pääte importeissa on tahallinen: moduuli on yksikkötestattu ja Noden
// ESM-resolveri ei osaa extensiotonta muotoa.
import type { Myymala, MyymalaTavoite } from './rjmobBonus.ts'
import { MYYMALAT } from './rjmobBonus.ts'

/**
 * Lukitut tavoitteet kuukausittain, avaimena `vuosi × 100 + kuukausi`.
 *
 * **Tavoitteet ovat toistaiseksi koodissa, eivät Drivessä.** Lähde on Albinin
 * tavoitetaulukko (`Arxcian / rjmob / Tavoitteet (kopio)`), mutta sitä ei ollut
 * vielä olemassa luettavassa muodossa kun tämä kirjoitettiin — syyskuun 2026
 * luvut saatiin kuvakaappauksena 26.8.2026. Koodivakio on siihen asti se
 * lukittu tilanne johon bonus sidotaan.
 *
 * Kun Drive-lukija rakennetaan, se **ei saa ylikirjoittaa jo alkanutta
 * kuukautta**: bonus on sidottu prosenttiin eikä euroon, joten hiljainen
 * tavoitteen lasku kesken kuun olisi sama kuin bonuksen jakaminen ilmaiseksi.
 * Ks. `onLukittu` ja `TAVOITE_MUUTOKSET`.
 *
 * Kassakateluvut ovat **ALV 0**, samaa suuretta kuin myyntiseurannan
 * myymälätaulukon iso kassakateluku.
 */
export const LUKITUT_TAVOITTEET: Record<number, Record<Myymala, MyymalaTavoite>> = {
  // Syyskuu 2026 — Albinin tavoitetaulukko, kuvakaappaus 26.8.2026.
  // Yhteensä 1 800 kpl liittymiä, 253 kpl F-Securea, 15 500 € kassakatetta.
  202609: {
    Holma: { liittymat: 300, fsecure: 53, kassakate: 3000 },
    Syke: { liittymat: 230, fsecure: 40, kassakate: 2200 },
    // Malmin 900:sta 600 tulee syyskuun tapahtumasta. Malmista ei makseta
    // bonusta (Arbnor, omistaja), joten tapahtuman epäonnistuminen ei vaikuta
    // kenenkään palkkaan — tapahtumaerittely on täällä analyysia varten.
    Malmi: { liittymat: 900, fsecure: 80, kassakate: 4000, tapahtumaLiittymat: 600 },
    Easton: { liittymat: 190, fsecure: 40, kassakate: 3300 },
    Kivistö: { liittymat: 180, fsecure: 40, kassakate: 3000 },
  },
}

/**
 * Tavoitteen muutos lukituksen jälkeen. Lista on tarkoituksella näkyvissä
 * käyttöliittymässä asti: muutos ilman jälkeä olisi bonuksen jakamista
 * ilmaiseksi, ja se on juuri se mitä lukitus estää.
 */
export type TavoiteMuutos = {
  kuukausiOrder: number
  myymala: Myymala
  mittari: keyof Omit<MyymalaTavoite, 'tapahtumaLiittymat'>
  vanha: number | null
  uusi: number | null
  /** ISO-päivämäärä. */
  milloin: string
  kuka: string
  syy: string
}

export const TAVOITE_MUUTOKSET: readonly TavoiteMuutos[] = []

export function muutoksetKuukaudelle(kuukausiOrder: number): TavoiteMuutos[] {
  return TAVOITE_MUUTOKSET.filter(m => m.kuukausiOrder === kuukausiOrder)
}

/**
 * Onko kuukauden tavoite lukittu. Lukitus tapahtuu kuun 1. päivänä eli heti
 * kun kuukausi on alkanut — kulunut ja kuluva kuukausi ovat lukossa, tuleva
 * ei.
 */
export function onLukittu(kuukausiOrder: number, nyt = new Date()): boolean {
  const nykyinen = nyt.getFullYear() * 100 + (nyt.getMonth() + 1)
  return kuukausiOrder <= nykyinen
}

export function tavoitteetKuukaudelle(kuukausiOrder: number): Record<Myymala, MyymalaTavoite> | null {
  return LUKITUT_TAVOITTEET[kuukausiOrder] ?? null
}

/**
 * Kuukaudet joille tavoitteet on asetettu, uusin ensin.
 */
export function tavoitekuukaudet(): number[] {
  return Object.keys(LUKITUT_TAVOITTEET).map(Number).sort((a, b) => b - a)
}

/**
 * Tavoite ilman tapahtumaa. Vertailuluku sitä varten, ettei tapahtumakuukautta
 * verrata arkikuukauteen suoraan — **ei bonuslaskennan syöte**, bonus
 * lasketaan aina koko lukitusta tavoitetta vasten.
 */
export function tavoiteIlmanTapahtumaa(t: MyymalaTavoite): number | null {
  if (t.liittymat === null) return null
  return t.liittymat - (t.tapahtumaLiittymat ?? 0)
}

/** Kuukauden tavoitesummat riville "Yhteensä". */
export function tavoiteYhteensa(tavoitteet: Record<Myymala, MyymalaTavoite>) {
  let liittymat = 0, fsecure = 0, kassakate = 0
  for (const { myymala } of MYYMALAT) {
    const t = tavoitteet[myymala]
    if (!t) continue
    liittymat += t.liittymat ?? 0
    fsecure += t.fsecure ?? 0
    kassakate += t.kassakate ?? 0
  }
  return { liittymat, fsecure, kassakate }
}
