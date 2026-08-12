import { listSeurantaFiles, monthOrder, SPREADSHEET_MIME } from '@/lib/rjmobDrive'
import { loadDashData, type DashData } from '@/lib/rjmobSheets'
import { loadTargets, type TargetRow } from '@/lib/rjmobTargets'
import { laskeTyopaivat } from '@/lib/rjmobWorkdays'
import type { SellerResult } from '@/lib/rjmob'
import { fetchAndCache, type Fetched } from './cache'

/**
 * RJ-Mobin tilanneyhteenveto: mihin pitää reagoida juuri nyt.
 *
 * Luvut tulevat samasta lähteestä ja saman laskennan läpi kuin RJ-Mobin omat
 * sivut — `loadDashData` (tuottoseuranta ja run rate) ja `loadTargets`
 * (tavoitteet) — eikä täällä lasketa yhtään myyntilukua uudestaan. Yhteenveto
 * vain vertaa niitä toisiinsa ja kuukauden kuluneeseen osuuteen. Jos jokin
 * luku eroaa sivun omasta luvusta, vika on tässä tiedostossa.
 *
 * **Poikkeaman tunnistus perustuu kahteen kysymykseen:**
 *
 * 1. *Onko tuotto tunneille riittävä?* Teho (€/h) on jo laskettu
 *    `laskeMyyja`ssa, ja sen portaikko (≥9 hyvä, ≥7 rajalla, alle heikko) on
 *    sama jota tuotto- ja run rate -sivut käyttävät väreissään. Tänne ei
 *    keksitä omaa rajaa, jottei yhteenveto sano eri asiaa kuin sivu.
 *
 * 2. *Riittääkö vauhti tavoitteeseen?* Pelkkä "62 % tavoitteesta" ei kerro
 *    mitään ilman aikaa. Vasta ero kuukauden kuluneeseen osuuteen kertoo:
 *    62 % on hyvä kun kuukaudesta on kulunut puolet ja huono kun kulunut on
 *    80 %. Siksi mittari on **vauhtiero prosenttiyksikköinä**, ei
 *    saavutusprosentti sellaisenaan.
 */

// ---- Rajat yhtenä blokkina, jotta niitä voi säätää yhdestä paikasta ----

/** Teho €/h. Samat rajat kuin `laskeMyyja`n tehoStatus-portaikossa. */
const TEHO_HYVA = 9
const TEHO_HEIKKO = 7

/**
 * Alle tämän tuntimäärän tehoa ei arvioida lainkaan. Muutaman tunnin
 * jakajalla yksi kauppa heittää tehon kymmeniin euroihin tunnissa eikä luku
 * kerro suorituksesta mitään.
 */
const MIN_TUNNIT = 20

/**
 * Kuinka monta työpäivää kuukaudesta on oltava takana ennen kuin
 * vauhtiarvioita näytetään. Sama peruste kuin hubin yhteenvedon
 * `MIN_DAYS_FOR_PROJECTION`illa: kuun alussa kerroin on niin suuri että yksi
 * päivä heiluttaa prosenttia kymmeniä yksiköitä. Teho ja leikkuri näkyvät
 * heti, koska ne eivät ole projektioita.
 */
const MIN_TYOPAIVAT = 5

/** Vauhtiero prosenttiyksikköinä: saavutus-% miinus kuukaudesta kulunut %. */
const VAUHTI_SELVASTI_JALJESSA = -20
const VAUHTI_JALJESSA = -10
const VAUHTI_EDELLA = 15

/**
 * Osa-aikaisuuden vaimennus: jos myyjän omat toteutuneet työpäivät jäävät
 * alle tämän osuuden kuukauden kuluneista työpäivistä, vauhtia ei nosteta
 * poikkeamaksi. Muuten jokainen osa-aikainen ja sairauslomalla ollut näkyisi
 * joka kuukausi jäljessä, ja oikeat poikkeamat hukkuisivat siihen kohinaan.
 */
const OMAT_PAIVAT_MIN_OSUUS = 0.6

/** Myymälä- ja yritystaso: ennusteen suhde edellisen kuukauden toteumaan. */
const KK_JALJESSA = 0.9
const KK_EDELLA = 1.1

// ---- Tyypit ----

export type Vakavuus = 'korkea' | 'keskitaso' | 'matala' | 'hyva'

export type Huomio = {
  vakavuus: Vakavuus
  /** Myyjän tai myymälän nimi, tai 'RJ-Mob' yritystasolla. */
  kohde: string
  laji: 'teho' | 'kannattavuus' | 'tavoitevauhti' | 'kuukausivauhti'
  /** Valmis suomenkielinen lause. */
  teksti: string
}

export type TehoTila = 'alle' | 'rajalla' | 'yli' | 'ei-arviota'

export type MittariLaji = 'liittymat' | 'fsecure' | 'kassakate'
export type VauhtiTila = 'selvasti-jaljessa' | 'jaljessa' | 'aikataulussa' | 'edella'

/** Yhden myyjän yksi tavoitemittari. */
export type Mittari = {
  laji: MittariLaji
  label: string
  yksikko: 'kpl' | 'eur'
  toteuma: number
  tavoite: number
  /** Toteuma / tavoite × 100 — sama luku jonka tavoitteet-sivu näyttää. */
  saavutusPct: number
  /** saavutusPct − kuukaudesta kulunut %. Negatiivinen = jäljessä. */
  vauhtiEro: number
  /** Toteuma projisoituna kuukauden loppuun kuluneilla työpäivillä. */
  ennuste: number
  tila: VauhtiTila
}

export type MyyjaTila = {
  nimi: string
  tyyppi: SellerResult['tyyppi']
  teho: number
  tehoTila: TehoTila
  tunnit: number
  /** Työkulu ylittää RJ-Mobin tuoton. */
  leikkuri: boolean
  roi: number | null
  /** Myyjän omat toteutuneet työpäivät (data-välilehti). */
  paivat: number
  /** Onko myyjällä tarpeeksi omia työpäiviä että vauhtia voi verrata muihin. */
  vertailukelpoinen: boolean
  /** Miksei ole vertailukelpoinen, jos ei ole. */
  vertailuSyy: string | null
  mittarit: Mittari[]
}

/** Myymälän tai koko yrityksen kuukausivertailu yhdestä mittarista. */
export type Vertailu = {
  laji: MittariLaji
  label: string
  yksikko: 'kpl' | 'eur'
  toteuma: number
  ennuste: number
  edellinen: number | null
  /** Ennusteen muutos edelliseen kuukauteen, prosentteina. */
  muutosPct: number | null
  tila: VauhtiTila | 'ei-vertailua'
}

export type MyymalaTila = {
  nimi: string
  teho: number
  tehoTila: TehoTila
  tunnit: number
  vertailut: Vertailu[]
}

export type RjMobInsights = {
  /** Kuukausi luettavassa muodossa, esim. "Elokuu 2026". */
  kuukausi: string
  edellinenKuukausi: string | null
  paiva: number
  paiviaKuukaudessa: number
  tyopaiviaKulunut: number
  tyopaiviaYhteensa: number
  kulunutPct: number
  /** Onko taulukko kuluvalta kalenterikuukaudelta (eli onko kuukausi kesken). */
  kuukausiKesken: boolean
  /** Onko kuukaudesta kulunut tarpeeksi että vauhtiarvioita näytetään. */
  vauhtiLuotettava: boolean
  /** Tavoitteet-välilehteä ei löytynyt — tavoitepohjaiset huomiot puuttuvat. */
  tavoitteetPuuttuvat: boolean
  huomiot: Huomio[]
  myyjat: MyyjaTila[]
  myymalat: MyymalaTila[]
  yritys: Vertailu[]
}

// ---- Apurit ----

function fmtKpl(n: number): string {
  return Math.round(n).toLocaleString('fi-FI')
}

function fmtEur(n: number): string {
  return `${Math.round(n).toLocaleString('fi-FI')} €`
}

function fmtArvo(n: number, yksikko: 'kpl' | 'eur'): string {
  return yksikko === 'eur' ? fmtEur(n) : `${fmtKpl(n)} kpl`
}

function fmtPct(n: number): string {
  return `${n.toLocaleString('fi-FI', { maximumFractionDigits: 0 })} %`
}

/** "Myyntiseuranta 8. Elokuu 2026" → "Elokuu 2026". Sama kuin hubin yhteenvedossa. */
function monthLabelOf(fileName: string): string {
  const m = fileName.match(/\d{1,3}\.\s*(.+)$/)
  return (m ? m[1] : fileName).trim()
}

/**
 * Teho suhteessa portaikkoon. Yhteinen myyjille ja myymälöille, jotta
 * "alle tehojen" tarkoittaa molemmissa samaa lukua.
 */
function tehoTilasta(teho: number, tunnit: number): TehoTila {
  if (tunnit < MIN_TUNNIT) return 'ei-arviota'
  if (teho >= TEHO_HYVA) return 'yli'
  if (teho >= TEHO_HEIKKO) return 'rajalla'
  return 'alle'
}

function vauhtiTilasta(vauhtiEro: number): VauhtiTila {
  if (vauhtiEro <= VAUHTI_SELVASTI_JALJESSA) return 'selvasti-jaljessa'
  if (vauhtiEro <= VAUHTI_JALJESSA) return 'jaljessa'
  if (vauhtiEro >= VAUHTI_EDELLA) return 'edella'
  return 'aikataulussa'
}

const VAKAVUUS_JARJESTYS: Record<Vakavuus, number> = {
  korkea: 0, keskitaso: 1, matala: 2, hyva: 3,
}

// ---- Kokoaminen ----

/**
 * Kuukausi jota taulukko kuvaa, tiedostonimestä. Työpäivät on laskettava sen
 * kuukauden kalenterista eikä tästä päivästä: kun uutta taulukkoa ei ole
 * vielä luotu, uusin tiedosto on edelliseltä kuukaudelta, ja silloin
 * kuluneiden työpäivien ottaminen tästä päivästä antaisi täysin väärän
 * jakajan.
 */
function kuukaudenTyopaivat(fileName: string, now: Date) {
  const order = monthOrder(fileName)
  const vuosi = Math.floor(order / 100)
  const kuukausi = order % 100

  // Tiedostonimestä ei saatu järkevää kuukautta — käytetään kuluvaa.
  const kelpaa = vuosi >= 2000 && kuukausi >= 1 && kuukausi <= 12
  const v = kelpaa ? vuosi : now.getFullYear()
  const kk = kelpaa ? kuukausi : now.getMonth() + 1

  const kuukausiKesken = v === now.getFullYear() && kk === now.getMonth() + 1
  const tyopaiviaYhteensa = laskeTyopaivat(v, kk)
  // Päättyneestä kuukaudesta on kulunut koko kuukausi — silloin saavutus-%
  // vertautuu sataan prosenttiin, eli "jäikö tavoitteesta".
  const tyopaiviaKulunut = kuukausiKesken ? laskeTyopaivat(v, kk, now.getDate()) : tyopaiviaYhteensa

  return {
    kuukausiKesken,
    tyopaiviaKulunut,
    tyopaiviaYhteensa,
    paiva: kuukausiKesken ? now.getDate() : new Date(v, kk, 0).getDate(),
    paiviaKuukaudessa: new Date(v, kk, 0).getDate(),
  }
}

/** Myymälän teho. Yksi rivi, mutta perustelu on pitkä — ks. kommentti kutsupaikalla. */
function myymalanTeho(store: DashData['stores'][string]): number {
  return store.tunnit > 0 ? (store.liittEur + store.kassaRjmob) / store.tunnit : 0
}

function vertailu(
  laji: MittariLaji,
  label: string,
  yksikko: 'kpl' | 'eur',
  toteuma: number,
  edellinen: number | null,
  kerroin: number,
  vauhtiLuotettava: boolean,
): Vertailu {
  const ennuste = toteuma * kerroin
  const muutosPct = edellinen && edellinen > 0 ? ((ennuste - edellinen) / edellinen) * 100 : null

  let tila: Vertailu['tila'] = 'ei-vertailua'
  if (muutosPct !== null && vauhtiLuotettava) {
    if (ennuste < edellinen! * KK_JALJESSA) tila = 'jaljessa'
    else if (ennuste > edellinen! * KK_EDELLA) tila = 'edella'
    else tila = 'aikataulussa'
  }

  return { laji, label, yksikko, toteuma, ennuste, edellinen, muutosPct, tila }
}

const MITTARIT: readonly { laji: MittariLaji; label: string; yksikko: 'kpl' | 'eur' }[] = [
  { laji: 'liittymat', label: 'Liittymät', yksikko: 'kpl' },
  { laji: 'fsecure', label: 'F-Secure', yksikko: 'kpl' },
  { laji: 'kassakate', label: 'Kassakate', yksikko: 'eur' },
]

/** Tavoiterivin luvut mittarikohtaisesti. Kentät ovat ne jotka tavoitteet-sivu näyttää. */
function mittarinLuvut(t: TargetRow, laji: MittariLaji) {
  if (laji === 'liittymat') return { toteuma: t.liittKpl, tavoite: t.liittTavoite, saavutusPct: t.liittRunrate }
  if (laji === 'fsecure') return { toteuma: t.fsecKpl, tavoite: t.fsecTavoite, saavutusPct: t.fsecRunrate }
  return { toteuma: t.kassaKate, tavoite: t.kassaTavoite, saavutusPct: t.kassaRunrate }
}

export async function buildRjMobInsights(): Promise<RjMobInsights> {
  const files = await listSeurantaFiles()
  const sheets = files
    .filter(f => f.mimeType === SPREADSHEET_MIME && f.id && f.name)
    .sort((a, b) => monthOrder(b.name!) - monthOrder(a.name!))

  if (sheets.length === 0) throw new Error('Myyntiseurantataulukoita ei löytynyt')

  const currentFile = sheets[0]
  const previousFile = sheets[1]

  // Tavoitteet-välilehti puuttuu vanhemmasta formaatista. Se ei saa kaataa
  // koko yhteenvetoa — teho ja kuukausivertailu toimivat ilmankin.
  const [current, targetsData, previous] = await Promise.all([
    loadDashData(currentFile.id!),
    loadTargets(currentFile.id!).catch(() => null),
    previousFile ? loadDashData(previousFile.id!) : Promise.resolve(null),
  ])

  const aika = kuukaudenTyopaivat(currentFile.name!, new Date())
  const kulunutPct = aika.tyopaiviaYhteensa > 0
    ? (aika.tyopaiviaKulunut / aika.tyopaiviaYhteensa) * 100
    : 0
  const kerroin = aika.tyopaiviaKulunut > 0 ? aika.tyopaiviaYhteensa / aika.tyopaiviaKulunut : 1
  const vauhtiLuotettava = aika.tyopaiviaKulunut >= MIN_TYOPAIVAT

  const huomiot: Huomio[] = []
  const targetRows = targetsData?.targets ?? []

  // Jos data-välilehteä ei ole, jokaisen myyjän työpäivät ovat nollia — silloin
  // osa-aikaisuuden vaimennus vaimentaisi kaiken. Tarkistetaan onko tietoa
  // ylipäätään olemassa ennen kuin sitä käytetään suodattimena.
  const paivatSaatavilla = targetRows.some(t => t.paivat > 0)

  // ---- Myyjät ----

  const myyjat: MyyjaTila[] = current.sellers
    .filter(s => s.tyyppi !== 'ref' && s.tyyppi !== 'standi')
    .map(s => {
      const rivi = targetRows.find(t => t.nimi.toLowerCase() === s.nimi.toLowerCase())
      const paivat = rivi?.paivat ?? 0

      let vertailukelpoinen = true
      let vertailuSyy: string | null = null
      if (paivatSaatavilla) {
        if (paivat <= 0) {
          vertailukelpoinen = false
          vertailuSyy = 'ei kirjattuja työpäiviä'
        } else if (paivat < aika.tyopaiviaKulunut * OMAT_PAIVAT_MIN_OSUUS) {
          vertailukelpoinen = false
          vertailuSyy = `vähän työpäiviä (${fmtKpl(paivat)}/${aika.tyopaiviaKulunut})`
        }
      }

      const mittarit: Mittari[] = rivi
        ? MITTARIT.flatMap(m => {
            const { toteuma, tavoite, saavutusPct } = mittarinLuvut(rivi, m.laji)
            // Ilman tavoitetta ei ole mitään mihin verrata — nollavertailu
            // näyttäisi jokaisen myyjän 0 %:ssa ja täyttäisi listan tyhjällä.
            if (tavoite <= 0) return []
            const vauhtiEro = saavutusPct - kulunutPct
            return [{
              laji: m.laji,
              label: m.label,
              yksikko: m.yksikko,
              toteuma,
              tavoite,
              saavutusPct,
              vauhtiEro,
              ennuste: toteuma * kerroin,
              tila: vauhtiTilasta(vauhtiEro),
            }]
          })
        : []

      // Teho on jo laskettu laskeMyyja:ssa normaalityötunneista — ei lasketa uudelleen.
      const tehoTila: TehoTila = s.tyyppi === 'normal' ? tehoTilasta(s.teho, s.tunnit) : 'ei-arviota'

      return {
        nimi: s.nimi,
        tyyppi: s.tyyppi,
        teho: s.teho,
        tehoTila,
        tunnit: s.tunnit,
        leikkuri: s.leikkuri,
        roi: s.roi,
        paivat,
        vertailukelpoinen,
        vertailuSyy,
        mittarit,
      }
    })
    .sort((a, b) => a.teho - b.teho)

  for (const m of myyjat) {
    if (m.tehoTila === 'alle') {
      huomiot.push({
        vakavuus: 'korkea', kohde: m.nimi, laji: 'teho',
        teksti: `${m.nimi} on alle tehojen: ${m.teho.toLocaleString('fi-FI', { maximumFractionDigits: 2 })} €/h, raja ${TEHO_HEIKKO} €/h (${fmtKpl(m.tunnit)} h).`,
      })
    } else if (m.tehoTila === 'rajalla') {
      huomiot.push({
        vakavuus: 'matala', kohde: m.nimi, laji: 'teho',
        teksti: `${m.nimi} on tehorajalla: ${m.teho.toLocaleString('fi-FI', { maximumFractionDigits: 2 })} €/h (${TEHO_HEIKKO}–${TEHO_HYVA} €/h).`,
      })
    } else if (m.tehoTila === 'yli') {
      huomiot.push({
        vakavuus: 'hyva', kohde: m.nimi, laji: 'teho',
        teksti: `${m.nimi} on yli tehojen: ${m.teho.toLocaleString('fi-FI', { maximumFractionDigits: 2 })} €/h, tavoitetaso ${TEHO_HYVA} €/h.`,
      })
    }

    if (m.leikkuri) {
      huomiot.push({
        vakavuus: 'korkea', kohde: m.nimi, laji: 'kannattavuus',
        teksti: `${m.nimi}: työkulu ylittää RJ-Mobin tuoton${m.roi !== null ? ` (ROI ${fmtPct(m.roi)})` : ''}.`,
      })
    }

    if (!vauhtiLuotettava || !m.vertailukelpoinen) continue

    for (const mit of m.mittarit) {
      if (mit.tila === 'aikataulussa') continue
      const suhde = `${fmtPct(mit.saavutusPct)} tavoitteesta kun kuukaudesta on kulunut ${fmtPct(kulunutPct)}`
      const arvio = `ennuste ${fmtArvo(mit.ennuste, mit.yksikko)} / tavoite ${fmtArvo(mit.tavoite, mit.yksikko)}`

      if (mit.tila === 'selvasti-jaljessa') {
        huomiot.push({
          vakavuus: 'korkea', kohde: m.nimi, laji: 'tavoitevauhti',
          teksti: `${m.nimi} selvästi jäljessä run ratesta (${mit.label}): ${suhde} — ${arvio}.`,
        })
      } else if (mit.tila === 'jaljessa') {
        huomiot.push({
          vakavuus: 'keskitaso', kohde: m.nimi, laji: 'tavoitevauhti',
          teksti: `${m.nimi} jäljessä run ratesta (${mit.label}): ${suhde} — ${arvio}.`,
        })
      } else {
        huomiot.push({
          vakavuus: 'hyva', kohde: m.nimi, laji: 'tavoitevauhti',
          teksti: `${m.nimi} edellä tavoitevauhtia (${mit.label}): ${suhde} — ${arvio}.`,
        })
      }
    }
  }

  // ---- Myymälät ----
  //
  // Tavoitteet-välilehdellä on tavoitteet vain myyjille, ei myymälöille, joten
  // myymälän "jäljessä" mitataan edelliseen kuukauteen verraten: ennuste kuun
  // loppuun vs. edellisen kuukauden toteuma. Sama tapa kuin hubin
  // yhteenvedossa.

  const myymalat: MyymalaTila[] = Object.entries(current.stores).map(([nimi, store]) => {
    const edellinen = previous?.stores[nimi] ?? null
    const teho = myymalanTeho(store)

    return {
      nimi,
      // Tehossa käytetään kassaRjmobia (×1) eikä kassaa (×10): myyjän `kassa`
      // on kassaprovisio, myymälän `kassa` on siitä johdettu kassakate. Ilman
      // tätä myymälän teho olisi kymmenkertainen myyjiin nähden eikä "alle
      // tehojen" tarkoittaisi samaa lukua molemmissa.
      teho,
      tehoTila: tehoTilasta(teho, store.tunnit),
      tunnit: store.tunnit,
      vertailut: [
        vertailu('liittymat', 'Liittymät', 'kpl', store.liittKpl, edellinen?.liittKpl ?? null, kerroin, vauhtiLuotettava),
        vertailu('fsecure', 'F-Secure', 'kpl', store.fsecKpl, edellinen?.fsecKpl ?? null, kerroin, vauhtiLuotettava),
        vertailu('kassakate', 'Kassakate', 'eur', store.kassa, edellinen?.kassa ?? null, kerroin, vauhtiLuotettava),
      ],
    }
  }).sort((a, b) => a.teho - b.teho)

  for (const my of myymalat) {
    if (my.tehoTila === 'alle') {
      huomiot.push({
        vakavuus: 'korkea', kohde: my.nimi, laji: 'teho',
        teksti: `${my.nimi} on alle tehojen: ${my.teho.toLocaleString('fi-FI', { maximumFractionDigits: 2 })} €/h, raja ${TEHO_HEIKKO} €/h.`,
      })
    } else if (my.tehoTila === 'yli') {
      huomiot.push({
        vakavuus: 'hyva', kohde: my.nimi, laji: 'teho',
        teksti: `${my.nimi} on yli tehojen: ${my.teho.toLocaleString('fi-FI', { maximumFractionDigits: 2 })} €/h.`,
      })
    }

    for (const v of my.vertailut) {
      if (v.tila === 'jaljessa') {
        huomiot.push({
          vakavuus: 'keskitaso', kohde: my.nimi, laji: 'kuukausivauhti',
          teksti: `${my.nimi} jäämässä jälkeen (${v.label}): ennuste ${fmtArvo(v.ennuste, v.yksikko)} vs. edellinen kuukausi ${fmtArvo(v.edellinen!, v.yksikko)} (${fmtPct(v.muutosPct!)}).`,
        })
      } else if (v.tila === 'edella') {
        huomiot.push({
          vakavuus: 'hyva', kohde: my.nimi, laji: 'kuukausivauhti',
          teksti: `${my.nimi} ylittämässä edellisen kuukauden (${v.label}): ennuste ${fmtArvo(v.ennuste, v.yksikko)} vs. ${fmtArvo(v.edellinen!, v.yksikko)} (${fmtPct(v.muutosPct!)}).`,
        })
      }
    }
  }

  // ---- Koko yritys ----
  //
  // Kentät ovat samat joita hubin RJ-Mob-paneeli näyttää (liittKpl, kassa,
  // fsecKpl), jotta yhteenveto ja hub eivät voi kertoa eri lukua samasta
  // kuukaudesta.

  const yritys: Vertailu[] = [
    vertailu('liittymat', 'Liittymät', 'kpl', current.totals.liittKpl, previous?.totals.liittKpl ?? null, kerroin, vauhtiLuotettava),
    vertailu('fsecure', 'F-Secure', 'kpl', current.totals.fsecKpl, previous?.totals.fsecKpl ?? null, kerroin, vauhtiLuotettava),
    vertailu('kassakate', 'Kassakate', 'eur', current.totals.kassa, previous?.totals.kassa ?? null, kerroin, vauhtiLuotettava),
  ]

  for (const v of yritys) {
    if (v.tila === 'jaljessa') {
      huomiot.push({
        vakavuus: 'korkea', kohde: 'RJ-Mob', laji: 'kuukausivauhti',
        teksti: `Koko RJ-Mob jäämässä jälkeen (${v.label}): ennuste ${fmtArvo(v.ennuste, v.yksikko)} vs. edellinen kuukausi ${fmtArvo(v.edellinen!, v.yksikko)} (${fmtPct(v.muutosPct!)}).`,
      })
    } else if (v.tila === 'edella') {
      huomiot.push({
        vakavuus: 'hyva', kohde: 'RJ-Mob', laji: 'kuukausivauhti',
        teksti: `Koko RJ-Mob ylittämässä edellisen kuukauden (${v.label}): ennuste ${fmtArvo(v.ennuste, v.yksikko)} vs. ${fmtArvo(v.edellinen!, v.yksikko)} (${fmtPct(v.muutosPct!)}).`,
      })
    }
  }

  huomiot.sort((a, b) => VAKAVUUS_JARJESTYS[a.vakavuus] - VAKAVUUS_JARJESTYS[b.vakavuus])

  return {
    kuukausi: monthLabelOf(currentFile.name!),
    edellinenKuukausi: previousFile ? monthLabelOf(previousFile.name!) : null,
    paiva: aika.paiva,
    paiviaKuukaudessa: aika.paiviaKuukaudessa,
    tyopaiviaKulunut: aika.tyopaiviaKulunut,
    tyopaiviaYhteensa: aika.tyopaiviaYhteensa,
    kulunutPct,
    kuukausiKesken: aika.kuukausiKesken,
    vauhtiLuotettava,
    tavoitteetPuuttuvat: targetsData === null,
    huomiot,
    myyjat,
    myymalat,
    yritys,
  }
}

// ---- Välimuisti ----

export const RJMOB_INSIGHTS_KEY = 'rjmob:insights'

const TTL_SECONDS = 6 * 60 * 60

/**
 * Oletusaikakatkaisu 15 s ei riitä: yhteenveto lataa kolme taulukkoa
 * (kuluva kuukausi kahdesti eri välilehdiltä ja edellinen kuukausi), ja
 * jokainen niistä tekee useita Sheets-kutsuja.
 */
const TIMEOUT_MS = 60_000

/**
 * Sivun ainoa sisäänkäynti. Tuore välimuisti palautuu heti, kaatunut haku
 * palauttaa vanhentuneen datan virheen sijaan, ja cron pitää avaimen
 * lämpimänä niin ettei kukaan joudu odottamaan taulukkohakua.
 */
export function getRjMobInsights(): Promise<Fetched<RjMobInsights>> {
  return fetchAndCache(
    { key: RJMOB_INSIGHTS_KEY, ttl: TTL_SECONDS, timeout: TIMEOUT_MS },
    buildRjMobInsights,
  )
}

/** Ajastetun työn kirjoituskohta: hakee lähteestä vaikka välimuisti olisi tuore. */
export function refreshRjMobInsights(): Promise<Fetched<RjMobInsights>> {
  return fetchAndCache(
    { key: RJMOB_INSIGHTS_KEY, ttl: TTL_SECONDS, timeout: TIMEOUT_MS, force: true },
    buildRjMobInsights,
  )
}
