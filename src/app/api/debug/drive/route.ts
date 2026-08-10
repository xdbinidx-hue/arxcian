import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { currentUser } from '@/lib/session'

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

// Drive-API:n oma export riittää Google Docsin tekstin lukemiseen — ei vaadi erillistä
// Docs-API:n käyttöönottoa GCP-projektissa (joka ei ollut päällä).
async function readDocText(drive: ReturnType<typeof google.drive>, fileId: string): Promise<string> {
  const res = await drive.files.export({ fileId, mimeType: 'text/plain' }, { responseType: 'text' })
  return res.data as unknown as string
}

// Drive-kyselyn merkkijonoarvot on suojattava: heittomerkki käyttäjän syötteessä
// katkaisisi kyselyn ja antaisi liittää siihen omia ehtoja.
function escapeDriveValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function readSheetText(sheets: ReturnType<typeof google.sheets>, fileId: string, wantedSheet?: string | null): Promise<string[][]> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: fileId })
  const names = meta.data.sheets?.map(s => s.properties?.title ?? '') ?? []
  const sheetName = (wantedSheet && names.find(n => n.toLowerCase().includes(wantedSheet.toLowerCase()))) || names[0] || 'Sheet1'
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: `'${sheetName}'!A1:AZ200` })
  return (res.data.values ?? []).map((r: unknown[]) => r.map((c: unknown) => String(c ?? '')))
}

export async function GET(req: NextRequest) {
  // Middleware suojaa vain /api/arxcian/*-reitit, joten istunto on tarkistettava täällä.
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  try {
    const auth = getAuth()
    const drive = google.drive({ version: 'v3', auth })
    const sheets = google.sheets({ version: 'v4', auth })

    const q = req.nextUrl.searchParams.get('q')
    const fileId = req.nextUrl.searchParams.get('fileId')
    const listChildrenOf = req.nextUrl.searchParams.get('folderId')
    const whoami = req.nextUrl.searchParams.get('whoami')

    if (whoami) {
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
      return NextResponse.json({ client_email: credentials.client_email })
    }

    if (fileId) {
      const sheetParam = req.nextUrl.searchParams.get('sheet')
      const meta = await drive.files.get({ fileId, fields: 'id,name,mimeType' })
      const mime = meta.data.mimeType ?? ''
      let content: unknown = null
      if (mime === 'application/vnd.google-apps.document') content = await readDocText(drive, fileId)
      else if (mime === 'application/vnd.google-apps.spreadsheet') content = await readSheetText(sheets, fileId, sheetParam)
      else if (mime === 'text/plain') {
        const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' })
        content = res.data
      }
      let sheetNames: string[] | undefined
      if (mime === 'application/vnd.google-apps.spreadsheet') {
        const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: fileId })
        sheetNames = sheetMeta.data.sheets?.map(s => s.properties?.title ?? '')
      }
      return NextResponse.json({ meta: meta.data, sheetNames, content })
    }

    if (listChildrenOf) {
      const res = await drive.files.list({
        q: `'${escapeDriveValue(listChildrenOf)}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, modifiedTime)',
      })
      return NextResponse.json({ files: res.data.files ?? [] })
    }

    if (q) {
      const res = await drive.files.list({
        q: `name contains '${escapeDriveValue(q)}' and trashed = false`,
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
