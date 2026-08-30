// Myymäläpäällikköbonuksen kuukausitavoitteet.
//
// ".ts"-pääte importeissa on tahallinen: moduuli on yksikkötestattu ja Noden
// ESM-resolveri ei osaa extensiotonta muotoa.
import type { Mittari, Myymala, MyymalaTavoite } from './rjmobBonus.ts'
import { MYYMALAT, MITTARIT, MITTARI_NIMI, myymalaAvaimesta } from './rjmobBonus.ts'

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

// ---------------------------------------------------------------------------
// Tavoitetaulukon jäsennys ja lähteen valinta
// ---------------------------------------------------------------------------

/**
 * Yhden kuukauden tavoitetaulukko Drivestä (`Arxcian / RJ-Mob / Tavoitteet
 * (kopio)`), jäsennettynä soluista.
 *
 * Otsikkorivi etsitään sisällöstä eikä oleteta ensimmäiseksi riviksi, ja
 * sarakkeet osajonolla — samaan tapaan kuin myyntiseurannassa, koska taulukko
 * on ihmisen ylläpitämä ja rivien yläpuolella on tyypillisesti otsikko tai
 * tyhjiä rivejä.
 *
 * **Tyhjä tulos on virhe eikä tulos.** Jos taulukko on olemassa mutta siitä ei
 * tunnisteta yhtään myymälää, palautetaan varoitus eikä tyhjää tavoitelistaa:
 * muuten väärin nimetty sarake näyttäisi siltä että jokaisen myymälän tavoite
 * on 0 € eli bonus laukeaisi automaattisesti kaikilla.
 */
export type TavoiteTaulukko = {
  tavoitteet: Partial<Record<Myymala, MyymalaTavoite>>
  varoitukset: string[]
}

function osuu(otsikko: string, ...osat: string[]): boolean {
  const h = otsikko.toLowerCase()
  return osat.some(o => h.includes(o))
}

function luku(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const puhdas = String(raw).replace(/\s|\u00a0/g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
  if (puhdas === '') return null
  const n = Number(puhdas)
  return Number.isFinite(n) ? n : null
}

export function parseTavoiteTaulukko(rows: string[][]): TavoiteTaulukko {
  const varoitukset: string[] = []

  let otsikkoIdx = -1
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const onLiitt = r.some(c => osuu(c, 'liittym'))
    const onKassa = r.some(c => osuu(c, 'kassakate', 'kassa'))
    if (onLiitt && onKassa) { otsikkoIdx = i; break }
  }
  if (otsikkoIdx < 0) {
    return { tavoitteet: {}, varoitukset: ['Tavoitetaulukosta ei löytynyt otsikkoriviä (liittymät + kassakate)'] }
  }

  const otsikot = rows[otsikkoIdx]
  const idx = {
    liittymat: otsikot.findIndex(c => osuu(c, 'liittym')),
    fsecure: otsikot.findIndex(c => osuu(c, 'f-secure', 'fsecure', 'f secure')),
    kassakate: otsikot.findIndex(c => osuu(c, 'kassakate', 'kassa')),
    tapahtuma: otsikot.findIndex(c => osuu(c, 'tapahtuma')),
  }
  for (const m of MITTARIT) {
    if (idx[m] < 0) varoitukset.push(`Tavoitetaulukosta puuttuu sarake: ${MITTARI_NIMI[m]}`)
  }

  const tavoitteet: Partial<Record<Myymala, MyymalaTavoite>> = {}
  for (let i = otsikkoIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    // Myymälä voi olla missä tahansa sarakkeessa ennen lukuja — taulukossa on
    // usein tason tai järjestysnumeron sarake ensimmäisenä.
    let myymala: Myymala | null = null
    for (const solu of r) {
      const osuma = solu.trim() ? myymalaAvaimesta(solu) : null
      if (osuma) { myymala = osuma; break }
    }
    if (!myymala || tavoitteet[myymala]) continue

    const tapahtuma = idx.tapahtuma >= 0 ? luku(r[idx.tapahtuma]) : null
    tavoitteet[myymala] = {
      liittymat: idx.liittymat >= 0 ? luku(r[idx.liittymat]) : null,
      fsecure: idx.fsecure >= 0 ? luku(r[idx.fsecure]) : null,
      kassakate: idx.kassakate >= 0 ? luku(r[idx.kassakate]) : null,
      ...(tapahtuma !== null && tapahtuma > 0 ? { tapahtumaLiittymat: tapahtuma } : {}),
    }
  }

  if (Object.keys(tavoitteet).length === 0) {
    varoitukset.push('Tavoitetaulukosta ei tunnistettu yhtään myymälää — onko myymälöiden nimet omassa sarakkeessaan?')
  }
  for (const { myymala } of MYYMALAT) {
    if (!tavoitteet[myymala]) varoitukset.push(`${myymala}: tavoiterivi puuttuu tavoitetaulukosta`)
  }

  return { tavoitteet, varoitukset }
}

export type TavoiteLahde = 'koodi' | 'drive' | 'lukittu' | 'puuttuu'

export type ValitutTavoitteet = {
  tavoitteet: Record<Myymala, MyymalaTavoite> | Partial<Record<Myymala, MyymalaTavoite>> | null
  lahde: TavoiteLahde
  varoitukset: string[]
}

/**
 * Kumpi lähde voittaa: lukittu koodivakio vai Drive-taulukko.
 *
 * **Lukittua kuukautta ei muuteta Drivestä.** Bonus on sidottu prosenttiin
 * eikä euroon, joten hiljainen tavoitteen lasku kesken kuun olisi sama kuin
 * bonuksen jakaminen ilmaiseksi. Ero ei silti jää piiloon: se raportoidaan
 * varoituksena, jotta muutos näkyy (mitä, mistä mihin) sen sijaan että
 * katoaisi.
 *
 * Tuleva kuukausi saa muuttua vapaasti — sitä ei ole vielä lukittu.
 */
export function valitseTavoitteet(
  kuukausiOrder: number,
  drive: Partial<Record<Myymala, MyymalaTavoite>> | null,
  koodi: Record<Myymala, MyymalaTavoite> | null = tavoitteetKuukaudelle(kuukausiOrder),
  nyt = new Date(),
): ValitutTavoitteet {
  const lukittu = onLukittu(kuukausiOrder, nyt)
  const varoitukset: string[] = []

  if (!koodi && !drive) return { tavoitteet: null, lahde: 'puuttuu', varoitukset }

  // Lukittu kuukausi: koodikopio voittaa kokonaan, ja Driven eroavat arvot
  // luetellaan mutta ei oteta käyttöön.
  if (lukittu && koodi) {
    if (drive) {
      for (const { myymala } of MYYMALAT) {
        const k = koodi[myymala]
        const d = drive[myymala]
        if (!k || !d) continue
        for (const m of MITTARIT) {
          if (d[m] !== null && k[m] !== d[m]) {
            varoitukset.push(`${myymala} ${MITTARI_NIMI[m]}: lukittu ${k[m] ?? '—'}, Drivessä ${d[m]} — käytetään lukittua`)
          }
        }
      }
    }
    return { tavoitteet: koodi, lahde: 'koodi', varoitukset }
  }

  if (!drive) return { tavoitteet: koodi, lahde: 'koodi', varoitukset }

  if (lukittu) {
    varoitukset.push('Kuukausi on jo alkanut eikä tavoitteista ole lukittua kopiota — Drive-taulukon muutos muuttaisi bonusta kesken kuun')
    return { tavoitteet: drive, lahde: 'drive', varoitukset }
  }

  const yhdistetty = yhdistaTavoitteet(drive, koodi)
  return { tavoitteet: yhdistetty.tavoitteet, lahde: 'drive', varoitukset: [...varoitukset, ...yhdistetty.varoitukset] }
}

/**
 * Drive-taulukko koodikopion päälle, kenttä kerrallaan.
 *
 * **Puuttuva rivi tai kenttä ei pyyhi aiempaa tavoitetta.** Keskeneräinen
 * taulukko on tavallinen tila — Albin täyttää myymälät sitä mukaa kun luvut
 * valmistuvat — ja ilman tätä yksikin puuttuva rivi pudottaisi sen myymälän
 * bonuksen nollaan ilman että kukaan on päättänyt niin. Perintä kerrotaan aina
 * varoituksena, jottei vanha luku jää näyttämään uudelta.
 */
export function yhdistaTavoitteet(
  drive: Partial<Record<Myymala, MyymalaTavoite>>,
  koodi: Partial<Record<Myymala, MyymalaTavoite>> | null,
): { tavoitteet: Partial<Record<Myymala, MyymalaTavoite>>; varoitukset: string[] } {
  const varoitukset: string[] = []
  const yhdistetty: Partial<Record<Myymala, MyymalaTavoite>> = {}

  for (const { myymala } of MYYMALAT) {
    const d = drive[myymala]
    const k = koodi?.[myymala]

    if (!d) {
      if (k) {
        yhdistetty[myymala] = k
        varoitukset.push(`${myymala}: rivi puuttuu Drive-taulukosta — käytetään aiempaa tavoitetta`)
      }
      continue
    }

    const rivi: MyymalaTavoite = { liittymat: null, fsecure: null, kassakate: null }
    for (const m of MITTARIT) {
      if (d[m] !== null) { rivi[m] = d[m]; continue }
      if (k && k[m] !== null) {
        rivi[m] = k[m]
        varoitukset.push(`${myymala} ${MITTARI_NIMI[m]}: puuttuu Drive-taulukosta — käytetään aiempaa arvoa ${k[m]}`)
      }
    }
    const tapahtuma = d.tapahtumaLiittymat ?? k?.tapahtumaLiittymat
    if (tapahtuma !== undefined && tapahtuma > 0) rivi.tapahtumaLiittymat = tapahtuma

    yhdistetty[myymala] = rivi
  }

  return { tavoitteet: yhdistetty, varoitukset }
}

// ---------------------------------------------------------------------------
// Lukituksen muutoshistoria
// ---------------------------------------------------------------------------

/**
 * Yksi ero jäädytetyn tavoitteen ja Drive-taulukon nykyisen arvon välillä.
 *
 * Ero **ei muuta laskentaa** — jäädytetty luku on se johon bonus on sidottu.
 * Se kirjataan silti, koska bonus on sidottu prosenttiin eikä euroon: hiljainen
 * tavoitteen lasku kesken kuun olisi sama kuin bonuksen jakaminen ilmaiseksi.
 */
export type TavoiteEro = {
  myymala: Myymala
  mittari: Mittari
  vanha: number | null
  uusi: number | null
}

export type MuutosMerkinta = TavoiteEro & {
  /** ISO-aika jolloin ero havaittiin — ei se hetki jolloin Albin muutti solua. */
  havaittu: string
  /** Kirjautunut käyttäjä jonka pyyntö havaitsi eron. */
  kuka: string
}

/**
 * Jäädytetyn ja Driven väliset erot.
 *
 * Vain ne kentät joilla Drivessä **on** arvo: puuttuva solu tarkoittaa
 * keskeneräistä taulukkoa eikä tavoitteen poistoa, eikä siitä pidä syntyä
 * merkintää "190 → tyhjä" joka näyttäisi tavoitteen laskulta.
 */
export function tavoiteErot(
  lukittu: Partial<Record<Myymala, MyymalaTavoite>>,
  drive: Partial<Record<Myymala, MyymalaTavoite>> | null,
): TavoiteEro[] {
  if (!drive) return []
  const erot: TavoiteEro[] = []
  for (const { myymala } of MYYMALAT) {
    const l = lukittu[myymala]
    const d = drive[myymala]
    if (!d) continue
    for (const m of MITTARIT) {
      if (d[m] === null || d[m] === undefined) continue
      const vanha = l ? l[m] : null
      if (vanha !== d[m]) erot.push({ myymala, mittari: m, vanha, uusi: d[m] })
    }
  }
  return erot
}

/**
 * Uudet merkinnät historiaan.
 *
 * Sama ero havaitaan uudelleen jokaisella sivulatauksella niin kauan kuin
 * Driven arvo poikkeaa jäädytetystä, joten ilman tunnistetta historia kasvaisi
 * yhdestä muutoksesta sadaksi riviksi päivässä. Tunniste on myymälä + mittari
 * + vanha → uusi, eli sama muutos kirjataan kerran.
 */
export function uudetMerkinnat(
  historia: MuutosMerkinta[],
  erot: TavoiteEro[],
  kuka: string,
  nyt: Date = new Date(),
): MuutosMerkinta[] {
  const tunniste = (e: TavoiteEro) => `${e.myymala}|${e.mittari}|${e.vanha ?? ''}|${e.uusi ?? ''}`
  const nahdyt = new Set(historia.map(tunniste))
  const uudet: MuutosMerkinta[] = []
  for (const e of erot) {
    const t = tunniste(e)
    if (nahdyt.has(t)) continue
    nahdyt.add(t)
    uudet.push({ ...e, havaittu: nyt.toISOString(), kuka })
  }
  return uudet
}

export function muutosTeksti(m: MuutosMerkinta): string {
  const pvm = m.havaittu.slice(0, 10)
  return `${pvm} · ${m.kuka} · ${m.myymala} ${MITTARI_NIMI[m.mittari]}: ${m.vanha ?? '—'} → ${m.uusi ?? '—'} (ei vaikuta laskentaan, tavoite on lukittu)`
}
