// Read-only archive access. Never imports reports into Sheets or marks them processed.
import { google } from 'googleapis'
import { downloadDriveFile } from '../rjmobDrive'
import { parseWinposReport } from './parser'
export type CashReport = { tiedosto: string; raporttiPvm: string; tilannePvm: string; jaksonAlku: null }
export function selectReport(files: {id?: string | null;name?: string | null}[], month: number) {
  const boundary = new Date(Date.UTC(Math.floor(month / 100), month % 100, 1)).toISOString().slice(0,10)
  return files.map(file => ({file,date:file.name?.match(/^Winpos (\d{4}-\d{2}-\d{2})\b/i)?.[1]}))
    .filter((entry): entry is {file:typeof files[number];date:string} => Boolean(entry.file.id && entry.date && entry.date <= boundary))
    .sort((a,b)=>b.date.localeCompare(a.date) || (a.file.id || '').localeCompare(b.file.id || ''))[0]
}
export async function readCashArchive(month: number) {
  const auth = new google.auth.GoogleAuth({credentials:JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!),scopes:['https://www.googleapis.com/auth/drive.readonly']})
  const drive = google.drive({version:'v3',auth})
  const files: {id?:string|null;name?:string|null}[] = []
  let pageToken: string | undefined
  do {
    const result = await drive.files.list({q:"'1pdgpw0Vb_fzuyxWhTXjaJeakrEQErkg5' in parents and trashed = false",fields:'nextPageToken,files(id,name)',pageSize:1000,pageToken})
    files.push(...(result.data.files || []));pageToken=result.data.nextPageToken || undefined
  } while(pageToken)
  const selected = selectReport(files,month)
  if (!selected) return null
  const date = new Date(selected.date+'T00:00:00Z')
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==selected.date) throw new Error('Winpos-raportin päiväys on virheellinen')
  date.setUTCDate(date.getUTCDate()-1)
  const report = parseWinposReport(await downloadDriveFile(selected.file.id!),{filename:selected.file.name!})
  return {metadata:{tiedosto:selected.file.name!,raporttiPvm:selected.date,tilannePvm:date.toISOString().slice(0,10),jaksonAlku:null} as CashReport,rows:report.myyjat}
}
