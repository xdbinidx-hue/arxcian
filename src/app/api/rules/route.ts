import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { cachedJson } from '@/lib/apiCache'

const OHJEET_FOLDER_ID = '1d8o0ObBBxV5b7xMA-tH014Q8xsPILWGp'

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

// Ohjeet-kansiossa on tähän mennessä ollut Google Docs -tiedostoja (ei PDF:iä kuten alun perin
// oletettiin) — luetaan Driven oman export-toiminnon kautta tekstiksi, ei erillistä Docs-API:a
// (jota ei ole otettu käyttöön tässä GCP-projektissa). Jos kansioon lisätään joskus oikea PDF,
// sen tekstiä ei pureta (vaatisi erillisen PDF-parserin) — palautetaan silloin selkeä virhe.
async function readFileText(drive: ReturnType<typeof google.drive>, fileId: string, mimeType: string): Promise<string | null> {
  if (mimeType === 'application/vnd.google-apps.document') {
    const res = await drive.files.export({ fileId, mimeType: 'text/plain' }, { responseType: 'text' })
    return res.data as unknown as string
  }
  if (mimeType === 'text/plain') {
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' })
    return res.data as unknown as string
  }
  return null
}

export async function GET(req: NextRequest) {
  try {
    const auth = getAuth()
    const drive = google.drive({ version: 'v3', auth })

    const fileId = req.nextUrl.searchParams.get('fileId')

    if (fileId) {
      const meta = await drive.files.get({ fileId, fields: 'id,name,mimeType' })
      const mimeType = meta.data.mimeType ?? ''
      const text = await readFileText(drive, fileId, mimeType)
      if (text === null) {
        return NextResponse.json({ name: meta.data.name, mimeType, error: `Tiedostotyyppiä ${mimeType} ei osata vielä lukea tekstinä (esim. PDF vaatisi erillisen parserin)` }, { status: 400 })
      }
      return cachedJson({ name: meta.data.name, mimeType, text })
    }

    const res = await drive.files.list({
      q: `'${OHJEET_FOLDER_ID}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, modifiedTime)',
      orderBy: 'modifiedTime desc',
    })
    return cachedJson({ files: res.data.files ?? [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
