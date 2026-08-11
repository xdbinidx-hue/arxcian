import { google } from 'googleapis'

// "Myyntiseuranta (kopio)" (nimi muuttunut "Myyntiseuranta (julkinen)" -> "(kopio)" 26.7.2026,
// mutta kansion oma ID pysyi samana — nimenmuutos ei vaadi ID:n päivitystä).
const FOLDER_ID = '1QKY-rxqFQwbfK9saX5fvhVIixrv_9kYz'

export type DriveFile = {
  id?: string | null
  name?: string | null
  mimeType?: string | null
  modifiedTime?: string | null
}

export const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet'

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!),
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ],
  })
}

/**
 * Myyntiseurannan tiedostot Drivestä, uusin muokkaus ensin.
 *
 * Siirretty /api/files-reitiltä kirjastoon, jotta ajastettu työ voi listata
 * tiedostot palvelimella ilman istuntoa. Logiikkaa ei muutettu.
 */
export async function listSeurantaFiles(): Promise<DriveFile[]> {
  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })

  // Myyntiseurannan juurikansiossa on vuosikansio(t) (esim. "2026") — kaikki vuodet listataan
  // ja yhdistetään samaan tapaan kuin api/receipts, ei kovakoodata vain yhtä vuosikansiota.
  const yearFoldersRes = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  })
  const yearFolders = yearFoldersRes.data.files ?? []

  let files: DriveFile[]
  if (yearFolders.length > 0) {
    const perYear = await Promise.all(
      yearFolders.map(async yf => {
        const res = await drive.files.list({
          q: `'${yf.id}' in parents and trashed = false`,
          fields: 'files(id, name, mimeType, modifiedTime)',
        })
        return res.data.files ?? []
      }),
    )
    files = perYear.flat()
  } else {
    const res = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, modifiedTime)',
    })
    files = res.data.files ?? []
  }

  files.sort((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''))
  return files
}

/**
 * Tiedostonimen järjestysluku: vuosi × 100 + kuukausi.
 *
 * Sama kaava kuin tuottoseurannan sivulla, ja tarkoituksella — hubin
 * yhteenvedon on osoitettava täsmälleen samaan kuukauteen jonka sivu
 * valitsee itsestään, muuten luvut eivät täsmää keskenään.
 */
export function monthOrder(name: string): number {
  const yearMatch = name.match(/(\d{4})/)
  const numMatch = name.match(/(\d{1,3})\./)
  const year = yearMatch ? Number(yearMatch[1]) : 0
  const month = numMatch ? Number(numMatch[1]) : 0
  return year * 100 + month
}
