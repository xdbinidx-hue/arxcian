import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

// Tilapäinen tutkimustyökalu Driven sisällön selaamiseen (esim. uuden kansion löytäminen ja
// sen tekstisisällön lukeminen) ilman että jokaista uutta tarvetta varten pitäisi kirjoittaa
// oma kiinteä reitti. Read-only.
function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/documents.readonly'],
  })
}

async function readDocText(docs: ReturnType<typeof google.docs>, fileId: string): Promise<string> {
  const res = await docs.documents.get({ documentId: fileId })
  const content = res.data.body?.content ?? []
  let text = ''
  for (const el of content) {
    for (const run of el.paragraph?.elements ?? []) {
      text += run.textRun?.content ?? ''
    }
  }
  return text
}

async function readSheetText(sheets: ReturnType<typeof google.sheets>, fileId: string): Promise<string[][]> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: fileId })
  const sheetName = meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1'
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: `'${sheetName}'!A1:Z200` })
  return (res.data.values ?? []).map((r: unknown[]) => r.map((c: unknown) => String(c ?? '')))
}

export async function GET(req: NextRequest) {
  try {
    const auth = getAuth()
    const drive = google.drive({ version: 'v3', auth })
    const sheets = google.sheets({ version: 'v4', auth })
    const docs = google.docs({ version: 'v1', auth })

    const q = req.nextUrl.searchParams.get('q')
    const fileId = req.nextUrl.searchParams.get('fileId')
    const listChildrenOf = req.nextUrl.searchParams.get('folderId')

    if (fileId) {
      const meta = await drive.files.get({ fileId, fields: 'id,name,mimeType' })
      const mime = meta.data.mimeType ?? ''
      let content: unknown = null
      if (mime === 'application/vnd.google-apps.document') content = await readDocText(docs, fileId)
      else if (mime === 'application/vnd.google-apps.spreadsheet') content = await readSheetText(sheets, fileId)
      else if (mime === 'text/plain') {
        const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' })
        content = res.data
      }
      return NextResponse.json({ meta: meta.data, content })
    }

    if (listChildrenOf) {
      const res = await drive.files.list({
        q: `'${listChildrenOf}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, modifiedTime)',
      })
      return NextResponse.json({ files: res.data.files ?? [] })
    }

    if (q) {
      const res = await drive.files.list({
        q: `name contains '${q}' and trashed = false`,
        fields: 'files(id, name, mimeType, parents, modifiedTime)',
      })
      return NextResponse.json({ files: res.data.files ?? [] })
    }

    return NextResponse.json({ error: 'anna q (nimihaku), folderId (listaa lapset) tai fileId (lue sisältö)' }, { status: 400 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
