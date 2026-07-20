import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { isRJMobSeller, shouldSkip, FSEC_TOTAL_SELLER, FSEC_INTERNET_SELLER } from '@/lib/rjmob'

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

function parseNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const n = parseFloat(String(v).replace(',', '.').replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

function findCol(headers: string[], ...patterns: string[]): number {
  for (const p of patterns) {
    const idx = headers.findIndex(h => h.toLowerCase().includes(p.toLowerCase()))
    if (idx >= 0) return idx
  }
  return -1
}

// Nimet voivat esiintyä joko 'Etunimi Sukunimi' tai 'Sukunimi Etunimi' -muodossa
// riippuen välilehdestä. Normalisoidaan tunnettuun RJ-Mob-myyjälistaan verraten.
function normalizeName(raw: string): string {
  const trimmed = raw.trim()
  if (isRJMobSeller(trimmed)) return trimmed
  const parts = trimmed.split(/\s+/)
  if (parts.length >= 2) {
    const reversed = parts.slice(1).join(' ') + ' ' + parts[0]
    if (isRJMobSeller(reversed)) return reversed
  }
  return trimmed
}

interface TargetRow {
  nimi: string
  liittKpl: number; liittTavoite: number; liittRunrate: number; liittPerPaiva: number
  fsecKpl: number; fsecTavoite: number; fsecRunrate: number
  kassaKate: number; kassaTavoite: number; kassaRunrate: number
  kassaMyynti: number; kassaPalautus: number; kassaAlennus: number; kassaKuitit: number; kassaPerPaiva: number
  paivat: number; liittEur: number
}

function findSheet(sheetNames: string[], ...patterns: string[]): string {
  for (const p of patterns) {
    const found = sheetNames.find(n => n.toLowerCase().includes(p.toLowerCase()))
    if (found) return found
  }
  return ''
}

export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get('fileId')
  if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 })

  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    const drive = google.drive({ version: 'v3', auth })

    const meta = await drive.files.get({ fileId, fields: 'name' })
    const fileName = meta.data.name ?? 'Myyntiseuranta'

    const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: fileId })
    const sheetNames = sheetMeta.data.sheets?.map(s => s.properties?.title ?? '') ?? []

    const tavoitteetSheet = findSheet(sheetNames, 'tavoitteet')
    const kassakateSheet = findSheet(sheetNames, 'kassakate')
    const dataSheet = findSheet(sheetNames, 'data')
    const myyjatSheet = findSheet(sheetNames, 'myyjät yhteensä', 'myyjat yhteensa')

    if (!tavoitteetSheet) {
      return NextResponse.json({ error: `Tavoitteet-välilehteä ei löytynyt (löytyi: ${sheetNames.join(', ')})` }, { status: 400 })
    }

    // ---- Tavoitteet: rivi 1 otsikko, rivi 2 headerit, rivi 3+ data ----
    const targetsMap: Record<string, { nimi: string; liittTavoite: number; fsecTavoite: number; kassaTavoite: number }> = {}
    {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: `'${tavoitteetSheet}'!A1:Z200` })
      const rows = (res.data.values ?? []).map((r: unknown[]) => r.map((c: unknown) => String(c ?? '')))
      const headerRow = rows[1] ?? []
      const headers = headerRow.map(h => h.toLowerCase().trim())
      const idxNimi = findCol(headers, 'myyjä', 'myyjat', 'nimi')
      const idxLiitt = findCol(headers, 'liittymätavoite', 'liittymä tavoite', 'liittymatavoite')
      const idxFsec = findCol(headers, 'f-secure tavoite', 'fsecure tavoite', 'f-sec tavoite')
      const idxKassa = findCol(headers, 'kassakate tavoite', 'kassakatetavoite', 'kassa tavoite')

      for (let i = 2; i < rows.length; i++) {
        const row = rows[i]
        const rawNimi = row[idxNimi >= 0 ? idxNimi : 0]?.trim() ?? ''
        if (!rawNimi || shouldSkip(rawNimi)) continue
        const nimi = normalizeName(rawNimi)
        targetsMap[nimi.toLowerCase()] = {
          nimi,
          liittTavoite: idxLiitt >= 0 ? parseNum(row[idxLiitt]) : 0,
          fsecTavoite: idxFsec >= 0 ? parseNum(row[idxFsec]) : 0,
          kassaTavoite: idxKassa >= 0 ? parseNum(row[idxKassa]) : 0,
        }
      }
    }

    // ---- Myyjät Yhteensä: toteutuneet liittymät ja F-Secure ----
    const actualsMap: Record<string, { liittKpl: number; liittEur: number; fsecKpl: number }> = {}
    if (myyjatSheet) {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: `'${myyjatSheet}'!A1:Z200` })
      const rows = (res.data.values ?? []).map((r: unknown[]) => r.map((c: unknown) => String(c ?? '')))

      let headerIdx = -1
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].some(c => c.toUpperCase() === 'MYYJÄ' || c.toUpperCase() === 'MYYJAT')) { headerIdx = i; break }
      }
      if (headerIdx < 0) {
        for (let i = 0; i < rows.length; i++) {
          if (rows[i].some(c => c.toLowerCase().includes('kassaprovisio') || c.toLowerCase().includes('liittymäprovisio'))) { headerIdx = i; break }
        }
      }

      if (headerIdx >= 0) {
        const headers = rows[headerIdx].map(h => h.toLowerCase().trim())
        const idxNimi = findCol(headers, 'myyjä', 'myyjat', 'nimi')
        const idxLiittEur = findCol(headers, 'liittymäprovisio', 'liittymäprov', 'liittymä €', 'liittymä€')
        const idxLiittKpl = findCol(headers, 'liittymä kpl', 'liittymäkpl', 'liittymät kpl')
        const idxFsecTotal = findCol(headers, 'f-secure total', 'fsecure total', 'f-secure total security')
        const idxFsecInternet = findCol(headers, 'f-secure internet', 'fsecure internet', 'f-secure internet security')
        const idxFsecKpl = findCol(headers, 'f-secure kpl', 'fsecure kpl', 'fsec kpl')

        for (let i = headerIdx + 1; i < rows.length; i++) {
          const row = rows[i]
          const rawNimi = row[idxNimi >= 0 ? idxNimi : 1]?.trim() ?? ''
          if (!rawNimi || shouldSkip(rawNimi) || rawNimi === 'Kaikki myymälät') continue
          const nimi = normalizeName(rawNimi)
          if (!isRJMobSeller(nimi)) continue

          const fsecTotalKpl = idxFsecTotal >= 0 ? parseNum(row[idxFsecTotal]) : 0
          const fsecInternetKpl = idxFsecInternet >= 0 ? parseNum(row[idxFsecInternet]) : 0
          const fsecKpl = (fsecTotalKpl + fsecInternetKpl) > 0 ? fsecTotalKpl + fsecInternetKpl : (idxFsecKpl >= 0 ? parseNum(row[idxFsecKpl]) : 0)

          actualsMap[nimi.toLowerCase()] = {
            liittKpl: parseNum(row[idxLiittKpl]),
            liittEur: parseNum(row[idxLiittEur]),
            fsecKpl,
          }
        }
      }
    }

    // ---- Kassakate: myynti / palautus / alennus / kuitit ----
    const kassaMap: Record<string, { kassaMyynti: number; kassaPalautus: number; kassaAlennus: number; kassaKuitit: number; kassaKate: number }> = {}
    if (kassakateSheet) {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: `'${kassakateSheet}'!A1:Z200` })
      const rows = (res.data.values ?? []).map((r: unknown[]) => r.map((c: unknown) => String(c ?? '')))

      let headerIdx = -1
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].some(c => c.toLowerCase().trim() === 'myyjä' || c.toLowerCase().trim() === 'myyjat')) { headerIdx = i; break }
      }

      if (headerIdx >= 0) {
        const headers = rows[headerIdx].map(h => h.toLowerCase().trim())
        const idxNimi = findCol(headers, 'myyjä', 'myyjat', 'nimi')
        const idxMyynti = findCol(headers, 'myynti')
        const idxPalautus = findCol(headers, 'palautus', 'palautukset')
        const idxAlennus = findCol(headers, 'alennus', 'alennukset')
        const idxKuitit = findCol(headers, 'kuitti', 'kuitit')
        const idxKate = findCol(headers, 'kassakate', 'kate')

        for (let i = headerIdx + 1; i < rows.length; i++) {
          const row = rows[i]
          const rawNimi = row[idxNimi >= 0 ? idxNimi : 0]?.trim() ?? ''
          if (!rawNimi || shouldSkip(rawNimi)) continue
          const nimi = normalizeName(rawNimi)

          const kassaMyynti = idxMyynti >= 0 ? parseNum(row[idxMyynti]) : 0
          const kassaPalautus = idxPalautus >= 0 ? parseNum(row[idxPalautus]) : 0
          const kassaAlennus = idxAlennus >= 0 ? parseNum(row[idxAlennus]) : 0
          const kassaKuitit = idxKuitit >= 0 ? parseNum(row[idxKuitit]) : 0
          const kassaKate = idxKate >= 0 ? parseNum(row[idxKate]) : (kassaMyynti - kassaPalautus - kassaAlennus)

          kassaMap[nimi.toLowerCase()] = { kassaMyynti, kassaPalautus, kassaAlennus, kassaKuitit, kassaKate }
        }
      }
    }

    // ---- data: kuluneet työpäivät myyjää kohden ----
    const paivatMap: Record<string, number> = {}
    if (dataSheet) {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: `'${dataSheet}'!A1:P200` })
      const rows = (res.data.values ?? []).map((r: unknown[]) => r.map((c: unknown) => String(c ?? '')))
      const headers = rows[0]?.map(h => h.toLowerCase().trim()) ?? []
      const idxNimi = findCol(headers, 'nimi', 'myyjä')
      const idxPaivat = findCol(headers, 'päivä', 'päivät', 'työpäivä', 'työpäivät', 'tyopaiva')

      if (idxPaivat >= 0) {
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          const rawNimi = row[idxNimi]?.trim() ?? ''
          if (!rawNimi) continue
          const nimi = normalizeName(rawNimi)
          paivatMap[nimi.toLowerCase()] = parseNum(row[idxPaivat])
        }
      }
    }

    // ---- Yhdistetään: Tavoitteet-välilehti määrittää rivit ----
    const targets: TargetRow[] = Object.entries(targetsMap).map(([key, t]) => {
      const actual = actualsMap[key] ?? { liittKpl: 0, liittEur: 0, fsecKpl: 0 }
      const kassa = kassaMap[key] ?? { kassaMyynti: 0, kassaPalautus: 0, kassaAlennus: 0, kassaKuitit: 0, kassaKate: 0 }
      const paivat = paivatMap[key] ?? 0

      return {
        nimi: t.nimi,
        liittKpl: actual.liittKpl,
        liittTavoite: t.liittTavoite,
        liittRunrate: t.liittTavoite > 0 ? (actual.liittKpl / t.liittTavoite) * 100 : 0,
        liittPerPaiva: paivat > 0 ? actual.liittKpl / paivat : 0,
        fsecKpl: actual.fsecKpl,
        fsecTavoite: t.fsecTavoite,
        fsecRunrate: t.fsecTavoite > 0 ? (actual.fsecKpl / t.fsecTavoite) * 100 : 0,
        kassaKate: kassa.kassaKate,
        kassaTavoite: t.kassaTavoite,
        kassaRunrate: t.kassaTavoite > 0 ? (kassa.kassaKate / t.kassaTavoite) * 100 : 0,
        kassaMyynti: kassa.kassaMyynti,
        kassaPalautus: kassa.kassaPalautus,
        kassaAlennus: kassa.kassaAlennus,
        kassaKuitit: kassa.kassaKuitit,
        kassaPerPaiva: paivat > 0 ? kassa.kassaKate / paivat : 0,
        paivat,
        liittEur: actual.liittEur,
      }
    }).sort((a, b) => b.liittRunrate - a.liittRunrate)

    return NextResponse.json({ kuukausi: fileName, targets, sheetNames })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
