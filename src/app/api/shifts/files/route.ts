import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { cachedJson } from '@/lib/apiCache'

const TYOVUOROLISTA_FOLDER_ID = '1TQbm2sYst8Bz_Z1WoZm0lEasM6fTrTKT'

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

    const res = await drive.files.list({
      q: `'${TYOVUOROLISTA_FOLDER_ID}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, modifiedTime)',
      orderBy: 'modifiedTime desc',
    })

    return cachedJson({ files: res.data.files ?? [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
