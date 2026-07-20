import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

const RECEIPTS_FOLDER_ID = '1rRTzs9EvBLTo7xpdkkOPD7smtezl7Vhi'

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

export async function GET(req: NextRequest) {
  try {
    const auth = getAuth()
    const drive = google.drive({ version: 'v3', auth })
    const sheets = google.sheets({ version: 'v4', auth })

    const folderParam = req.nextUrl.searchParams.get('folder') ?? RECEIPTS_FOLDER_ID
    const listRes = await drive.files.list({
      q: `'${folderParam}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, modifiedTime)',
      orderBy: 'modifiedTime desc',
    })
    const files = listRes.data.files ?? []

    const fileId = req.nextUrl.searchParams.get('fileId') ?? files[0]?.id
    if (!fileId) return NextResponse.json({ files })

    const meta = await drive.files.get({ fileId, fields: 'name,mimeType' })

    if (meta.data.mimeType !== 'application/vnd.google-apps.spreadsheet') {
      return NextResponse.json({ files, selected: meta.data, note: 'not a native google sheet, needs xlsx parsing' })
    }

    const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: fileId })
    const sheetNames = sheetMeta.data.sheets?.map(s => s.properties?.title ?? '') ?? []

    const dump: Record<string, string[][]> = {}
    for (const sheetName of sheetNames) {
      const r = await sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: `'${sheetName}'!A1:BZ300` })
      dump[sheetName] = (r.data.values ?? []).map((row: unknown[]) => row.map((c: unknown) => String(c ?? '')))
    }

    return NextResponse.json({ files, selected: meta.data, sheetNames, dump })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
