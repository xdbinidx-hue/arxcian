import { listSeurantaFiles, monthOrder, SPREADSHEET_MIME } from '@/lib/rjmobDrive'
import { loadDashData } from '@/lib/rjmobSheets'
import { writeCached } from './cache'

/**
 * RJ-Mobin kuukausiyhteenveto hubin paneelia varten.
 *
 * Luvut tulevat samasta lähteestä ja saman laskennan läpi kuin
 * tuottoseurannan sivu: uusin myyntiseurantataulukko valitaan samalla
 * `vuosi × 100 + kuukausi` -järjestyksellä, ja kentät ovat ne joita sivu
 * itse näyttää yhteenvetolaatoissaan (liittKpl, kassa, fsecKpl). Näin hubin
 * luku ei voi ajautua eri suuntaan kuin se luku jota sivulla katsotaan.
 *
 * **Muutosprosentti on ennuste, ei toteuma.** Hub näyttää aina kuluvaa
 * kuukautta, joka on lähes aina kesken, joten kertymän vertaaminen edellisen
 * kuukauden kokonaislukuun näyttäisi romahdusta vaikka myynti kävisi
 * normaalisti — kuun 11. päivänä ero olisi luokkaa −97 %. Siksi kertymä
 * projisoidaan kuukauden loppuun (kertymä / kuluneet päivät × kuukauden
 * päivät) ja vertailu tehdään sillä. Kun taulukko ei ole kuluvalta
 * kalenterikuukaudelta, kuukausi on valmis eikä mitään projisoida.
 */

export const RJMOB_SUMMARY_KEY = 'rjmob:summary'

const TTL_SECONDS = 6 * 60 * 60

/**
 * Kuinka monta päivää kuukaudesta on oltava kulunut ennen kuin ennustetta
 * näytetään lainkaan.
 *
 * Kerroin on kuukauden päivät jaettuna kuluneilla, eli kuun 1. päivänä ×31.
 * Silloin yksi poikkeava päivä — tai taulukon täyttämisen viive — heiluttaa
 * prosenttia satoja yksiköitä, ja etusivu näyttäisi romahdusta tai raketin
 * nousua ilman että kummallakaan on katetta. Viikon jälkeen kerroin on enää
 * noin ×4 ja luku alkaa kertoa jotain.
 */
const MIN_DAYS_FOR_PROJECTION = 7

export type RjMobMetric = {
  /** Valmiiksi muotoiltu kuluvan kuukauden kertymä, esim. "342" tai "18,9k €" */
  display: string
  /** Muutos edelliseen kuukauteen prosentteina, tai null jos vertailua ei ole */
  changePercent: number | null
}

export type RjMobSummaryData = {
  /** Kuukauden nimi paneelin metatietoon, esim. "Elokuu 2026" */
  monthLabel: string
  /** Onko changePercent laskettu ennusteesta (kuukausi kesken) */
  projected: boolean
  metrics: {
    liittymat: RjMobMetric
    kassakate: RjMobMetric
    fsecure: RjMobMetric
  }
}

/** "Myyntiseuranta 8. Elokuu 2026" → "Elokuu 2026". */
function monthLabelOf(fileName: string): string {
  const m = fileName.match(/\d{1,3}\.\s*(.+)$/)
  return (m ? m[1] : fileName).trim()
}

function fmtKpl(n: number): string {
  return Math.round(n).toLocaleString('fi-FI')
}

/** Euromäärä lyhyesti: yli tuhat näytetään "18,9k €", muuten kokonaisina. */
function fmtEur(n: number): string {
  if (Math.abs(n) >= 1000) {
    return `${(n / 1000).toLocaleString('fi-FI', { maximumFractionDigits: 1 })}k €`
  }
  return `${Math.round(n).toLocaleString('fi-FI')} €`
}

function changeOf(current: number, previous: number, factor: number): number | null {
  if (previous <= 0) return null
  return ((current * factor - previous) / previous) * 100
}

export async function buildRjMobSummary(): Promise<RjMobSummaryData> {
  const files = await listSeurantaFiles()
  const sheets = files
    .filter(f => f.mimeType === SPREADSHEET_MIME && f.id && f.name)
    .sort((a, b) => monthOrder(b.name!) - monthOrder(a.name!))

  if (sheets.length === 0) throw new Error('Myyntiseurantataulukoita ei löytynyt')

  const currentFile = sheets[0]
  const previousFile = sheets[1]

  const [current, previous] = await Promise.all([
    loadDashData(currentFile.id!),
    previousFile ? loadDashData(previousFile.id!) : Promise.resolve(null),
  ])

  // Projisoidaan vain jos taulukko on kuluvalta kalenterikuukaudelta.
  const now = new Date()
  const thisMonthOrder = (now.getFullYear() * 100) + (now.getMonth() + 1)
  const isRunningMonth = monthOrder(currentFile.name!) === thisMonthOrder

  const daysElapsed = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const factor = isRunningMonth ? daysInMonth / Math.max(daysElapsed, 1) : 1

  // Kesken olevasta kuukaudesta ei näytetä vertailua ennen kuin kertymää on
  // tarpeeksi. Isot luvut näkyvät silti heti — vain muutosprosentti odottaa.
  const tooEarly = isRunningMonth && daysElapsed < MIN_DAYS_FOR_PROJECTION
  const prev = tooEarly ? undefined : previous?.totals

  return {
    monthLabel: monthLabelOf(currentFile.name!),
    projected: isRunningMonth && Boolean(prev),
    metrics: {
      liittymat: {
        display: fmtKpl(current.totals.liittKpl),
        changePercent: prev ? changeOf(current.totals.liittKpl, prev.liittKpl, factor) : null,
      },
      kassakate: {
        display: fmtEur(current.totals.kassa),
        changePercent: prev ? changeOf(current.totals.kassa, prev.kassa, factor) : null,
      },
      fsecure: {
        display: `${fmtKpl(current.totals.fsecKpl)} kpl`,
        changePercent: prev ? changeOf(current.totals.fsecKpl, prev.fsecKpl, factor) : null,
      },
    },
  }
}

/** Ajastetun työn kirjoituskohta. Sivu lukee vain välimuistia. */
export async function refreshRjMobSummary(): Promise<RjMobSummaryData> {
  const data = await buildRjMobSummary()
  await writeCached(RJMOB_SUMMARY_KEY, data, TTL_SECONDS)
  return data
}
