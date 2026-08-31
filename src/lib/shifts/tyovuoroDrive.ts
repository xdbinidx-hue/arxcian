// Työvuorolista-taulukon Drive-puoli: tiedoston etsintä ja ruudukon luku.
//
// Kaikki taulukon rakenteen tulkinta on [tyovuoroExcel.ts](src/lib/shifts/tyovuoroExcel.ts):ssä,
// joka on puhdas ja testattavissa ilman verkkoa. Tämä tiedosto vain hakee
// solut ja antaa ne sille.
//
// **Luku ja kirjoitus pidetään erillään** samaan tapaan kuin
// [rjmobDrive.ts](src/lib/rjmobDrive.ts):ssä: tämä moduuli käyttää vain
// readonly-scopea, jolloin bugi lukupuolella ei voi rikkoa lähdedataa.
import { google } from 'googleapis'
import * as XLSX from 'xlsx'
import { monthOrder, SPREADSHEET_MIME, type DriveFile } from '../rjmobDrive'
import { jasennaTyovuorotaulukko } from './tyovuoroExcel'
import type { KuukaudenSyote } from '../shiftSchedule'

/** RJ-Mob → Työvuorolista. Palvelutili on tähän kansioon Muokkaaja. */
export const TYOVUOROLISTA_FOLDER_ID = '1TQbm2sYst8Bz_Z1WoZm0lEasM6fTrTKT'

/** Luettava alue: sarakkeet A–BA kattaa Tapahtumat (AR) ja Toiveet (AU),
 *  rivit 1–40 kattaa päivärivit (4–34) mutta ei Huoltolistaa (37–68). */
const LUKUALUE = 'A1:BA40'

function readAuth() {
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!),
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ],
  })
}

/**
 * Kuukauden tiedosto Työvuorolista-kansiosta.
 *
 * Tiedostonimi on muotoa "Työvuorot 9. Syyskuu 2026", ja kuukausi
 * tunnistetaan `monthOrder`illa eli **samalla `vuosi × 100 + kuukausi`
 * -säännöllä** jota tuottoseuranta ja hubin yhteenveto käyttävät. Yksi
 * sääntö kaikkialla tarkoittaa ettei kuukausivalinta voi ajautua eri
 * suuntaan eri sivuilla.
 */
export async function etsiKuukaudenTiedosto(
  vuosi: number, kuukausi: number,
): Promise<DriveFile | null> {
  const drive = google.drive({ version: 'v3', auth: readAuth() })
  const res = await drive.files.list({
    q: `'${TYOVUOROLISTA_FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, modifiedTime)',
    orderBy: 'modifiedTime desc',
  })
  const haettu = vuosi * 100 + kuukausi
  return (res.data.files ?? []).find(f => monthOrder(f.name ?? '') === haettu) ?? null
}

export interface Ruudukko {
  tiedosto: DriveFile
  /** Ensimmäisen välilehden nimi (yleensä "Taulukko1"). */
  valilehti: string
  /** Solut tekstinä. Indeksi 0 = rivi 1. */
  rivit: string[][]
}

/**
 * Lue kuukauden taulukko soluruudukoksi.
 *
 * Tiedosto voi olla joko natiivi Google Sheet tai Driveen tallennettu
 * .xlsx, joten tyyppi tarkistetaan ajossa eikä oleteta kumpaakaan.
 *
 * Välilehti valitaan oletuksena **ensimmäisenä järjestyksessä** eikä nimellä:
 * nimi voi vaihtua, järjestys ei. Se valinta pelasti lukijan 31.8.2026, kun
 * `Taulukko1` jaettiin välilehdiksi `PK-SEUTU` ja `LAHTI` — PK-luku jatkoi
 * toimintaansa muuttumatta.
 *
 * `valilehtiNimi` on sitä varten että **toinen** välilehti voidaan lukea
 * nimellä. Lahden vuorot ovat samassa työkirjassa omalla välilehdellään, ja
 * järjestys ei voi erottaa niitä toisistaan. Puuttuva välilehti ei ole virhe
 * vaan tyhjä ruudukko: LAHTI-välilehteä ei ole vanhemmissa kuukausissa, eikä
 * sen puuttuminen saa kaataa PK-lukua.
 */
export async function lueRuudukko(
  vuosi: number, kuukausi: number, valilehtiNimi?: string,
): Promise<Ruudukko> {
  const tiedosto = await etsiKuukaudenTiedosto(vuosi, kuukausi)
  if (!tiedosto?.id) {
    throw new Error(
      `Kuukauden ${kuukausi}/${vuosi} työvuorotiedostoa ei löydy Drive-kansiosta. `
      + 'Luo se itse kansioon (esim. "Työvuorot 9. Syyskuu 2026") — '
      + 'tiedostoa ei luoda automaattisesti, koska väärään paikkaan luotu '
      + 'tiedosto on pahempi kuin puuttuva.',
    )
  }

  if (tiedosto.mimeType === SPREADSHEET_MIME) {
    const sheets = google.sheets({ version: 'v4', auth: readAuth() })
    const meta = await sheets.spreadsheets.get({ spreadsheetId: tiedosto.id })
    const nimet = (meta.data.sheets ?? []).map(s => s.properties?.title ?? '').filter(Boolean)
    if (nimet.length === 0) throw new Error('Taulukossa ei ole yhtään välilehteä')

    const valilehti = valilehtiNimi
      ? nimet.find(n => n.toLowerCase() === valilehtiNimi.toLowerCase())
      : nimet[0]
    if (!valilehti) return { tiedosto, valilehti: '', rivit: [] }

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: tiedosto.id,
      range: `'${valilehti}'!${LUKUALUE}`,
    })
    const rivit = (res.data.values ?? []).map(r => r.map(c => (c ?? '').toString()))
    return { tiedosto, valilehti, rivit }
  }

  // .xlsx (tai muu Excel-muoto): ladataan tavut ja luetaan SheetJS:llä.
  const drive = google.drive({ version: 'v3', auth: readAuth() })
  const res = await drive.files.get(
    { fileId: tiedosto.id, alt: 'media' },
    { responseType: 'arraybuffer' },
  )
  const wb = XLSX.read(Buffer.from(res.data as ArrayBuffer), { type: 'buffer' })
  if (wb.SheetNames.length === 0) throw new Error('Taulukossa ei ole yhtään välilehteä')
  const valilehti = valilehtiNimi
    ? wb.SheetNames.find(n => n.toLowerCase() === valilehtiNimi.toLowerCase())
    : wb.SheetNames[0]
  // Sama sääntö kuin natiivilla taulukolla: pyydettyä välilehteä ei ole =
  // tyhjä ruudukko, ei virhe.
  if (!valilehti) return { tiedosto, valilehti: '', rivit: [] }
  const rivit = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[valilehti], {
    header: 1, raw: false, defval: '', blankrows: true,
  })
  return { tiedosto, valilehti, rivit: rivit.map(r => r.map(c => (c ?? '').toString())) }
}

export interface LuettuKuukausi {
  syote: KuukaudenSyote
  tiedosto: DriveFile
  valilehti: string
}

/** Lue kuukauden tapahtumat, onnenpäivät ja poissaolot generaattorin syötteeksi. */
export async function lueKuukaudenSyote(vuosi: number, kuukausi: number): Promise<LuettuKuukausi> {
  const { tiedosto, valilehti, rivit } = await lueRuudukko(vuosi, kuukausi)
  return { syote: jasennaTyovuorotaulukko(rivit, vuosi, kuukausi), tiedosto, valilehti }
}
