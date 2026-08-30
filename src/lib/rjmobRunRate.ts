import { google } from 'googleapis'
import { haeTavoitteet, type TavoiteHaku } from '@/lib/rjmobTavoiteDrive'
import { monthOrder } from '@/lib/rjmobDrive'
import { tyopaivaIkkuna, viimeinenPaattynytPaiva, type TyopaivaIkkuna } from '@/lib/rjmobWorkdays'
import { laskeVuoroIkkuna } from '@/lib/shiftSchedule'
import { lueLista } from '@/lib/shifts/shiftStore'
import { todayISOHelsinki } from '@/lib/arxcian/time'

/**
 * Run rate -näkymän palvelinpuolen kokoaja.
 *
 * Kolme lähdettä, kolme eri syytä olla erikseen:
 *
 * | Lähde | Antaa |
 * |---|---|
 * | Drive `Tavoitteet (kopio)` | kuukauden tavoitteet myymälöittäin ja myyjittäin |
 * | `rjmobWorkdays` | myymälän aukiolopäivät, raja eilisessä |
 * | työvuorolista (KV) | myyjän omat vuorot, raja eilisessä |
 *
 * Toteumat **eivät** kulje tästä: ne tulevat sivulle jo `/api/sheets`istä ja
 * `/api/targets`ista. Kahdesti luettuina ne voisivat olla eri kuukaudelta
 * kuin tavoitteet, ja lisäksi tämä reitti luetaan ilman välimuistia — sama
 * työ tehtäisiin turhaan uudelleen.
 */

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
  /** Näytettävät varoitukset, tavoitteiden omat mukaan lukien. */
  varoitukset: string[]
}

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
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

  const [tavoitteet, myyjaVuorot] = await Promise.all([
    haeTavoitteet(order, kuukausiNimi),
    lueVuorot(kuukausiAvain(order), viimeinenPaattynytPaiva(order, now)).catch(e => {
      varoitukset.push(`Työvuorolistaa ei voitu lukea: ${e instanceof Error ? e.message : String(e)}`)
      return {} as Record<string, MyyjaIkkuna>
    }),
  ])

  if (Object.keys(myyjaVuorot).length === 0) {
    varoitukset.push(`Kuukaudelle ${kuukausiNimi} ei ole vahvistettua työvuorolistaa — myyjien ennustetta ei voi laskea`)
  }

  return {
    kuukausi,
    kuukausiOrder: order,
    tyopaivat: tyopaivaIkkuna(vuosi, kuukausiNro, now),
    tavoitteet,
    myyjaVuorot,
    varoitukset: [...tavoitteet.varoitukset, ...varoitukset],
  }
}

async function lueVuorot(kuukausi: string, viimeinen: string): Promise<Record<string, MyyjaIkkuna>> {
  return laskeVuoroIkkuna(await lueLista('final', kuukausi), viimeinen)
}
