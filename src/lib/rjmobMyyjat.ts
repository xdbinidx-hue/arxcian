/**
 * `myyjat.md` — myyjät, nimikorjaukset ja tuntipalkat yhtenä listana.
 *
 * Tiedosto on Drivessä (`Arxcian / Infopaketti / myyjat.md`) ja se on
 * **Google Docs -dokumentti**, ei oikea tiedosto: sisältö luetaan
 * `drive.files.export`illa tekstiksi ja jäsennetään täällä. Jäsennys on
 * erotettu Drive-yhteydestä, jotta se on testattavissa ilman verkkoa — sama
 * jako kuin työvuorojen `tyovuoroExcel`/`tyovuoroDrive`.
 *
 * Rivimuoto (26.8.2026 alkaen):
 *
 *     Tunnus | Koko nimi | alue | tuntipalkka €/h | tila
 *     Tunnus | vanha → uusi | voimaan KK/VV        (Palkkamuutokset-osio)
 *
 * **Osioiden otsikoihin ei luoteta.** Docsin tekstivienti pudottaa
 * otsikkotason pois, jolloin "Lahti" ja "PK-seutu" ovat paljaita rivejä eikä
 * niitä voi erottaa tavallisesta tekstistä ilman arvailua. Rivit tunnistetaan
 * siksi muodostaan: myyjärivillä on viisi kenttää ja palkkamuutosrivin
 * keskikentässä on nuoli. Muotokuvauksen mallirivit rajataan pois nimeltä.
 */

/** Kuukausi `vuosi × 100 + kuukausi`, sama sääntö kuin muualla. */
function kkOrder(kk: string, vv: string): number {
  const vuosi = Number(vv) + 2000
  return vuosi * 100 + Number(kk)
}

export type MyyjaRivi = {
  /** Miten nimi kirjoitetaan Winposissa tai kassalla — tämä korjataan. */
  tunnus: string
  /** Se muoto jota käytetään raporteissa. */
  nimi: string
  /** Lahti | PK-seutu | molemmat. **Ei myymälä** — myyjät kiertävät. */
  alue: string | null
  /**
   * `null` = ei täytetty, `0` = ei tuntipalkkaa (omistajat, Krenar).
   * Näiden sekoittaminen laskisi täyttämättömän myyjän palkaksi nollan.
   */
  tuntipalkka: number | null
  eiTuntipalkkaa: boolean
  paallikko: boolean
  /** Vain päälliköillä — tavallisen myyjän myymälä tulee työvuoroista. */
  myymala: string | null
  poistunut: boolean
  /** Lopettamiskuukausi järjestyslukuna, esim. "08/26" -> 202608. */
  paattyiOrder: number | null
  /** Tila-kentän sulkeissa oleva teksti sellaisenaan (esim. avoin kysymys). */
  huomio: string | null
}

export type MyyjatPalkkamuutos = {
  tunnus: string
  vanha: number
  uusi: number
  voimaanOrder: number
}

export type MyyjatTiedosto = {
  rivit: MyyjaRivi[]
  palkkamuutokset: MyyjatPalkkamuutos[]
  varoitukset: string[]
}

/** Muotokuvauksen mallirivit — näyttävät dataa mutta kuvaavat muotoa. */
const MALLIRIVIT = ['tunnus', 'koko nimi']

function kohta(rivi: string): string | null {
  const m = rivi.match(/^\s*\\?[-•*]\s+(.*)$/)
  return m ? m[1].trim() : null
}

function palkasta(raw: string): { tuntipalkka: number | null; eiTuntipalkkaa: boolean } {
  if (/ei\s+tuntipalkkaa/i.test(raw)) return { tuntipalkka: 0, eiTuntipalkkaa: true }
  const puhdas = raw.replace(/\s| /g, '').replace(',', '.').replace(/[^0-9.]/g, '')
  if (puhdas === '') return { tuntipalkka: null, eiTuntipalkkaa: false }
  const n = Number(puhdas)
  return { tuntipalkka: Number.isFinite(n) ? n : null, eiTuntipalkkaa: false }
}

export function parseMyyjat(teksti: string): MyyjatTiedosto {
  const rivit: MyyjaRivi[] = []
  const palkkamuutokset: MyyjatPalkkamuutos[] = []
  const varoitukset: string[] = []

  for (const raaka of teksti.replace(/^﻿/, '').split(/\r?\n/)) {
    const k = kohta(raaka)
    if (k === null || !k.includes('|')) continue

    const kentat = k.split('|').map(x => x.trim())
    if (MALLIRIVIT.includes((kentat[0] ?? '').toLowerCase())) continue

    // Palkkamuutosrivi: keskikentässä nuoli. Tunnistetaan muodosta eikä
    // osiosta, koska osion otsikko katoaa Docsin tekstiviennissä.
    if (/[→]|->/.test(kentat[1] ?? '')) {
      const luvut = (kentat[1] ?? '').split(/→|->/).map(x => palkasta(x).tuntipalkka)
      const aika = (kentat[2] ?? '').match(/(\d{1,2})\s*\/\s*(\d{2})/)
      if (luvut[0] === null || luvut[1] === null || !aika) {
        varoitukset.push(`Palkkamuutosriviä ei ymmärretty: ${k}`)
        continue
      }
      palkkamuutokset.push({
        tunnus: kentat[0],
        vanha: luvut[0],
        uusi: luvut[1],
        voimaanOrder: kkOrder(aika[1], aika[2]),
      })
      continue
    }

    if (kentat.length < 4 || !kentat[0] || !kentat[1]) continue

    const tila = kentat[4] ?? ''
    const lopetus = tila.match(/lopettanut\s*(\d{1,2})\s*\/\s*(\d{2})/i)
    const sulut = tila.match(/\(([^)]*)\)/)
    const sisus = sulut ? sulut[1] : ''
    const paallikko = /päällik|paallik/i.test(sisus)
    const myymalaM = paallikko ? sisus.split(',')[1] : undefined

    const { tuntipalkka, eiTuntipalkkaa } = palkasta(kentat[3] ?? '')

    rivit.push({
      tunnus: kentat[0],
      nimi: kentat[1],
      alue: kentat[2] || null,
      tuntipalkka,
      eiTuntipalkkaa,
      paallikko,
      myymala: myymalaM ? myymalaM.trim() : null,
      poistunut: lopetus !== null,
      paattyiOrder: lopetus ? kkOrder(lopetus[1], lopetus[2]) : null,
      huomio: sisus || null,
    })
  }

  if (rivit.length === 0) {
    // Tyhjä lista on virhe eikä tulos — muuten muuttunut tiedostomuoto
    // näyttäisi siltä ettei myyjiä ole, ja palkat putoaisivat oletukseen
    // ilman että kukaan huomaa.
    varoitukset.push('myyjat.md: yhtään myyjäriviä ei tunnistettu — onko rivimuoto muuttunut?')
  }
  for (const r of rivit) {
    if (r.poistunut || r.eiTuntipalkkaa) continue
    if (r.tuntipalkka === null) varoitukset.push(`${r.nimi}: tuntipalkka puuttuu myyjat.md:stä`)
  }

  return { rivit, palkkamuutokset, varoitukset }
}

/**
 * Voimassa olevat tuntipalkat sekä tunnuksella että koko nimellä.
 *
 * Täyttämätöntä palkkaa ei kirjata lainkaan, jottei se peitä koodin
 * oletuspalkkaa nollalla. `ei tuntipalkkaa` sen sijaan kirjataan nollana:
 * se on päätös, ei puute.
 */
export function tuntipalkatTiedostosta(t: MyyjatTiedosto): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of t.rivit) {
    if (r.tuntipalkka === null) continue
    out[r.nimi] = r.tuntipalkka
    if (r.tunnus) out[r.tunnus] = r.tuntipalkka
  }
  return out
}

/**
 * Tuntipalkka kuukaudelle tiedoston omien palkkamuutosten mukaan.
 *
 * Listattu palkka on **nykyinen**; ennen voimaantulokuukautta palautetaan
 * muutoksen vanha luku. Vanha kuukausi ei siis muutu takautuvasti kun palkka
 * nousee.
 */
export function tuntipalkkaKuukaudelle(
  t: MyyjatTiedosto,
  nimiTaiTunnus: string,
  kuukausiOrder: number | null,
): number | null {
  const norm = (s: string) => s.trim().toLowerCase()
  const rivi = t.rivit.find(r => norm(r.nimi) === norm(nimiTaiTunnus) || norm(r.tunnus) === norm(nimiTaiTunnus))
  if (!rivi || rivi.tuntipalkka === null) return null
  if (kuukausiOrder === null) return rivi.tuntipalkka

  for (const m of t.palkkamuutokset) {
    if (norm(m.tunnus) !== norm(rivi.tunnus)) continue
    if (kuukausiOrder < m.voimaanOrder) return m.vanha
  }
  return rivi.tuntipalkka
}

/**
 * Vertaa tiedoston palkkoja koodin taulukkoon.
 *
 * **Ei korjaa kumpaakaan** vaan kertoo mikä eroaa. Koodi on laskennan lähde ja
 * Drive-tiedosto se jota Albin ylläpitää; jos ne erkanevat, palkkakulu on
 * väärin jossain päin eikä kumpikaan pää kerro siitä itse.
 */
export function vertaaTuntipalkkoihin(
  t: MyyjatTiedosto,
  /**
   * Koodin oma palkka samalle kuukaudelle — käytännössä `getTuntipalkka`.
   * Funktio eikä taulukko, jotta vertailu tehdään **samalla kuukaudella
   * molemmilla puolilla**: pelkkä nykyarvojen taulukko väittäisi elokuun
   * eroavan aina kun palkka on sittemmin noussut.
   */
  koodiPalkka: (nimi: string, kuukausiOrder: number | null) => number,
  kuukausiOrder: number | null = null,
): string[] {
  const varoitukset: string[] = []

  for (const r of t.rivit) {
    // Omistajat ja Krenar eivät kulje tuntipalkan läpi lainkaan
    // (`laskeMyyja`n owner-/krenar-haarat), joten nollarivistä ei valiteta.
    if (r.eiTuntipalkkaa) continue

    const driveArvo = tuntipalkkaKuukaudelle(t, r.nimi, kuukausiOrder)
    if (driveArvo === null) continue

    const koodiArvo = koodiPalkka(r.nimi, kuukausiOrder)
    if (koodiArvo !== driveArvo) {
      varoitukset.push(`${r.nimi}: myyjat.md ${driveArvo} €/h, koodissa ${koodiArvo} €/h`)
    }
  }

  return varoitukset
}

/** Yksi rivi myyntiseurannan Kassamyynti-välilehden nimikorjaustaulusta (J → K). */
export type NimikorjausPari = { alias: string; nimi: string }

/**
 * Vertaa `myyjat.md`:n tunnuksia Excelin nimikorjaustauluun.
 *
 * **Ei korjaa kumpaakaan automaattisesti**, vaan kertoo mikä nimi puuttuu
 * kummasta. Kaksi listaa erkanee ajan myötä, ja hiljainen automaattikorjaus
 * siirtäisi ylläpidon taulukosta koodiin — sama ansa kuin Kassamyynnin
 * kahdessa nimisarakkeessa, jossa yhden pään "korjaaminen" hävittäisi
 * kassaluvut kaikilta.
 */
export function vertaaNimikorjauksiin(t: MyyjatTiedosto, excel: NimikorjausPari[]): string[] {
  const varoitukset: string[] = []
  const norm = (s: string) => s.trim().toLowerCase()

  const mdTunnukset = new Map<string, string>()
  for (const r of t.rivit) if (r.tunnus) mdTunnukset.set(norm(r.tunnus), r.nimi)
  const mdNimet = new Set(t.rivit.map(r => norm(r.nimi)))

  for (const p of excel) {
    const md = mdTunnukset.get(norm(p.alias))
    if (md === undefined) {
      varoitukset.push(`Excelin nimikorjaus "${p.alias}" → "${p.nimi}" puuttuu myyjat.md:stä`)
    } else if (norm(md) !== norm(p.nimi)) {
      varoitukset.push(`"${p.alias}" osoittaa Excelissä nimeen "${p.nimi}" mutta myyjat.md:ssä nimeen "${md}"`)
    }
  }

  const excelTunnukset = new Set(excel.map(p => norm(p.alias)))
  for (const r of t.rivit) {
    if (r.tunnus && !excelTunnukset.has(norm(r.tunnus))) {
      varoitukset.push(`myyjat.md:n tunnus "${r.tunnus}" (${r.nimi}) puuttuu Excelin nimikorjaustaulusta`)
    }
  }

  for (const p of excel) {
    if (!mdNimet.has(norm(p.nimi))) {
      varoitukset.push(`Excelin nimikorjauksen kohde "${p.nimi}" ei ole myyjat.md:n listalla`)
    }
  }

  return varoitukset
}
