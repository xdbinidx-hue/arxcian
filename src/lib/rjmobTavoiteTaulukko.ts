// Aluejohtajan kuukausitavoitetaulukon jäsennys.
//
// Lähde on Drive-kansio `ARXCIAN / RJ-Mob / Tavoitteet (kopio)`, jossa on
// erikseen `Myymälä/` ja `Myyjä/` -alikansiot ja niissä yksi .xlsx kuukautta
// kohti (`Elokuu_2026_Tavoitteet.xlsx`). Tiedosto sisältää **kaikkien kolmen
// aluejohtajan** tavoitteet; arxcian lukee vain Albinin lohkon.
//
// ".ts"-pääte importissa on tahallinen: moduuli on yksikkötestattu ja Noden
// ESM-resolveri ei osaa extensiotonta muotoa. Sama syy kuin
// rjmobBonusTavoitteet.ts:ssä.
import type { Myymala } from './rjmobBonus.ts'
import { myymalaAvaimesta, myymalanTiedot } from './rjmobBonus.ts'

/** Kenen lohko taulukosta luetaan. Muut aluejohtajat eivät kuulu arxcianiin. */
export const ALUEJOHTAJA = 'Albin'

export type MyymalaTavoiteRivi = {
  myymala: Myymala
  /** Myyntiseurannan myymälätaulukon avain, esim. "Lahti, Holma". */
  storeKey: string
  /** `null` = tavoitetta ei ole asetettu (tyhjä solu tai `#DIV/0!`). */
  liittymat: number | null
  fsecure: number | null
  kassakate: number | null
}

export type TavoiteTaulukkoTulos = {
  rivit: MyymalaTavoiteRivi[]
  /**
   * Miksi jokin jäi lukematta. **Tyhjä tulos ei ole tulos vaan virhe** —
   * sama päättely kuin rjmobBonusTavoitteet.ts:ssä: väärin nimetty sarake
   * näyttäisi muuten siltä että jokaisen myymälän tavoite on nolla.
   */
  varoitukset: string[]
}

const KUUKAUDET = [
  'tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu',
  'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu',
]

/**
 * Kuukausi tiedostonimestä, esim. "Elokuu_2026_Tavoitteet.xlsx" →
 * `{ order: 202608, nimi: 'Elokuu' }`.
 *
 * **Ei `monthOrder`** ([rjmobDrive.ts](rjmobDrive.ts)): se lukee
 * myyntiseurannan `N. Kuukausi VVVV` -muodon numeroetuliitteen, jota
 * tavoitetiedostoissa ei ole. Järjestysluku on silti sama `vuosi × 100 +
 * kuukausi`, joten kuukaudet ovat vertailukelpoisia keskenään.
 *
 * `nimi` palautetaan erikseen, koska sarakeotsikko taulukon sisällä on
 * genetiivissä ("Elokuun tavoite") ja se johdetaan tästä nimestä.
 */
export function kuukausiTiedostonimesta(name: string): { order: number; nimi: string } | null {
  const matalat = name.toLowerCase()
  const idx = KUUKAUDET.findIndex(k => matalat.includes(k))
  if (idx < 0) return null
  const vuosi = name.match(/(20\d{2})/)
  if (!vuosi) return null
  const nimi = KUUKAUDET[idx]
  return {
    order: Number(vuosi[1]) * 100 + (idx + 1),
    nimi: nimi.charAt(0).toUpperCase() + nimi.slice(1),
  }
}

/**
 * Kuukauden nimi genetiivissä. Kaikki suomen kuukaudet päättyvät "kuu", joten
 * genetiivi on aina pelkkä `+n` — taivutussääntöä ei tarvita.
 */
export function genetiivi(kuukausiNimi: string): string {
  return `${kuukausiNimi}n`
}

/** Rivin solu normalisoituna: rivinvaihdot ja tuplavälit pois, pienellä. */
function norm(v: string | undefined): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Solun luku, tai `null` jos siinä ei ole lukua.
 *
 * `#DIV/0!` on tässä oikea tila eikä poikkeus: syyskuun tiedoston elokuun
 * ennustesarakkeet ovat kaavavirheitä, ja ne on luettava tyhjinä eikä
 * nollina.
 */
function luku(raw: string | undefined): number | null {
  const teksti = String(raw ?? '')
  if (teksti.includes('#')) return null
  const puhdas = teksti.replace(/\s| /g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
  if (puhdas === '' || puhdas === '-') return null
  const n = Number(puhdas)
  return Number.isFinite(n) ? n : null
}

/**
 * Ryhmäotsikkorivin sarakevälit: otsikko → [alku, loppu].
 *
 * `leveys` on **alaotsikkorivin** pituus eikä ryhmärivin: viimeisen ryhmän
 * (KASSAKATE) yläotsikko on yhdistetyssä solussa, joten ryhmärivi voi loppua
 * siihen kun alaotsikoita on vielä kaksi lisää. Ilman tätä viimeisen ryhmän
 * tavoitesarake jäisi välin ulkopuolelle eikä löytyisi lainkaan.
 */
function ryhmaValit(rivi: string[], leveys: number): { otsikko: string; alku: number; loppu: number }[] {
  const kohdat: { otsikko: string; alku: number }[] = []
  for (let i = 0; i < rivi.length; i++) {
    if (norm(rivi[i]) !== '') kohdat.push({ otsikko: norm(rivi[i]), alku: i })
  }
  const viimeinen = Math.max(rivi.length, leveys) - 1
  return kohdat.map((k, i) => ({
    otsikko: k.otsikko,
    alku: k.alku,
    loppu: i + 1 < kohdat.length ? kohdat[i + 1].alku - 1 : viimeinen,
  }))
}

/**
 * Mittarin tavoitesarake: se sarake ryhmän sisällä jonka alaotsikko on
 * **täsmälleen** "<Kuukausi>n tavoite".
 *
 * Täsmäosuma eikä osajono: samassa ryhmässä on myös "Syyskuun tapahtuma",
 * joka osuisi osajonovertailulla ja antaisi tapahtumaosuuden koko tavoitteen
 * paikalle. Ryhmärajaus taas erottaa liittymien "Elokuun tavoite" -sarakkeen
 * kassakatteen samannimisestä.
 */
function tavoiteSarake(
  alaotsikot: string[],
  vali: { alku: number; loppu: number } | undefined,
  haettu: string,
): number {
  if (!vali) return -1
  for (let i = vali.alku; i <= vali.loppu && i < alaotsikot.length; i++) {
    if (alaotsikot[i] === haettu) return i
  }
  return -1
}

const LOHKO_RE = /myymäläkohtaiset tavoitteet/

/**
 * Yhden kuukauden myymälätavoitteet Albinin lohkosta.
 *
 * Taulukon rakenne (todennettu elo- ja syyskuun 2026 tiedostoista):
 *
 *   rivi n     "Albin – myymäläkohtaiset tavoitteet"
 *   rivi n+1   ryhmäotsikot: Myymälä | LIITTYMÄT | … | F-SECURE | … | KASSAKATE (ALV 0)
 *   rivi n+2   alaotsikot:   | Elokuun tavoite | Elokuun ennuste | … | Syyskuun tavoite
 *   rivi n+3…  myymälärivit
 *   rivi n+8   "ALBIN YHTEENSÄ"
 *
 * Rivien määrä ei ole kiinteä eikä lohkon paikka: molemmat etsitään
 * sisällöstä, koska taulukko on ihmisen ylläpitämä ja aluejohtajien
 * järjestys tai myymälöiden määrä voi muuttua.
 */
export function parseMyymalaTavoitteet(
  rows: string[][],
  kuukausiNimi: string,
  aluejohtaja: string = ALUEJOHTAJA,
): TavoiteTaulukkoTulos {
  const varoitukset: string[] = []
  const nimiPieni = aluejohtaja.toLowerCase()

  const lohkoIdx = rows.findIndex(r => {
    const eka = norm(r[0])
    return eka.startsWith(nimiPieni) && LOHKO_RE.test(eka)
  })
  if (lohkoIdx < 0) {
    return { rivit: [], varoitukset: [`Lohkoa "${aluejohtaja} – myymäläkohtaiset tavoitteet" ei löytynyt`] }
  }

  const ryhmaRivi = rows[lohkoIdx + 1] ?? []
  const alaotsikot = (rows[lohkoIdx + 2] ?? []).map(norm)
  const valit = ryhmaValit(ryhmaRivi, alaotsikot.length)
  const vali = (...osat: string[]) => valit.find(v => osat.some(o => v.otsikko.includes(o)))

  const haettu = norm(`${genetiivi(kuukausiNimi)} tavoite`)
  const sarakkeet = {
    liittymat: tavoiteSarake(alaotsikot, vali('liittymä', 'liittyma'), haettu),
    fsecure: tavoiteSarake(alaotsikot, vali('f-secure', 'fsecure'), haettu),
    kassakate: tavoiteSarake(alaotsikot, vali('kassakate'), haettu),
  }
  for (const [mittari, idx] of Object.entries(sarakkeet)) {
    if (idx < 0) varoitukset.push(`Saraketta "${genetiivi(kuukausiNimi)} tavoite" ei löytynyt mittarille ${mittari}`)
  }

  const rivit: MyymalaTavoiteRivi[] = []
  const nahdyt = new Set<Myymala>()
  for (let i = lohkoIdx + 3; i < rows.length; i++) {
    const eka = norm(rows[i]?.[0])
    // Lohkon summarivi päättää lohkon; seuraavan aluejohtajan otsikko on
    // varmistus sen varalta ettei summariviä ole.
    if (eka.includes('yhteensä') || eka.includes('yhteenveto') || LOHKO_RE.test(eka)) break
    if (eka === '') continue

    const myymala = myymalaAvaimesta(rows[i][0])
    if (!myymala) {
      varoitukset.push(`Riviä "${rows[i][0]}" ei tunnistettu myymäläksi`)
      continue
    }
    if (nahdyt.has(myymala)) continue
    nahdyt.add(myymala)

    rivit.push({
      myymala,
      storeKey: myymalanTiedot(myymala).storeKey,
      liittymat: sarakkeet.liittymat >= 0 ? luku(rows[i][sarakkeet.liittymat]) : null,
      fsecure: sarakkeet.fsecure >= 0 ? luku(rows[i][sarakkeet.fsecure]) : null,
      kassakate: sarakkeet.kassakate >= 0 ? luku(rows[i][sarakkeet.kassakate]) : null,
    })
  }

  if (rivit.length === 0) varoitukset.push(`Lohkosta "${aluejohtaja}" ei tunnistettu yhtään myymälää`)

  return { rivit, varoitukset }
}

/** Rivit myymäläavaimella haettavana karttana. */
export function tavoiteKartta(rivit: MyymalaTavoiteRivi[]): Record<string, MyymalaTavoiteRivi> {
  const kartta: Record<string, MyymalaTavoiteRivi> = {}
  for (const r of rivit) kartta[r.storeKey] = r
  return kartta
}

/**
 * Aluetason summa. `null`-tavoitteet jätetään pois summasta, mutta jos
 * **yksikään** myymälä ei ole asettanut mittaria, summa on `null` eikä nolla:
 * nolla olisi tavoite jonka jokainen ylittää.
 */
export function tavoiteYhteensa(rivit: MyymalaTavoiteRivi[]) {
  const summa = (valitse: (r: MyymalaTavoiteRivi) => number | null): number | null => {
    const luvut = rivit.map(valitse).filter((n): n is number => n !== null)
    return luvut.length > 0 ? luvut.reduce((a, b) => a + b, 0) : null
  }
  return {
    liittymat: summa(r => r.liittymat),
    fsecure: summa(r => r.fsecure),
    kassakate: summa(r => r.kassakate),
  }
}

// ---------------------------------------------------------------------------
// Myyjäkohtaiset tavoitteet
// ---------------------------------------------------------------------------

export type MyyjaTavoiteRivi = {
  /** Nimi kanonisessa "Etunimi Sukunimi" -muodossa. */
  nimi: string
  liittymat: number | null
  fsecure: number | null
  kassakate: number | null
}

/**
 * Myyjäkohtaiset tavoitteet.
 *
 * **Rakenne on eri kuin myymäläpuolella eikä sitä pidä yhtenäistää.**
 * Myymälätavoitteet ovat kolmen aluejohtajan yhteisessä .xlsx-työkirjassa,
 * jossa on kaksitasoiset otsikot ja kuukausi sarakkeessa; myyjätavoitteet
 * ovat omassa natiivissa Sheets-taulukossaan kuukausikansiossa
 * ("Myyjäkohtaiset Tavoitteet 9. Syyskuu 2026"), yksi litteä taulukko:
 *
 *   Myyjä | Liittymätavoite | F-Secure Tavoite | Kassakate Tavoite
 *
 * Kuukausi on siis **tiedostossa**, ei sarakeotsikossa — siksi tämä ei ota
 * kuukautta parametrina lainkaan, toisin kuin `parseMyymalaTavoitteet`.
 *
 * Otsikkorivi etsitään sisällöstä eikä oleteta ensimmäiseksi: taulukko on
 * ihmisen ylläpitämä ja sen yläpuolelle voi ilmestyä otsikkorivi milloin
 * tahansa.
 *
 * Albinin rivillä lukee viiva eikä lukua — se on "ei tavoitetta", ja `luku`
 * palauttaa siitä `null`. Nolla olisi tavoite jonka jokainen ylittää.
 */
export function parseMyyjaTavoitteet(
  rows: string[][],
  myyjat: readonly string[],
): { rivit: MyyjaTavoiteRivi[]; varoitukset: string[] } {
  const varoitukset: string[] = []

  const otsikkoIdx = rows.findIndex(r =>
    r.some(c => /^myyj/.test(norm(c))) && r.some(c => norm(c).includes('liittym')),
  )
  if (otsikkoIdx < 0) {
    return { rivit: [], varoitukset: ['Myyjätavoitetaulukosta ei löytynyt otsikkoriviä (Myyjä + Liittymätavoite)'] }
  }

  const otsikot = rows[otsikkoIdx].map(norm)
  const sarake = (...osat: string[]) => otsikot.findIndex(h => osat.some(o => h.includes(o)))
  const idxNimi = sarake('myyjä', 'myyja', 'nimi')
  const sarakkeet = {
    liittymat: sarake('liittymä', 'liittyma'),
    fsecure: sarake('f-secure', 'fsecure', 'f-sec'),
    kassakate: sarake('kassakate', 'kassa'),
  }
  for (const [mittari, idx] of Object.entries(sarakkeet)) {
    if (idx < 0) varoitukset.push(`Myyjätavoitteista puuttuu sarake mittarille ${mittari}`)
  }

  // Nimilista on pareina: [i] kanoninen, [i+1] käänteinen. Sama normalisointi
  // kuin rjmobTargets.ts:ssä, jotta taulukon nimijärjestys ei ratkaise.
  const kanoninen: Record<string, string> = {}
  for (let i = 0; i + 1 < myyjat.length; i += 2) {
    kanoninen[myyjat[i].toLowerCase()] = myyjat[i]
    kanoninen[myyjat[i + 1].toLowerCase()] = myyjat[i]
  }

  const rivit: MyyjaTavoiteRivi[] = []
  const nahdyt = new Set<string>()
  for (let i = otsikkoIdx + 1; i < rows.length; i++) {
    const raaka = String(rows[i]?.[idxNimi >= 0 ? idxNimi : 0] ?? '').trim()
    const eka = norm(raaka)
    if (eka.includes('yhteensä') || eka.includes('yhteenveto')) break
    if (eka === '') continue

    const nimi = kanoninen[eka]
    if (!nimi) {
      varoitukset.push(`Riviä "${raaka}" ei tunnistettu myyjäksi`)
      continue
    }
    if (nahdyt.has(nimi)) continue
    nahdyt.add(nimi)

    rivit.push({
      nimi,
      liittymat: sarakkeet.liittymat >= 0 ? luku(rows[i][sarakkeet.liittymat]) : null,
      fsecure: sarakkeet.fsecure >= 0 ? luku(rows[i][sarakkeet.fsecure]) : null,
      kassakate: sarakkeet.kassakate >= 0 ? luku(rows[i][sarakkeet.kassakate]) : null,
    })
  }

  if (rivit.length === 0) varoitukset.push('Myyjätavoitetaulukosta ei tunnistettu yhtään myyjää')

  return { rivit, varoitukset }
}
