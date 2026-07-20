import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import ExcelJS from 'exceljs'
import { RJ_MOB_SELLERS, getTuntipalkka } from '@/lib/rjmob'

const RECEIPTS_ROOT_FOLDER_ID = '1rRTzs9EvBLTo7xpdkkOPD7smtezl7Vhi'

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

function parseNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  // Excel/Sheets näyttää negatiiviset joskus Unicode-miinuksella (−, U+2212) tavallisen
  // ASCII-viivan sijaan — normalisoidaan ensin, tai etumerkki katoaisi hiljaisesti.
  const n = parseFloat(String(v).replace(/−/g, '-').replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

// Nimet esiintyvät korvaus-Excelissä pelkkinä etuniminä isoin kirjaimin (esim. "ARBNOR").
// Normalisoidaan tunnettuun RJ-Mob-myyjälistaan; tuntematon nimi (esim. "Petri", "Muut")
// jää sellaisenaan, jotta rivi ei katoa vahingossa.
const FIRST_NAME_TO_CANONICAL: Record<string, string> = {}
for (let i = 0; i + 1 < RJ_MOB_SELLERS.length; i += 2) {
  const canonical = RJ_MOB_SELLERS[i]
  FIRST_NAME_TO_CANONICAL[canonical.split(' ')[0].toLowerCase()] = canonical
}

function normalizeSellerName(raw: string): string {
  const trimmed = raw.trim()
  const canonical = FIRST_NAME_TO_CANONICAL[trimmed.toLowerCase()]
  if (canonical) return canonical
  // Tuntematon (esim. "Petri", "Muut") — näytetään omalla nimellä sellaisenaan.
  return trimmed.charAt(0) + trimmed.slice(1).toLowerCase()
}

const STORE_SECTIONS = ['HOLMA', 'SYKE', 'MALMI', 'EASTON', 'KIVISTÖ', 'MUUT MYYMÄLÄT']
const SIDE_PANEL_COL = 20 // sivupaneelit (Kassamyynti/Passiivitulo/Työntekijät) alkavat aina tästä sarakkeesta

interface ReceiptSeller {
  nimi: string
  tuntipalkka: number
  provisio: number
  palkka: number
  verottomat: number
  sivukulut: number
  rjmobTulo: number
  netto: number
}

interface ReceiptStore {
  liittymat: number
  kassakate: number
  huoltokate: number
  rescueKate: number
}

interface ReceiptsResult {
  kuukausi: string
  sellers: ReceiptSeller[]
  stores: Record<string, ReceiptStore>
  totals: {
    liittymat: number
    kassakate: number
    huoltokate: number
    rescueKate: number
    provisio: number
    netto: number
    fsecAsiakkuudet: number
    fsecPassiivitulo: number
  }
}

function parseReceiptRows(rows: string[][], fileName: string): ReceiptsResult {
  // Rivi jolla ensimmäinen solu on "MYYJÄ" — pääotsikkorivi, josta kaikki muut
  // rivisiirtymät lasketaan suhteellisesti (kuukausikopiot ovat käsin ylläpidettyjä
  // ja saattavat sisältää ylimääräisiä/puuttuvia rivejä otsikon yläpuolella).
  const headerIdx = rows.findIndex(r => (r[0] || '').trim().toUpperCase() === 'MYYJÄ')
  if (headerIdx < 0) throw new Error('Otsikkoriviä "MYYJÄ" ei löytynyt')

  const headerRow = rows[headerIdx]
  const totalColIdx = headerRow.findIndex((c, i) => i > 0 && (c || '').trim().toUpperCase() === 'TOTAL')
  const sellerCols: { nimi: string, col: number }[] = []
  for (let c = 1; c < (totalColIdx > 0 ? totalColIdx : headerRow.length); c++) {
    const raw = (headerRow[c] || '').trim()
    if (!raw) continue
    sellerCols.push({ nimi: normalizeSellerName(raw), col: c })
  }

  // ---- Kassamyynti-paneeli (Kassakate/Huoltokate/Rescue kate per myymälä) ----
  // Paneelin oma otsikkoteksti ("KASSAMYYNTI") vaihtelee kuukausikopioiden välillä,
  // joten ankkuroidaan sarakeotsikkoon "Kassakate", joka on havaittu pysyväksi.
  const kassaHeaderIdx = rows.findIndex(r => (r[SIDE_PANEL_COL + 1] || '').trim().toLowerCase() === 'kassakate')
  const kassaRows = kassaHeaderIdx >= 0 ? rows.slice(kassaHeaderIdx + 1, kassaHeaderIdx + 7) : []

  // ---- Myymäläkohtaiset 12-rivin lohkot (liittymät, kokonaisprovisio per myyjä) ----
  const stores: Record<string, ReceiptStore> = {}
  const provisioBySeller: Record<string, number> = {}

  for (const storeLabel of STORE_SECTIONS) {
    const idx = rows.findIndex(r => (r[0] || '').trim() === storeLabel)
    if (idx < 0) continue
    const liittRow = rows[idx + 5]   // " TOTAL" (DNA AUVO+VISIO+TELIA+ELISA)
    const grandRow = rows[idx + 11]  // "TOTAL" (koko myymälän kokonaisprovisio per myyjä)
    if (!liittRow || !grandRow) continue

    const storeName = storeLabel === 'MUUT MYYMÄLÄT' ? 'Muut myymälät' : storeLabel.charAt(0) + storeLabel.slice(1).toLowerCase()
    const kassa = kassaRows.find(r => (r[SIDE_PANEL_COL] || '').trim() === storeName)

    stores[storeName] = {
      liittymat: totalColIdx > 0 ? parseNum(liittRow[totalColIdx]) : 0,
      kassakate: kassa ? parseNum(kassa[SIDE_PANEL_COL + 1]) : 0,
      huoltokate: kassa ? parseNum(kassa[SIDE_PANEL_COL + 2]) : 0,
      rescueKate: kassa ? parseNum(kassa[SIDE_PANEL_COL + 3]) : 0,
    }

    for (const s of sellerCols) {
      provisioBySeller[s.nimi] = (provisioBySeller[s.nimi] ?? 0) + parseNum(grandRow[s.col])
    }
  }

  // ---- Työntekijät-paneeli: Bruttopalkka / Verottomat / Sivukuluineen / Tulos per työntekijä ----
  const tyontekijatHeaderIdx = rows.findIndex(r => (r[SIDE_PANEL_COL] || '').trim().toUpperCase() === 'TYÖNTEKIJÄT')
  const empCols: { nimi: string, col: number }[] = []
  if (tyontekijatHeaderIdx >= 0) {
    const empHeaderRow = rows[tyontekijatHeaderIdx]
    for (let c = SIDE_PANEL_COL + 1; c < empHeaderRow.length; c++) {
      const raw = (empHeaderRow[c] || '').trim()
      if (!raw || raw.toUpperCase() === 'TOTAL') continue
      empCols.push({ nimi: normalizeSellerName(raw), col: c })
    }
  }
  const bruttoRow = tyontekijatHeaderIdx >= 0 ? rows[tyontekijatHeaderIdx + 9] : undefined
  const verottomatRow = tyontekijatHeaderIdx >= 0 ? rows[tyontekijatHeaderIdx + 10] : undefined
  const sivukuluRow = tyontekijatHeaderIdx >= 0 ? rows[tyontekijatHeaderIdx + 11] : undefined
  const tulosRow = tyontekijatHeaderIdx >= 0 ? rows[tyontekijatHeaderIdx + 13] : undefined

  // ---- Passiivitulo-paneeli (koko tiimi, ei myymäläkohtainen tässä lähteessä) ----
  const passiivituloHeaderIdx = rows.findIndex(r => (r[SIDE_PANEL_COL] || '').trim().toUpperCase() === 'PASSIIVITULO')
  const passiivituloRow = passiivituloHeaderIdx >= 0 ? rows[passiivituloHeaderIdx + 1] : undefined

  // ---- Kootaan myyjäkohtainen tulos ----
  const sellers: ReceiptSeller[] = sellerCols.map(({ nimi }) => {
    const emp = empCols.find(e => e.nimi === nimi)
    const palkka = emp && bruttoRow ? parseNum(bruttoRow[emp.col]) : 0
    const verottomat = emp && verottomatRow ? parseNum(verottomatRow[emp.col]) : 0
    const sivukulut = emp && sivukuluRow ? parseNum(sivukuluRow[emp.col]) : 0
    const netto = emp && tulosRow ? parseNum(tulosRow[emp.col]) : 0
    const provisio = provisioBySeller[nimi] ?? 0

    return {
      nimi,
      tuntipalkka: emp ? getTuntipalkka(nimi) : 0,
      provisio,
      palkka,
      verottomat,
      sivukulut,
      rjmobTulo: provisio,
      netto,
    }
  })

  const totals = {
    liittymat: Object.values(stores).reduce((s, r) => s + r.liittymat, 0),
    kassakate: Object.values(stores).reduce((s, r) => s + r.kassakate, 0),
    huoltokate: Object.values(stores).reduce((s, r) => s + r.huoltokate, 0),
    rescueKate: Object.values(stores).reduce((s, r) => s + r.rescueKate, 0),
    provisio: sellers.reduce((s, r) => s + r.provisio, 0),
    netto: sellers.reduce((s, r) => s + r.netto, 0),
    fsecAsiakkuudet: passiivituloRow ? parseNum(passiivituloRow[SIDE_PANEL_COL + 4]) : 0,
    fsecPassiivitulo: passiivituloRow ? parseNum(passiivituloRow[SIDE_PANEL_COL + 5]) : 0,
  }

  return {
    kuukausi: fileName.replace(/^Kopio tiedostosta\s+/i, ''),
    sellers,
    stores,
    totals,
  }
}

// Excelin solu voi sisältää kaavan tuloksen, rich textin, hyperlinkin tms. oliona —
// puretaan tekstiarvo puolustavasti sen sijaan että luotetaan cell.text-getteriin,
// joka voi heittää poikkeuksen tietyillä (esim. rikkinäisillä kaava-/linkkisoluilla).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cellToString(cell: any): string {
  try {
    const v = cell.value
    if (v === null || v === undefined) return ''
    if (typeof v === 'object') {
      if ('result' in v) return v.result != null ? String(v.result) : ''
      if ('richText' in v) return v.richText.map((r: { text: string }) => r.text).join('')
      if ('text' in v) return String(v.text)
      if (v instanceof Date) return v.toISOString()
      return ''
    }
    return String(v)
  } catch {
    return ''
  }
}

async function loadRowsFromXlsx(drive: ReturnType<typeof google.drive>, fileId: string): Promise<string[][]> {
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
  const buffer = Buffer.from(res.data as ArrayBuffer)
  const workbook = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any)
  const worksheet = workbook.worksheets.find(w => w.name.toLowerCase() === 'pohja') ?? workbook.worksheets[0]
  const rows: string[][] = []
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const arr: string[] = []
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      arr[colNumber - 1] = cellToString(cell)
    })
    rows[rowNumber - 1] = arr
  })
  return rows
}

async function loadRowsFromSheet(sheets: ReturnType<typeof google.sheets>, fileId: string): Promise<string[][]> {
  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: fileId })
  const sheetNames = sheetMeta.data.sheets?.map(s => s.properties?.title ?? '') ?? []
  const sheetName = sheetNames.find(n => n.toLowerCase() === 'pohja') ?? sheetNames[0]
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: `'${sheetName}'!A1:BZ400` })
  return (res.data.values ?? []).map((r: unknown[]) => r.map((c: unknown) => String(c ?? '')))
}

const SPREADSHEET_MIMETYPES = [
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

export async function GET(req: NextRequest) {
  try {
    const auth = getAuth()
    const drive = google.drive({ version: 'v3', auth })
    const sheets = google.sheets({ version: 'v4', auth })

    // Kuittikansiossa on vuosikansio(t) (esim. "2026"); etsitään ensimmäinen alikansio.
    const yearFolders = await drive.files.list({
      q: `'${RECEIPTS_ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
    })
    const folderId = yearFolders.data.files?.[0]?.id ?? RECEIPTS_ROOT_FOLDER_ID

    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, modifiedTime)',
      orderBy: 'modifiedTime desc',
    })
    const files = (listRes.data.files ?? []).filter(f => SPREADSHEET_MIMETYPES.includes(f.mimeType ?? ''))

    const fileId = req.nextUrl.searchParams.get('fileId') ?? files[0]?.id
    if (!fileId) return NextResponse.json({ files, error: 'Kuittitiedostoja ei löytynyt' })

    const meta = await drive.files.get({ fileId, fields: 'name,mimeType' })
    const rows = meta.data.mimeType === 'application/vnd.google-apps.spreadsheet'
      ? await loadRowsFromSheet(sheets, fileId)
      : await loadRowsFromXlsx(drive, fileId)

    const result = parseReceiptRows(rows, meta.data.name ?? 'Maksukuitti')
    return NextResponse.json({ files, ...result })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
