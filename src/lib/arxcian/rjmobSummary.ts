import { listSeurantaFiles, monthOrder, SPREADSHEET_MIME } from '@/lib/rjmobDrive'
import { loadDashData, type DashData } from '@/lib/rjmobSheets'
import { haeTavoitteet } from '@/lib/rjmobTavoiteDrive'
import { tyopaivaIkkuna } from '@/lib/rjmobWorkdays'
import { readCached, writeCached, type Fetched } from './cache'
import { todayISOHelsinki } from './time'
import { UUSI_LUKULAHDE_ALKAEN } from '@/lib/rjmobMyymalaTaulukko'

/**
 * RJ-Mobin kuukausiyhteenveto hubin paneelia ja avustajaa varten.
 *
 * Luvut tulevat samasta lähteestä ja saman laskennan läpi kuin
 * tuottoseurannan sivu: myyntiseurantataulukot järjestetään samalla
 * `vuosi × 100 + kuukausi` -säännöllä, ja kentät ovat ne joita sivu
 * itse näyttää yhteenvetolaatoissaan (liittKpl + liittEur, fsecKpl).
 * Näin hubin luku ei voi ajautua eri suuntaan kuin se luku jota sivulla
 * katsotaan — liittymärivi näyttää kappaleet ja provision samana parina kuin
 * tuottoseurannan oma laatta.
 *
 * Kassakate on poikkeus: se luetaan myymälätaulukosta eikä `totals.kassa`sta,
 * koska ne ovat eri asteikkoa. Ks. `kassakateOf`.
 *
 * **Muutosprosentti on ennuste vain kuluvassa kuukaudessa.** Kesken oleva
 * kuukausi on lähes tyhjä alussa, joten kertymän vertaaminen edellisen
 * kuukauden kokonaislukuun näyttäisi romahdusta vaikka myynti kävisi
 * normaalisti — kuun 11. päivänä ero olisi luokkaa −97 %. Siksi kertymä
 * projisoidaan kuukauden loppuun (kertymä / kuluneet päivät × kuukauden
 * päivät) ja vertailu tehdään sillä. Valmis kuukausi on valmis: sen luku on
 * toteuma, `projected` on epätosi eikä kynnystä `MIN_DAYS_FOR_PROJECTION`
 * sovelleta.
 *
 * Välimuistiavaimet:
 *
 * | Avain | Sisältö |
 * |---|---|
 * | `rjmob:summary` | uusin kuukausi, TTL 6 h — kertymä kasvaa päivän mittaan |
 * | `rjmob:summary:v4:<YYYY-MM>` | valmis kuukausi, TTL vuosi — luvut eivät enää muutu |
 * | `rjmob:summary:months` | saatavilla olevat kuukaudet, uusin ensin |
 *
 * Kuluva kuukausi pysyy tarkoituksella avaimessa `rjmob:summary`: hub lukee
 * sitä suoraan eikä avain saa muuttua. Indeksiavain on avustajaa varten —
 * se saa kertoa miltä kuukausilta dataa löytyy koskematta Driveen.
 */

export const RJMOB_SUMMARY_KEY = 'rjmob:summary'

/** Lista saatavilla olevista kuukausista (YYYY-MM, uusin ensin). */
export const RJMOB_MONTHS_KEY = 'rjmob:summary:months'

const TTL_SECONDS = 6 * 60 * 60

/** Valmiin kuukauden luvut eivät enää muutu, joten avain saa elää vuoden. */
const MONTH_TTL_SECONDS = 365 * 24 * 60 * 60

/** Kuinka monta valmista kuukautta cron pitää lämpimänä kuluvan lisäksi. */
const MAX_HISTORY_MONTHS = 12

/**
 * Kuinka monta työpäivää kuukaudesta on oltava tehtynä ennen kuin ennustetta
 * näytetään lainkaan.
 *
 * Kerroin on kuukauden työpäivät jaettuna kuluneilla, eli ensimmäisenä
 * työpäivänä ×26. Silloin yksi poikkeava päivä — tai taulukon täyttämisen
 * viive — heittää ennusteen moninkertaiseksi, ja etusivu lupaisi lukuja
 * joilla ei ole katetta. Viikon jälkeen kerroin on enää noin ×4 ja luku alkaa
 * kertoa jotain. Koskee vain kuluvaa kuukautta.
 */
const MIN_WORKDAYS_FOR_PROJECTION = 6

/**
 * Kassaprovisiosta kassakatteeseen. Sama luku kuin `KASSAKATE_JAKAJA`
 * [rjmobSheets.ts](../../rjmobSheets.ts):ssä, mutta toiseen suuntaan — ks.
 * `kassakateOf`. Käytössä vain varalähteessä.
 */
const KASSAKATE_KERROIN = 10

export type RjMobMetric = {
  /** Valmiiksi muotoiltu kuukauden kertymä, esim. "342 kpl" tai "6789 €" */
  display: string
  /**
   * Saman rivin tarkentava toinen luku, esim. liittymien provisio euroina.
   *
   * Valinnainen tarkoituksella: välimuistissa jo oleva merkintä on kirjoitettu
   * ilman tätä kenttää, ja avain elää valmiilla kuukausilla vuoden. Paneeli
   * jättää rivin silloin yhden luvun varaan eikä näytä tyhjää riviä.
   */
  sub?: string
  /**
   * Kuukauden loppuun projisoitu luku nykyisellä tahdilla, valmiiksi
   * muotoiltuna — esim. "1157 kpl". Null kun kuukausi on jo valmis (silloin
   * `display` on toteuma) tai kun työpäiviä on liian vähän takana.
   */
  runRate?: string | null
  /** Kuukauden tavoite valmiiksi muotoiltuna, esim. "1200 kpl". */
  target?: string | null
  /**
   * Montako prosenttia tavoitteesta **ennuste** yltää. Ei siis toteuman
   * osuus tavoitteesta: kysymys on "päästäänkö tavoitteeseen tällä tahdilla",
   * ei "paljonko on jo tehty". Null kun tavoitetta tai ennustetta ei ole.
   */
  targetPercent?: number | null
  /** Muutos edelliseen kuukauteen prosentteina, tai null jos vertailua ei ole */
  changePercent: number | null
}

export type RjMobSummaryData = {
  /** Kuukausi koneluettavassa muodossa, esim. "2026-08" */
  month: string
  /** Kuukauden nimi paneelin metatietoon, esim. "Elokuu 2026" */
  monthLabel: string
  /** Onko changePercent laskettu ennusteesta (kuukausi kesken) */
  projected: boolean
  /**
   * Kuukauden työpäivätilanne, ma–la ilman pyhiä
   * ([rjmobWorkdays.ts](../rjmobWorkdays.ts)). Paneeli näyttää tämän
   * ennusteen rinnalla: ilman sitä "1157 kpl kuun loppuun" on luku jonka
   * perustetta lukija ei näe.
   */
  workdays: { elapsed: number; total: number }
  metrics: {
    liittymat: RjMobMetric
    fsecure: RjMobMetric
    kassakate: RjMobMetric
  }
  /**
   * Huomautus kuukausivertailusta, tai puuttuu kun vertailu on suora.
   *
   * Lukulähde vaihtui 1.9.2026 (`UUSI_LUKULAHDE_ALKAEN`), ja sen yli menevä
   * `changePercent` vertaa kahta eri tavalla luettua kuukautta. Ero on pieni
   * mutta olemassa, ja **prosentti ilman huomautusta näyttäisi mitatulta
   * muutokselta** — sama periaate kuin vanhentuneen datan kanssa: vertailu
   * saa olla epätarkka, sen kertomatta jättäminen ei.
   *
   * Valinnainen tarkoituksella: välimuistissa jo oleva merkintä on
   * kirjoitettu ilman tätä kenttää, ja avain elää valmiilla kuukausilla
   * vuoden.
   */
  vertailuHuomio?: string | null
}

/**
 * Kuukauden tavoitteet yhtenä lukukolmikkona.
 *
 * Drive-tavoitetaulukko on **myymäläkohtainen**, joten kuukauden tavoite on
 * viiden myymälän summa — sama rajaus kuin `kassakateOf`in ja `fsecKplOf`in
 * myymälärajaus, eli osoittaja ja nimittäjä kattavat saman joukon.
 * Kassakatteen tavoite on taulukossa alv 0 eli sama suure kuin
 * myymälätaulukon iso kassakateluku; kassaprovisioasteikkoon (÷10) sitä ei
 * saa muuntaa.
 */
type MonthTargets = {
  liittKpl: number
  fsecKpl: number
  kassa: number
}

/**
 * Kuukauden tavoitteet Drivestä, tai null jos niitä ei ole saatavilla.
 *
 * Lähde vaihtui 30.8.2026 myyntiseurantataulukon `Tavoitteet`-välilehdeltä
 * kansioon `ARXCIAN / RJ-Mob / Tavoitteet (kopio)`, ja **hub lukee saman
 * lähteen kuin sivut** — muuten sama prosentti näyttäisi eri lukua hubissa ja
 * Myyntiseurannassa.
 *
 * Puuttuva kuukausitiedosto ei ole virhe vaan tila: vanhemmilla kuukausilla
 * tavoitetta ei ole, ja paneeli näytetään ilman sitä. Virheet niellään
 * samasta syystä kuin ennenkin — tavoite on paneelin lisätieto, eikä sen
 * takia saa jäädä koko kuukauden yhteenvetoa kirjoittamatta.
 */
async function loadMonthTargets(month: string): Promise<MonthTargets | null> {
  const [year, num] = month.split('-').map(Number)
  const nimi = KUUKAUSI_NIMET[num - 1]
  if (!nimi) return null

  try {
    const { yhteensa } = await haeTavoitteet(year * 100 + num, nimi)
    if (yhteensa.liittymat === null && yhteensa.fsecure === null && yhteensa.kassakate === null) return null
    return { liittKpl: yhteensa.liittymat ?? 0, fsecKpl: yhteensa.fsecure ?? 0, kassa: yhteensa.kassakate ?? 0 }
  } catch (error) {
    console.error('[rjmob-summary] tavoitteiden luku epäonnistui', error)
    return null
  }
}

const KUUKAUSI_NIMET = [
  'Tammikuu', 'Helmikuu', 'Maaliskuu', 'Huhtikuu', 'Toukokuu', 'Kesäkuu',
  'Heinäkuu', 'Elokuu', 'Syyskuu', 'Lokakuu', 'Marraskuu', 'Joulukuu',
]

/** "2026-09" -> 202609, sama järjestysluku kuin `monthOrder` tiedostonimestä. */
function kuukausiOrderOf(month: string): number {
  const [vuosi, kk] = month.split('-').map(Number)
  return vuosi * 100 + kk
}

/** Yksi myyntiseurantataulukko kuukausiavaimineen. */
type SeurantaSheet = {
  id: string
  name: string
  /** YYYY-MM */
  month: string
}

/**
 * Avain yhden valmiin kuukauden yhteenvedolle.
 *
 * Versio-osa on avaimessa siksi että valmiin kuukauden merkintä elää vuoden
 * eikä sitä lasketa uudelleen. Kun laskenta korjautuu, vanhat merkinnät eivät
 * korjaudu itsestään: `v2` otettiin käyttöön kun kassakate vaihtui
 * kassaprovisioasteikosta myyntiseurannan asteikkoon (ks. `kassakateOf`), ja
 * `v3` kun liittymät vaihtuivat myyjäsummasta myymälärajaukseen ja `v4` kun
 * tavoitteet siirtyivät Driveen ja työpäivälaskuri rajattiin eiliseen. Nosta
 * versiota aina kun jonkin kentän merkitys muuttuu — vanhat avaimet
 * vanhenevat itse.
 */
export function monthCacheKey(month: string): string {
  return `${RJMOB_SUMMARY_KEY}:v4:${month}`
}

/** Kuluva kuukausi YYYY-MM Helsingin aikaa. */
export function currentMonthKey(): string {
  return todayISOHelsinki().slice(0, 7)
}

/** Edellinen kalenterikuukausi annetusta avaimesta. */
export function previousMonthKey(month: string): string {
  const [year, num] = month.split('-').map(Number)
  return num === 1 ? `${year - 1}-12` : `${year}-${String(num - 1).padStart(2, '0')}`
}

/**
 * Tiedostonimen kuukausiavain, esim. "Myyntiseuranta 8. Elokuu 2026" → "2026-08".
 *
 * Nojaa samaan `monthOrder`-jäsennykseen kuin tiedostojen järjestäminen, jotta
 * avain ja järjestys eivät voi olla eri mieltä kuukaudesta. Nimi jonka
 * järjestysluku ei ole kelvollinen vuosi ja kuukausi jätetään kokonaan pois:
 * ilman kuukautta tiedostoa ei voi nimetä eikä välimuistittaa.
 */
function monthKeyOfFile(name: string): string | null {
  const order = monthOrder(name)
  const year = Math.floor(order / 100)
  const num = order % 100
  if (year < 2000 || num < 1 || num > 12) return null
  return `${year}-${String(num).padStart(2, '0')}`
}

/** "Myyntiseuranta 8. Elokuu 2026" → "Elokuu 2026". */
function monthLabelOf(fileName: string): string {
  const m = fileName.match(/\d{1,3}\.\s*(.+)$/)
  return (m ? m[1] : fileName).trim()
}

/**
 * Kappalemäärä kokonaislukuna ilman tuhaterotinta, esim. "1152".
 *
 * Erotin jätetään pois samasta syystä kuin euroista (`fmtEur`), ja ennen
 * kaikkea siksi että ne ovat samassa sarakkeessa allekkain: "1 152 kpl" ja
 * "11033 €" vierekkäin näyttää siltä että toinen on muotoiltu väärin.
 */
function fmtKpl(n: number): string {
  return String(Math.round(n))
}

/**
 * Euromäärä kokonaisina euroina, esim. "6789 €".
 *
 * Kolme valintaa, kaikki samasta syystä — hubin luku on tarkoitettu
 * vertailtavaksi myyntiseurannan omaan lukuun silmämääräisesti:
 *
 * - **Ei lyhennettä.** "6,8k €" ei kerro täsmääkö luku taulukkoon.
 * - **Sentit leikataan, ei pyöristetä.** Taulukossa lukee 6 789,80 €, ja
 *   leikattuna näkyy 6789 eli samat numerot; pyöristettynä 6790 näyttäisi
 *   eroavan vaikka kyse on samasta luvusta.
 * - **Ei tuhaterotinta.** Näin luku on sama merkkijono jonka Albin lukee
 *   taulukon solusta ilman välilyöntien tulkintaa.
 */
function fmtEur(n: number): string {
  return `${Math.trunc(n)} €`
}

function changeOf(current: number, previous: number, factor: number): number | null {
  if (previous <= 0) return null
  return ((current * factor - previous) / previous) * 100
}

/**
 * Kuukauden liittymät **RJ-Mobin myymälöistä**: kappaleet ja provisio.
 *
 * `totals.liittKpl` ja `totals.liittEur` ovat myyjäsummia, ja myyjätaulukko
 * kattaa koko organisaation myymälät — myyjä lasketaan mukaan siksi että hän
 * on RJ-Mobin myyjä, ei siksi että myynti tapahtui RJ-Mobin myymälässä. Hubin
 * paneeli kertoo myymälöiden tuloksen, joten sama rajaus kuin kassakatteessa
 * ja F-Securessa: viisi myymälää, ständit poistettuina.
 */
function liittymatOf(data: DashData): { kpl: number; eur: number } {
  const stores = Object.values(data.stores)

  if (stores.length === 0) {
    return { kpl: data.totals.liittKpl, eur: data.totals.liittEur }
  }

  return {
    kpl: stores.reduce((sum, store) => sum + store.liittKpl, 0),
    eur: stores.reduce((sum, store) => sum + store.liittEur, 0),
  }
}

/**
 * Kuukauden F-Secure-kappaleet **RJ-Mobin myymälöistä**.
 *
 * `totals.fsecKpl` tuottaa jo tämän saman luvun — se suosii myymälätaulukkoa
 * ja käyttää myyjätaulukkoa vain kun myymälärivit puuttuvat
 * ([rjmobSheets.ts](../../rjmobSheets.ts), kaikki kolme jäsennintä). Rajaus on
 * silti kirjoitettu tähän auki, koska se on hubin oma vaatimus eikä
 * `totals`-kentän lupaus: paneeli kertoo RJ-Mobin viiden myymälän tuloksen,
 * kun myyjätaulukko kattaa koko organisaation myymälät. Näin rajaus ei voi
 * muuttua hiljaa siitä että `totals`in sisäinen valinta joskus vaihtuu.
 */
function fsecKplOf(data: DashData): number {
  const stores = Object.values(data.stores)

  // Sama varalähde ja sama järjestys kuin kassakatteessa. Ilman myymälärivejä
  // myyjätaulukko on ainoa lähde; se on laveampi rajaus mutta oikea suure.
  if (stores.length === 0) return data.totals.fsecKpl

  return stores.reduce((sum, store) => sum + store.fsecKpl, 0)
}

/**
 * Kuukauden kassakate myyntiseurannan asteikolla.
 *
 * **Tämä ei ole `totals.kassa`.** Kassakate ja kassaprovisio ovat kaksi eri
 * asteikkoa, ja ne eroavat kymmenkertaisesti:
 *
 * | Kenttä | Asteikko | Lähde |
 * |---|---|---|
 * | `totals.kassa` (= Σ myyjien `kassa`) | myyjän asteikko ×1 | Myyjät Myymälöittäin -välilehden Kassakate-sarake |
 * | `stores[].kassa` | kassakate ×10 | sama sarake × `KASSAKATE_KERROIN` |
 *
 * Ennen 1.9.2026 myyjän luku tuli Kassamyynti-välilehden `Kate(alv0)`:sta
 * jaettuna kymmenellä — sama asteikko, eri lähde. Asteikkoero säilyy silti:
 * hubin on valittava puoli eikä yhdenmukaistettava kertoimia.
 *
 * Hub näytti aiemmin `totals.kassa`n otsikolla "Kassakate", jolloin luku oli
 * kymmenesosa siitä kassakatteesta jonka myyntiseuranta näyttää: 678,98 €
 * siellä missä taulukossa luki 6 789,80 €. Kerroin on 1.9.2026 alkaen yhtenä
 * nimettynä lukuna
 * [rjmobMyymalaTaulukko.ts](../../rjmobMyymalaTaulukko.ts):n
 * `KASSAKATE_KERROIN`issa; vanhemmilla kuukausilla se on
 * [rjmobSheets.ts](../../rjmobSheets.ts):n `KASSAKATE_JAKAJA` ja
 * `readStores`.
 *
 * Myymälätaulukko on myös oikea rajaus: se kattaa RJ-Mobin viisi myymälää
 * ständimyyjät poistettuina, kun taas myyjätaulukko kattaa koko organisaation
 * myymälät. Hubin paneeli kertoo RJ-Mobin omasta myynnistä.
 */
function kassakateOf(data: DashData): number {
  const stores = Object.values(data.stores)

  // Myymälärivit puuttuvat joistakin käsin ylläpidetyistä kopioista kokonaan.
  // Silloin sama asteikko saadaan myyjien kassaprovisiosta kertomalla, ja se
  // on parempi kuin nolla: nolla näyttäisi siltä että kassaa ei myyty.
  // Rajaus on tällöin laveampi (koko organisaatio), mutta asteikko on oikea.
  if (stores.length === 0) return data.totals.kassa * KASSAKATE_KERROIN

  return stores.reduce((sum, store) => sum + store.kassa, 0)
}

/**
 * Myyntiseurannan taulukot kuukausiavaimineen, uusin ensin.
 *
 * Sama kuukausi kahdesti (esim. kopio samasta taulukosta) pudotetaan: muuten
 * edellisen kuukauden vertailu osuisi samaan kuukauteen ja muutos näyttäisi
 * nollaa. Ensimmäinen voittaa, ja koska `listSeurantaFiles` palauttaa
 * tiedostot muokkausaika edellä, se on tuorein.
 */
async function listMonthlySheets(): Promise<SeurantaSheet[]> {
  const files = await listSeurantaFiles()

  const sheets: SeurantaSheet[] = []
  for (const file of files) {
    if (file.mimeType !== SPREADSHEET_MIME || !file.id || !file.name) continue
    const month = monthKeyOfFile(file.name)
    if (!month) continue
    sheets.push({ id: file.id, name: file.name, month })
  }

  sheets.sort((a, b) => b.month.localeCompare(a.month))

  return sheets.filter((sheet, i) => i === 0 || sheet.month !== sheets[i - 1].month)
}

/** Muistava lataaja: sama taulukko luetaan Sheetsistä kerran per ajo. */
function dashLoader(): (id: string) => Promise<DashData> {
  const started = new Map<string, Promise<DashData>>()
  return id => {
    const existing = started.get(id)
    if (existing) return existing
    const promise = loadDashData(id)
    started.set(id, promise)
    return promise
  }
}

/**
 * Kuluneet ja kaikki työpäivät kuluvassa kuukaudessa, Helsingin aikaa.
 *
 * Työpäivä on ma–la ilman arkipyhiä (`tyopaivaIkkuna`), ja se on nimenomaan
 * se yksikkö jolla ennuste kuuluu tehdä: tavoitteet_ja_runrate_ohje sanoo
 * "tehty tähän mennessä jaettuna kuluneilla työpäivillä … kerrotaan jäljellä
 * olevilla työpäivillä". Kalenteripäivillä laskettu ennuste olisi väärässä
 * joka kuukausi, koska sunnuntait ja pyhät eivät tuota myyntiä mutta
 * kasvattaisivat nimittäjää.
 *
 * Päivä luetaan `todayISOHelsinki`ista eikä `new Date()`stä: palvelin on
 * UTC:ssä, jolloin Suomen ilta olisi vielä edellinen päivä.
 */
function workdayProgress(): { elapsed: number; total: number } {
  const [year, month, day] = todayISOHelsinki().split('-').map(Number)
  // Kuluva päivä ei ole päättynyt: Winpos-tuonti ajetaan klo 8/12/16/20,
  // joten täytenä työpäivänä laskettu tämä päivä sukauttaisi ennusteen joka
  // aamu ja nostaisi sitä iltaa kohti. Sama ikkuna kuin sivuilla
  // (`tyopaivaIkkuna`), tässä vain Helsingin päivästä johdettuna — palvelin
  // on UTC:ssä, jolloin Suomen ilta olisi vielä edellinen päivä.
  const { paattyneet, kaikki } = tyopaivaIkkuna(year, month, new Date(year, month - 1, day))
  return { elapsed: paattyneet, total: kaikki }
}

/** Yhden kuukauden yhteenveto, vertailukohtana järjestyksessä edeltävä taulukko. */
async function summaryFor(
  sheet: SeurantaSheet,
  previousSheet: SeurantaSheet | undefined,
  load: (id: string) => Promise<DashData>,
  targets: MonthTargets | null = null,
): Promise<RjMobSummaryData> {
  const [current, previous] = await Promise.all([
    load(sheet.id),
    previousSheet ? load(previousSheet.id) : Promise.resolve(null),
  ])

  const liittymat = liittymatOf(current)

  // Projisoidaan vain jos taulukko on kuluvalta kalenterikuukaudelta.
  const isRunningMonth = sheet.month === currentMonthKey()
  const workdays = workdayProgress()
  const factor = isRunningMonth ? workdays.total / Math.max(workdays.elapsed, 1) : 1

  // Kesken olevasta kuukaudesta ei näytetä ennustetta ennen kuin kertymää on
  // tarpeeksi. Isot luvut näkyvät silti heti — vain ennuste odottaa.
  const tooEarly = isRunningMonth && workdays.elapsed < MIN_WORKDAYS_FOR_PROJECTION
  const prevData = tooEarly ? null : previous
  const prev = prevData?.totals

  /**
   * Kuukauden loppuun projisoitu luku, tai null kun ennustetta ei näytetä.
   * Valmiissa kuukaudessa `display` on jo toteuma, joten ennuste olisi sama
   * luku kahdesti.
   */
  const runRate = (value: number, fmt: (n: number) => string): string | null =>
    isRunningMonth && !tooEarly ? fmt(value * factor) : null

  /**
   * Ennusteen osuus tavoitteesta. Valmiissa kuukaudessa ennustetta ei ole,
   * jolloin vertailu tehdään toteumalla — silloin luku kertoo osuttiinko
   * tavoitteeseen, mikä on kuukauden jälkeen sama kysymys.
   */
  const targetPct = (value: number, target: number): number | null => {
    if (target <= 0) return null
    if (isRunningMonth && tooEarly) return null
    return ((value * (isRunningMonth ? factor : 1)) / target) * 100
  }

  // Kuukausivertailu 1.9.2026 rajan yli: eri lukutapa molemmin puolin.
  const rajanYli = prevData !== null && previousSheet !== undefined
    && kuukausiOrderOf(sheet.month) >= UUSI_LUKULAHDE_ALKAEN
    && kuukausiOrderOf(previousSheet.month) < UUSI_LUKULAHDE_ALKAEN

  return {
    month: sheet.month,
    monthLabel: monthLabelOf(sheet.name),
    projected: isRunningMonth && Boolean(prev),
    vertailuHuomio: rajanYli
      ? 'Muutos edelliseen kuukauteen: lukulähde vaihtui 1.9.2026, joten jaksot on luettu eri tavalla.'
      : null,
    workdays,
    metrics: {
      liittymat: {
        display: `${fmtKpl(liittymat.kpl)} kpl`,
        runRate: runRate(liittymat.kpl, n => `${fmtKpl(n)} kpl`),
        target: targets ? `${fmtKpl(targets.liittKpl)} kpl` : null,
        targetPercent: targets ? targetPct(liittymat.kpl, targets.liittKpl) : null,
        // Provisio kulkee kappaleiden rinnalla, ei omana rivinään: se on saman
        // myynnin toinen puoli, ja tuottoseurannan laatta näyttää ne samoin.
        // Ennuste ja tavoite lasketaan kappaleista, koska rivi on kappalerivi.
        sub: fmtEur(liittymat.eur),
        changePercent: prev ? changeOf(liittymat.kpl, prev.liittKpl, factor) : null,
      },
      fsecure: {
        display: `${fmtKpl(fsecKplOf(current))} kpl`,
        runRate: runRate(fsecKplOf(current), n => `${fmtKpl(n)} kpl`),
        target: targets ? `${fmtKpl(targets.fsecKpl)} kpl` : null,
        targetPercent: targets ? targetPct(fsecKplOf(current), targets.fsecKpl) : null,
        changePercent: prevData
          ? changeOf(fsecKplOf(current), fsecKplOf(prevData), factor)
          : null,
      },
      kassakate: {
        display: fmtEur(kassakateOf(current)),
        runRate: runRate(kassakateOf(current), fmtEur),
        target: targets ? fmtEur(targets.kassa) : null,
        targetPercent: targets ? targetPct(kassakateOf(current), targets.kassa) : null,
        changePercent: prevData
          ? changeOf(kassakateOf(current), kassakateOf(prevData), factor)
          : null,
      },
    },
  }
}

/**
 * Laskee yhden kuukauden yhteenvedon Drivestä. Oletuksena uusin kuukausi.
 * Kirjoittaa välimuistiin vain `refreshRjMobSummaries`.
 */
export async function buildRjMobSummary(month?: string): Promise<RjMobSummaryData> {
  const sheets = await listMonthlySheets()
  if (sheets.length === 0) throw new Error('Myyntiseurantataulukoita ei löytynyt')

  const index = month ? sheets.findIndex(sheet => sheet.month === month) : 0
  if (index < 0) throw new Error(`Myyntiseurantaa kuukaudelta ${month} ei löytynyt`)

  const targets = await loadMonthTargets(sheets[index].month)

  return summaryFor(sheets[index], sheets[index + 1], dashLoader(), targets)
}

export type RjMobRefreshResult = {
  /** Välimuistissa olevat kuukaudet, uusin ensin */
  months: string[]
  /** Montako kuukautta laskettiin tällä ajolla */
  computed: number
  /** Kuukaudet joiden laskenta epäonnistui */
  failed: string[]
  /**
   * Kaatuiko **uusin** kuukausi, eli se jonka hub näyttää.
   *
   * Erillään `failed`istä siksi, että vanhan kuukauden kaatuminen ei näy
   * hubissa mitenkään: `rjmob:summary` kirjoitetaan vain uusimmasta. Ilman
   * tätä erottelua ajastettu työ kirjaisi onnistuneen haun silloinkin kun
   * juuri se luku jota paneeli näyttää jäi päivittämättä — ja paneeli
   * näyttäisi tuoretta kellonaikaa eilisille luvuille. Se on täsmälleen se
   * vika jonka takia hakuaika ylipäätään näytetään.
   */
  newestFailed: boolean
}

/**
 * Ajastetun työn kirjoituskohta: kuluva kuukausi ja viimeiset valmiit
 * kuukaudet välimuistiin. Sivut ja avustaja lukevat vain välimuistia.
 *
 * **Valmista kuukautta ei lasketa uudelleen jos se on jo välimuistissa.**
 * Yksi `loadDashData` on kolmisen Sheets-kutsua, joten kolmentoista kuukauden
 * uudelleenlaskenta neljästi vuorokaudessa olisi noin 150 kutsua päivässä
 * datasta joka ei enää muutu. Kuluva kuukausi lasketaan joka ajolla.
 *
 * Yhden kuukauden virhe ei kaada työtä: se kirjataan ja muut kuukaudet
 * jatkavat. Vasta kun yhtään kuukautta ei saada, työ epäonnistuu.
 */
export async function refreshRjMobSummaries(): Promise<RjMobRefreshResult> {
  const sheets = await listMonthlySheets()
  if (sheets.length === 0) throw new Error('Myyntiseurantataulukoita ei löytynyt')

  const today = currentMonthKey()
  const load = dashLoader()

  // Tavoitteet luetaan vain uusimmasta kuukaudesta: hub näyttää aina kuluvaa
  // kuukautta, ja jokainen kuukausi on kaksi Drive-listausta ja lataus lisää.
  // Kolmentoista kuukauden tavoitteiden hakeminen neljästi vuorokaudessa
  // olisi satoja kutsuja dataan jota paneeli ei näytä.
  const targets = await loadMonthTargets(sheets[0].month)
  const months: string[] = []
  const failed: string[] = []
  let newestFailed = false
  let computed = 0

  const wanted = sheets.slice(0, MAX_HISTORY_MONTHS + 1)

  for (let i = 0; i < wanted.length; i++) {
    const sheet = wanted[i]
    const isNewest = i === 0
    const isPast = sheet.month < today

    // Muut kuin uusin ja valmiit kuukaudet ohitetaan. Käytännössä tämä
    // tarkoittaa etukäteen luotua tulevan kuukauden taulukkoa: sen luvut ovat
    // tyhjät, eikä tyhjää saa jäädyttää vuodeksi kuukausiavaimeen.
    if (!isNewest && !isPast) continue

    if (!isNewest) {
      const cached = await readCached<RjMobSummaryData>(monthCacheKey(sheet.month))
      if (cached) {
        months.push(sheet.month)
        continue
      }
    }

    try {
      const data = await summaryFor(sheet, sheets[i + 1], load, isNewest ? targets : null)
      computed++

      // Uusin kuukausi menee hubin avaimeen, valmis kuukausi lisäksi omaansa.
      if (isNewest) await writeCached(RJMOB_SUMMARY_KEY, data, TTL_SECONDS)
      if (isPast) await writeCached(monthCacheKey(sheet.month), data, MONTH_TTL_SECONDS)

      // Tuleva kuukausi on luettavissa vain hubin avaimesta, ei kuukausiavaimella.
      if (isPast || sheet.month === today) months.push(sheet.month)
    } catch (error) {
      console.error(`[rjmob-summary] kuukauden ${sheet.month} laskenta epäonnistui`, error)
      failed.push(sheet.month)
      if (isNewest) newestFailed = true
    }
  }

  if (months.length === 0) {
    throw new Error(`RJ-Mobin yhteenvetoa ei saatu yhdeltäkään kuukaudelta (${failed.join(', ')})`)
  }

  await writeCached(RJMOB_MONTHS_KEY, months, MONTH_TTL_SECONDS)

  return { months, computed, failed, newestFailed }
}

/**
 * Yhden kuukauden yhteenveto välimuistista. Ei hae Drivestä — avustaja ja
 * sivut näkevät vain sen minkä cron on kirjoittanut.
 */
export async function readRjMobSummary(month: string): Promise<Fetched<RjMobSummaryData> | null> {
  if (month === currentMonthKey()) {
    const newest = await readCached<RjMobSummaryData>(RJMOB_SUMMARY_KEY)
    // Uusin taulukko ei aina ole kuluvalta kuukaudelta: jos uutta ei ole vielä
    // luotu, hubin avaimessa on edellinen kuukausi eikä se kelpaa vastaukseksi
    // tästä kuusta. Vanha merkintä ilman month-kenttää tulkitaan uusimmaksi.
    if (newest && (!newest.data.month || newest.data.month === month)) return newest
  }
  return readCached<RjMobSummaryData>(monthCacheKey(month))
}

/** Kuukaudet joilta yhteenveto löytyy välimuistista, uusin ensin. */
export async function readRjMobMonths(): Promise<string[]> {
  const cached = await readCached<string[]>(RJMOB_MONTHS_KEY)
  return cached?.data ?? []
}

const MONTH_STEMS = [
  'tammi',
  'helmi',
  'maalis',
  'huhti',
  'touko',
  'kes[äa]',
  'hein[äa]',
  'elo',
  'syys',
  'loka',
  'marras',
  'joulu',
]

const MONTH_NAME_RE = new RegExp(`(${MONTH_STEMS.join('|')})kuu`)

/**
 * Tulkitsee avustajan antaman kuukausiviitteen avaimeksi YYYY-MM.
 *
 * Hyväksyy tyhjän ("kuluva kuu"), sanat kuten "previous" ja "viime kuu",
 * muodon YYYY-MM sekä suomenkielisen kuukauden nimen taivutettunakin
 * ("kesäkuun", "elokuussa"). Ilman vuosilukua nimi tarkoittaa lähintä
 * mennyttä kyseistä kuukautta — kuluva kuukausi mukaan lukien, koska
 * "elokuu" elokuussa tarkoittaa tätä elokuuta eikä viime vuoden.
 *
 * Nimi tunnistetaan ennen sanaa "viime", jotta "viime kesäkuu" osuu kesäkuuhun
 * eikä edelliseen kuukauteen. Palauttaa null kun mitään ei tunnisteta —
 * arvaus olisi pahempi kuin kysymys, koska vastaus näyttää luvuilta.
 */
export function parseMonthInput(raw: string, today = currentMonthKey()): string | null {
  const text = raw.trim().toLowerCase()
  if (text === '') return today

  // Päivä sallitaan lopussa: malli voi antaa kokonaisen päivämäärän.
  const iso = text.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/)
  if (iso) {
    const num = Number(iso[2])
    if (num < 1 || num > 12) return null
    return `${iso[1]}-${String(num).padStart(2, '0')}`
  }

  const named = text.match(MONTH_NAME_RE)
  if (named) {
    const num = MONTH_STEMS.findIndex(stem => new RegExp(`^${stem}$`).test(named[1])) + 1
    if (num < 1) return null
    const [thisYear, thisMonth] = today.split('-').map(Number)
    const year = text.match(/\b(\d{4})\b/)
    // Ilman vuotta: tuleva kuukausi tarkoittaa viime vuotta, muu tätä vuotta.
    const resolved = year ? Number(year[1]) : num > thisMonth ? thisYear - 1 : thisYear
    return `${resolved}-${String(num).padStart(2, '0')}`
  }

  if (/(previous|last|viime|edellis|edellin)/.test(text)) return previousMonthKey(today)
  if (/(current|this|now|t[äa]m[äa]|kuluva|nykyinen|nyt)/.test(text)) return today

  return null
}
