import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { cachedJson } from '@/lib/apiCache'

// "Myyntiseuranta (kopio)" (nimi muuttunut "Myyntiseuranta (julkinen)" -> "(kopio)" 26.7.2026,
// mutta kansion oma ID pysyi samana — nimenmuutos ei vaadi ID:n päivitystä).
const FOLDER_ID = '1QKY-rxqFQwbfK9saX5fvhVIixrv_9kYz'

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ],
  })
}

export async function GET() {
  try {
    const auth = getAuth()
    const drive = google.drive({ version: 'v3', auth })

    // Myyntiseurannan juurikansiossa on vuosikansio(t) (esim. "2026") — kaikki vuodet listataan
    // ja yhdistetään samaan tapaan kuin api/receipts, ei kovakoodata vain yhtä vuosikansiota.
    const yearFoldersRes = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
    })
    const yearFolders = yearFoldersRes.data.files ?? []

    let files: { id?: string | null; name?: string | null; mimeType?: string | null; modifiedTime?: string | null }[]
    if (yearFolders.length > 0) {
      const perYear = await Promise.all(yearFolders.map(async yf => {
        const res = await drive.files.list({
          q: `'${yf.id}' in parents and trashed = false`,
          fields: 'files(id, name, mimeType, modifiedTime)',
        })
        return res.data.files ?? []
      }))
      files = perYear.flat()
    } else {
      const res = await drive.files.list({
        q: `'${FOLDER_ID}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, modifiedTime)',
      })
      files = res.data.files ?? []
    }
    files.sort((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''))

    return cachedJson({ files })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
