import { google } from 'googleapis'
import { haeTavoitteet, type TavoiteHaku } from '@/lib/rjmobTavoiteDrive'
import { monthOrder } from '@/lib/rjmobDrive'
import { tyopaivaIkkuna, viimeinenPaattynytPaiva, type TyopaivaIkkuna } from '@/lib/rjmobWorkdays'
import { myyjaSarakkeet } from '@/lib/shifts/tyovuoroExcel'
import { toteutuneetPaivat, toteumaIkkunat, yhdistaVuorot } from '@/lib/rjmobToteutuneetPaivat'
import { lueRuudukko } from '@/lib/shifts/tyovuoroDrive'
import { jasennaLahtiVuorot, LAHTI_VALILEHTI, type LahtiVuoro } from '@/lib/shifts/lahtiVuorot'
import { tapahtumaOikaisut, type TapahtumaRunRate } from '@/lib/rjmobTapahtumaRunRate'
import { todayISOHelsinki } from '@/lib/arxcian/time'

/** Ennuste käyttää tehtyjä päiviä myyntiseurannasta ja tulevia vuoroja
 * ajantasaisesta Drive-taulukosta. Toteumamyynti tulee /api/sheetsistä. */

export type MyyjaIkkuna = { paattyneet: number; kaikki: number }

export type RunRateData = {
  /** Myyntiseurantatiedoston nimi, esim. "Myyntiseuranta 8. Elokuu 2026". */
  kuukausi: string
  kuukausiOrder: number
  /** Myymälätason työpäivät: ma–la ilman pyhiä, raja eilisessä. */
  tyopaivat: TyopaivaIkkuna
  tavoitteet: TavoiteHaku
  /** Myyjä → omat vuorot. Tyhjä kun kuukauden työvuorolistaa ei ole. */
  myyjaVuorot: Record<string, MyyjaIkkuna>
  tapahtumat?: TapahtumaRunRate
  /** Näytettävät varoitukset, tavoitteiden omat mukaan lukien. */
  varoitukset: string[]
}

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!),
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

/** "2026-08" ja "2026-08-27" järjestysluvusta ja työpäiväikkunasta. */
function kuukausiAvain(order: number): string {
  return `${Math.floor(order / 100)}-${String(order % 100).padStart(2, '0')}`
}

/**
 * Tämä päivä Helsingin aikaa paikallisena `Date`inä.
 *
 * Palvelin on UTC:ssä, joten Suomen aamuyö olisi `new Date()`llä vielä
 * edellinen päivä — ja "päättyneet työpäivät" hyppäisi yhdellä joka yö klo
 * 00–03. Sama valinta kuin hubin `workdayProgress`issa.
 */
function nytHelsingissa(): Date {
  const [vuosi, kuukausi, paiva] = todayISOHelsinki().split('-').map(Number)
  return new Date(vuosi, kuukausi - 1, paiva)
}

const KUUKAUDET = [
  'Tammikuu', 'Helmikuu', 'Maaliskuu', 'Huhtikuu', 'Toukokuu', 'Kesäkuu',
  'Heinäkuu', 'Elokuu', 'Syyskuu', 'Lokakuu', 'Marraskuu', 'Joulukuu',
]

/**
 * Kuukauden run rate -pohjadata myyntiseurantatiedoston id:llä.
 *
 * Kuukausi luetaan **tiedoston nimestä palvelimella** eikä oteta parametrina:
 * selaimen valitsema tiedosto ja palvelimen lukema kuukausi olisivat muuten
 * kaksi eri asiaa, ja tavoitteet voisivat olla eri kuulta kuin toteumat.
 */
export async function loadRunRate(fileId: string, now: Date = nytHelsingissa()): Promise<RunRateData> {
  const drive = google.drive({ version: 'v3', auth: getAuth() })
  const meta = await drive.files.get({ fileId, fields: 'name' })
  const kuukausi = meta.data.name ?? ''
  const order = monthOrder(kuukausi)
  const vuosi = Math.floor(order / 100)
  const kuukausiNro = order % 100

  if (vuosi < 2000 || kuukausiNro < 1 || kuukausiNro > 12) {
    throw new Error(`Kuukautta ei tunnistettu tiedostonimestä "${kuukausi}"`)
  }

  // Kuukauden nimi tarvitaan tavoitetaulukon sarakeotsikkoa varten
  // ("Elokuun tavoite"). Se johdetaan järjestysluvusta eikä poimita
  // myyntiseurannan tiedostonimestä, jonka kirjoitusasu on ihmisen käsissä.
  const kuukausiNimi = KUUKAUDET[kuukausiNro - 1]

  const varoitukset: string[] = []

  const [tavoitteet, vuorot, toteumaPaivat] = await Promise.all([
    haeTavoitteet(order, kuukausiNimi),
    lueVuorot(kuukausiAvain(order)).catch(() => {
      varoitukset.push('Ajantasaista työvuorolistaa ei voitu lukea — myyjien ennuste puuttuu')
      return null
    }),
    google.sheets({ version: 'v4', auth: getAuth() }).spreadsheets.values.get({
      spreadsheetId: fileId, range: "'data'!A1:AZ200",
    }).then(r => toteutuneetPaivat((r.data.values ?? []).map(row => row.map(String)))).catch(() => {
      varoitukset.push('Toteutuneita työpäiviä ei voitu lukea — myyjien ennuste puuttuu')
      return {} as Record<string, number>
    }),
  ])

  const myyjaVuorot = vuorot === null ? {} : toteumaIkkunat(vuorot, toteumaPaivat, viimeinenPaattynytPaiva(order, now))

  if (Object.keys(myyjaVuorot).length === 0) {
    varoitukset.push(`Kuukaudelle ${kuukausiNimi} ei löytynyt riittäviä työpäivätietoja — myyjien ennustetta ei voi laskea`)
  }

  return {
    kuukausi,
    kuukausiOrder: order,
    tyopaivat: tyopaivaIkkuna(vuosi, kuukausiNro, now),
    tavoitteet,
    myyjaVuorot,
    tapahtumat: tapahtumaOikaisut(order, viimeinenPaattynytPaiva(order, now), [], vuorot ?? []),
    varoitukset: [...tavoitteet.varoitukset, ...varoitukset],
  }
}

/** Ajantasaiset vuorot luetaan suoraan kuukauden Drive-taulukosta. */
async function lueVuorot(kuukausi: string): Promise<LahtiVuoro[]> {
  const [vuosi, kk] = kuukausi.split('-').map(Number)
  const [pk, lahti] = await Promise.all([
    lueRuudukko(vuosi, kk).then(({ rivit }) => jasennaLahtiVuorot(rivit, vuosi, kk, myyjaSarakkeet(vuosi, kk))),
    lueRuudukko(vuosi, kk, LAHTI_VALILEHTI).then(({ rivit }) => jasennaLahtiVuorot(rivit, vuosi, kk)),
  ])
  return yhdistaVuorot(pk, lahti)
}
