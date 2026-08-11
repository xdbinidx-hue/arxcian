import { google } from 'googleapis'
import type { SellerResult } from '@/lib/rjmob'
import { laskeMyyja, shouldSkip, isStandi, isRJMobSellerForMonth, SellerRaw, FSEC_RECURRING, FSEC_TOTAL_SELLER, FSEC_INTERNET_SELLER, RJ_MOB_SELLERS } from '@/lib/rjmob'

/**
 * Yhden kuukauden myyntiseurannan luvut. Kentät ovat samat kuin ennen
 * /api/sheets-vastauksessa, joten tuottosivun oma rajapintatyyppi vastaa tätä.
 */
export type DashData = {
  kuukausi: string
  sellers: SellerResult[]
  stores: Record<
    string,
    {
      liittKpl: number
      liittEur: number
      fsecKpl: number
      fsecEur: number
      kassa: number
      kassaRjmob: number
      tunnit: number
    }
  >
  totals: {
    liittKpl: number
    liittEur: number
    fsecKpl: number
    kassa: number
    rjmobTulo: number
    tyokulu: number
    netto: number
    fsecFV: number
  }
  standiInfo: { nimi: string; liittKpl: number; liittEur: number }[]
  sheetNames: string[]
  format: 'new' | 'old'
}

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

// Tiedostonimi esim. "Myyntiseuranta 7.Heinäkuu 2026" -> 7. Käytetään Petrin
// kuukausirajatun jäsenyyden (isRJMobSellerForMonth) ratkaisemiseen.
function parseMonthNumFromFileName(fileName: string): number | null {
  const m = fileName.match(/(\d{1,2})\./)
  return m ? Number(m[1]) : null
}

const RJ_STORES = ['malmi', 'easton', 'holma', 'syke', 'kivistö', 'kivisto']

// Kanoninen "Etunimi Sukunimi" -muoto RJ_MOB_SELLERS-parien perusteella (parillinen indeksi = kanoninen).
const CANONICAL_NAME: Record<string, string> = {}
for (let i = 0; i + 1 < RJ_MOB_SELLERS.length; i += 2) {
  CANONICAL_NAME[RJ_MOB_SELLERS[i].toLowerCase()] = RJ_MOB_SELLERS[i]
  CANONICAL_NAME[RJ_MOB_SELLERS[i + 1].toLowerCase()] = RJ_MOB_SELLERS[i]
}

// Lähdesheetin oma hakukaava jättää joskus solun muotoon "Kadiri Ramin?Myyjän tietoja
// ei löytynyt." kun se ei tunnista nimeä omasta viitelistastaan. Meillä on silti oma,
// ajantasainen myyjälista (RJ_MOB_SELLERS) — puretaan virheteksti pois ja katsotaan
// tunnistammeko oikean nimen sen sijaan että hylkäämme koko rivin ständinä.
function cleanUnmatchedName(raw: string): string {
  if (!raw.includes('?')) return raw
  const cleaned = raw.split('?')[0].trim()
  return CANONICAL_NAME[cleaned.toLowerCase()] ?? cleaned
}

/**
 * Yhden myyntiseurantataulukon luvut. Sama laskenta jota /api/sheets tarjoili
 * ennen suoraan — siirretty kirjastoon, jotta ajastettu työ voi kutsua sitä
 * palvelimella ilman istuntoa ja HTTP-kierrosta. Logiikkaa ei muutettu.
 */
export async function loadDashData(fileId: string): Promise<DashData> {
  {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    const drive = google.drive({ version: 'v3', auth })

    const meta = await drive.files.get({ fileId, fields: 'name,mimeType' })
    const fileName = meta.data.name ?? 'Myyntiseuranta'

    const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: fileId })
    const sheetNames = sheetMeta.data.sheets?.map(s => s.properties?.title ?? '') ?? []

    const hasDataSheet = sheetNames.some(n => n.toLowerCase() === 'data')
    const hasMyyjalista = sheetNames.some(n => n.toLowerCase().includes('myyjät yhteensä') || n.toLowerCase().includes('myyjat yhteensa'))

    if (hasDataSheet && hasMyyjalista) {
      return await parseNewFormat(sheets, fileId, sheetNames, fileName)
    } else {
      return await parseOldFormat(sheets, fileId, sheetNames, fileName)
    }
  }
}

async function parseNewFormat(sheets: ReturnType<typeof google.sheets>, fileId: string, sheetNames: string[], fileName: string) {
  const monthNum = parseMonthNumFromFileName(fileName)
  const myyjatSheet = sheetNames.find(n => n.toLowerCase().includes('myyjät yhteensä') || n.toLowerCase().includes('myyjat yhteensa')) ?? sheetNames[0]
  const myymalaSheet = sheetNames.find(n => n.toLowerCase().includes('myymäl') || n.toLowerCase().includes('myymäl')) ?? ''
  const dataSheet = sheetNames.find(n => n.toLowerCase() === 'data') ?? ''

  const myyjatRes = await sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: `'${myyjatSheet}'!A1:BZ200` })
  const myyjatRows = (myyjatRes.data.values ?? []).map((r: unknown[]) => r.map((c: unknown) => String(c ?? '')))

  let headerIdx = -1
  for (let i = 0; i < myyjatRows.length; i++) {
    if (myyjatRows[i].some(c => c.toUpperCase() === 'MYYJÄ' || c.toUpperCase() === 'MYYJAT')) { headerIdx = i; break }
  }
  if (headerIdx < 0) {
    for (let i = 0; i < myyjatRows.length; i++) {
      if (myyjatRows[i].some(c => c.toLowerCase().includes('kassaprovisio') || c.toLowerCase().includes('liittymäprovisio'))) { headerIdx = i; break }
    }
  }
  if (headerIdx < 0) throw new Error('Header row not found in new format')

  const headers = myyjatRows[headerIdx].map(h => h.toLowerCase().trim())
  const idxMyyjä = findCol(headers, 'myyjä', 'myyjat', 'nimi')
  const idxLiittEur = findCol(headers, 'liittymäprovisio', 'liittymäprov', 'liittymä €', 'liittymä€')
  const idxKassaEur = findCol(headers, 'kassakate', 'kassaprovisio', 'kassaprov')
  const idxLiittKpl = findCol(headers, 'liittymä kpl', 'liittymäkpl', 'liittymät kpl')
  const idxFsecTotal = findCol(headers, 'f-secure total', 'fsecure total', 'f-secure total security')
  const idxFsecInternet = findCol(headers, 'f-secure internet', 'fsecure internet', 'f-secure internet security')
  const idxFsecKpl = findCol(headers, 'f-secure kpl', 'fsecure kpl', 'fsec kpl')
  const idxTunnit = findCol(headers, 'tunnit')
  const idxDnaUusmyynti = findCol(headers, 'dna uusmyynti', 'dna-uusmyynti', 'uusmyynti')

  const hoursMap: Record<string, { total: number, normaali: number, koulutus: number, sairas: number }> = {}
  if (dataSheet) {
    const dataRes = await sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: `'${dataSheet}'!A1:BZ200` })
    const dataRows = (dataRes.data.values ?? []).map((r: unknown[]) => r.map((c: unknown) => String(c ?? '')))
    const dataHeaders = dataRows[0]?.map(h => h.toLowerCase().trim()) ?? []
    const dNimi = findCol(dataHeaders, 'nimi')
    const dTotal = findCol(dataHeaders, 'kokonaistunnit', 'tunnit yhteensä', 'kokonais')
    const dNormaali = findCol(dataHeaders, 'normaali työ', 'normaali')
    const dKoulutus = findCol(dataHeaders, 'koulutus', 'palaveri', 'koulutus/palaveri')
    const dSairas = findCol(dataHeaders, 'sairas')
    const absenceColNames = ['koulutus', 'palaveri', 'sairas', 'isyysvapaa', 'isyys', 'äitiysvapaa', 'äitiys', 'vanhempainvapaa', 'vanhempain', 'lomautus', 'poissaolo']
    const absenceCols = dataHeaders.map((h, i) => absenceColNames.some(a => h.includes(a)) ? i : -1).filter(i => i >= 0)

    for (let i = 1; i < dataRows.length; i++) {
      const row = dataRows[i]
      if (!row[dNimi]) continue
      const rawNimi = row[dNimi].trim()
      const parts = rawNimi.split(' ')
      const normalized = parts.length >= 2 ? parts[1] + ' ' + parts[0] : rawNimi
      const totalH = parseNum(row[dTotal])
      let normaaliH = dNormaali >= 0 ? parseNum(row[dNormaali]) : totalH
      if (dNormaali < 0 && absenceCols.length > 0) {
        const totalAbsences = absenceCols.reduce((s, ci) => s + parseNum(row[ci]), 0)
        normaaliH = Math.max(0, totalH - totalAbsences)
      }
      hoursMap[normalized.toLowerCase()] = { total: totalH, normaali: normaaliH, koulutus: dKoulutus >= 0 ? parseNum(row[dKoulutus]) : 0, sairas: dSairas >= 0 ? parseNum(row[dSairas]) : 0 }
      hoursMap[rawNimi.toLowerCase()] = hoursMap[normalized.toLowerCase()]
    }
  }

  const sellers: SellerRaw[] = []
  const standiRows: SellerRaw[] = []

  for (let i = headerIdx + 1; i < myyjatRows.length; i++) {
    const row = myyjatRows[i]
    const nimi = row[idxMyyjä >= 0 ? idxMyyjä : 1]?.trim() ?? ''
    if (!nimi || shouldSkip(nimi) || nimi === 'Kaikki myymälät') continue
    if (row[0] && row[0].trim() && !nimi) continue

    const liittEur = parseNum(row[idxLiittEur])
    const kassa = parseNum(row[idxKassaEur])
    const liittKpl = parseNum(row[idxLiittKpl])
    const fsecTotalKpl = idxFsecTotal >= 0 ? parseNum(row[idxFsecTotal]) : 0
    const fsecInternetKpl = idxFsecInternet >= 0 ? parseNum(row[idxFsecInternet]) : 0
    const fsecKpl = (fsecTotalKpl + fsecInternetKpl) > 0 ? fsecTotalKpl + fsecInternetKpl : (idxFsecKpl >= 0 ? parseNum(row[idxFsecKpl]) : 0)
    const fsecEur = (fsecTotalKpl * FSEC_TOTAL_SELLER) + (fsecInternetKpl * FSEC_INTERNET_SELLER)

    const cleanedNimi = cleanUnmatchedName(nimi)
    const hours = hoursMap[cleanedNimi.toLowerCase()] ?? hoursMap[nimi.toLowerCase()]
    const normaaliTunnit = hours ? (hours.normaali || hours.total) : parseNum(row[idxTunnit])
    const palkkaTunnit = hours ? (hours.total || hours.normaali) : normaaliTunnit
    const tunnit = normaaliTunnit

    if (liittKpl === 0 && liittEur === 0) continue

    const dnaUusmyyntiKpl = idxDnaUusmyynti >= 0 ? parseNum(row[idxDnaUusmyynti]) : 0
    const raw: SellerRaw = { nimi: cleanedNimi, liittKpl, liittEur, fsecKpl, fsecTotalKpl, fsecInternetKpl, fsecEur, kassa, tunnit, palkkaTunnit, dnaUusmyyntiKpl }

    if (isStandi(cleanedNimi)) {
      standiRows.push(raw)
    } else if (isRJMobSellerForMonth(cleanedNimi, monthNum)) {
      sellers.push({ ...raw, tunnit: normaaliTunnit, palkkaTunnit: palkkaTunnit > 0 ? palkkaTunnit : normaaliTunnit })
    }
  }

  const storeResults: Record<string, { liittKpl: number, liittEur: number, fsecKpl: number, fsecEur: number, kassa: number, kassaRjmob: number, tunnit: number }> = {}

  if (myymalaSheet) {
    const myymalaRes = await sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: `'${myymalaSheet}'!A1:BZ300` })
    const myymalaRows = (myymalaRes.data.values ?? []).map((r: unknown[]) => r.map((c: unknown) => String(c ?? '')))

    let mHeaderIdx = -1
    for (let i = 0; i < myymalaRows.length; i++) {
      if (myymalaRows[i].some(c => c.toLowerCase().includes('kassaprovisio') || c.toLowerCase().includes('liittymäprovisio'))) { mHeaderIdx = i; break }
    }

    if (mHeaderIdx >= 0) {
      const mHeaders = myymalaRows[mHeaderIdx].map(h => h.toLowerCase().trim())
      const mIdxLiittEur = findCol(mHeaders, 'liittymäprovisio', 'liittymäprov')
      const mIdxKassa = findCol(mHeaders, 'kassakate', 'kassaprovisio', 'kassaprov')
      const mIdxLiittKpl = findCol(mHeaders, 'liittymä kpl', 'liittymäkpl')
      const mIdxFsecKpl = findCol(mHeaders, 'f-secure kpl', 'fsecure kpl')
      const mIdxFsecTotal = findCol(mHeaders, 'f-secure total', 'fsecure total', 'f-secure total security')
      const mIdxFsecInternet = findCol(mHeaders, 'f-secure internet', 'fsecure internet', 'f-secure internet security')
      const mIdxTunnit = findCol(mHeaders, 'tunnit')

      // Tunnistaa myymälän kustannuspaikan tekstistä riippumatta siitä onko siinä valmiiksi
      // kaupunkietuliite vai ei (esim. sekä "K-Citymarket Malmi" että "Helsinki, K-Citymarket
      // Malmi" -> aina "Helsinki, Malmi") — ohjeen mukainen normalisointi (myyntiseuranta_ohje).
      const normalizeStoreName = (kusta: string): string => {
        const k = kusta.toLowerCase()
        if (k.includes('malmi')) return 'Helsinki, Malmi'
        if (k.includes('easton')) return 'Helsinki, Easton'
        if (k.includes('kivistö') || k.includes('kivisto')) return 'Vantaa, Kivistö'
        if (k.includes('holma')) return 'Lahti, Holma'
        if (k.includes('syke')) return 'Lahti, Syke'
        return kusta
      }

      for (let i = mHeaderIdx + 1; i < myymalaRows.length; i++) {
        const row = myymalaRows[i]
        const kusta = row[0]?.trim() ?? ''
        const myyjä = row[1]?.trim() ?? ''

        if (kusta && !myyjä) {
          const isRJStore = RJ_STORES.some(s => kusta.toLowerCase().includes(s))
          if (isRJStore) {
            const normalizedName = normalizeStoreName(kusta)

            let standiLiittKpl = 0, standiLiittEur = 0
            for (let j = i + 1; j < myymalaRows.length; j++) {
              const jr = myymalaRows[j]
              const jkusta = jr[0]?.trim() ?? ''
              const jmyyjä = jr[1]?.trim() ?? ''
              if (jkusta && !jmyyjä) break
              if (jmyyjä && isStandi(cleanUnmatchedName(jmyyjä))) {
                standiLiittKpl += parseNum(jr[mIdxLiittKpl])
                standiLiittEur += parseNum(jr[mIdxLiittEur])
              }
            }

            const kassaRaw = parseNum(row[mIdxKassa])
            const mFsecTotalKpl = mIdxFsecTotal >= 0 ? parseNum(row[mIdxFsecTotal]) : 0
            const mFsecInternetKpl = mIdxFsecInternet >= 0 ? parseNum(row[mIdxFsecInternet]) : 0
            const mFsecKpl = (mFsecTotalKpl + mFsecInternetKpl) > 0 ? mFsecTotalKpl + mFsecInternetKpl : parseNum(row[mIdxFsecKpl])
            const mFsecEur = (mFsecTotalKpl * FSEC_TOTAL_SELLER) + (mFsecInternetKpl * FSEC_INTERNET_SELLER)

            storeResults[normalizedName] = {
              liittKpl: parseNum(row[mIdxLiittKpl]) - standiLiittKpl,
              liittEur: parseNum(row[mIdxLiittEur]) - standiLiittEur,
              fsecKpl: mFsecKpl, fsecEur: mFsecEur,
              kassa: kassaRaw * 10,
              kassaRjmob: kassaRaw * 1,
              tunnit: parseNum(row[mIdxTunnit]),
            }
          }
        }
      }

      // Varalähde: käsin ylläpidetyissä kopioissa myymälän oma "vain kustannuspaikka, ei
      // myyjää" -yhteenvetorivi puuttuu joskus kokonaan (havaittu maaliskuu 2026: Kustannuspaikka
      // on merkitty vain kunkin myymälän ENSIMMÄISEN myyjän riville, ei omalle rivilleen) —
      // tällöin yllä oleva silmukka ei löydä yhtään myymälää. Lasketaan tällöin myymäläkohtaiset
      // summat itse ryhmittelemällä rivit "viimeisin nähty kustannuspaikka" mukaan.
      if (Object.keys(storeResults).length === 0) {
        let currentStore = ''
        for (let i = mHeaderIdx + 1; i < myymalaRows.length; i++) {
          const row = myymalaRows[i]
          const kusta = row[0]?.trim() ?? ''
          const myyjä = row[1]?.trim() ?? ''
          if (kusta) currentStore = kusta
          if (!currentStore || !myyjä) continue
          if (isStandi(cleanUnmatchedName(myyjä))) continue
          const isRJStore = RJ_STORES.some(s => currentStore.toLowerCase().includes(s))
          if (!isRJStore) continue

          const normalizedName = normalizeStoreName(currentStore)
          const kassaRaw = parseNum(row[mIdxKassa])
          const mFsecTotalKpl = mIdxFsecTotal >= 0 ? parseNum(row[mIdxFsecTotal]) : 0
          const mFsecInternetKpl = mIdxFsecInternet >= 0 ? parseNum(row[mIdxFsecInternet]) : 0
          const mFsecKpl = (mFsecTotalKpl + mFsecInternetKpl) > 0 ? mFsecTotalKpl + mFsecInternetKpl : parseNum(row[mIdxFsecKpl])
          const mFsecEur = (mFsecTotalKpl * FSEC_TOTAL_SELLER) + (mFsecInternetKpl * FSEC_INTERNET_SELLER)

          const prev = storeResults[normalizedName] ?? { liittKpl: 0, liittEur: 0, fsecKpl: 0, fsecEur: 0, kassa: 0, kassaRjmob: 0, tunnit: 0 }
          storeResults[normalizedName] = {
            liittKpl: prev.liittKpl + parseNum(row[mIdxLiittKpl]),
            liittEur: prev.liittEur + parseNum(row[mIdxLiittEur]),
            fsecKpl: prev.fsecKpl + mFsecKpl,
            fsecEur: prev.fsecEur + mFsecEur,
            kassa: prev.kassa + kassaRaw * 10,
            kassaRjmob: prev.kassaRjmob + kassaRaw * 1,
            tunnit: prev.tunnit + parseNum(row[mIdxTunnit]),
          }
        }
      }
    }
  }

  const results = sellers.map(s => laskeMyyja(s))
  const active = results.filter(r => r.tyyppi !== 'ref' && r.tyyppi !== 'standi')
  const tiimi = active.filter(r => r.tyyppi !== 'owner')
  // Myymälätaulukon oma rakenne (yhteenvetorivi tai kustannuspaikan sarake) vaihtelee kuukausien
  // välillä ja saattaa jäädä kokonaan löytymättä (esim. tammikuu 2026: Myyjät Myymälöittäin
  // -välilehdeltä puuttuvat loppusummasarakkeet kokonaan) — silloin storeResults jää tyhjäksi.
  // Myyjäkohtainen fsecKpl on jo luotettavasti laskettu joka tapauksessa, joten käytetään sitä
  // varalähteenä sen sijaan että koko yrityksen F-Secure-lisenssimäärä näytettäisiin nollana.
  const storeFsecKpl = Object.values(storeResults).reduce((s, r) => s + r.fsecKpl, 0)
  const totalFsecKpl = Object.keys(storeResults).length > 0 ? storeFsecKpl : active.reduce((s, r) => s + r.fsecKpl, 0)

  const totals = {
    liittKpl: active.reduce((s, r) => s + r.liittKpl, 0),
    liittEur: active.reduce((s, r) => s + r.liittEur, 0),
    fsecKpl: totalFsecKpl,
    kassa: active.reduce((s, r) => s + r.kassa, 0),
    rjmobTulo: active.reduce((s, r) => s + r.rjmobTulo, 0),
    tyokulu: tiimi.reduce((s, r) => s + r.tyokulu, 0),
    netto: active.reduce((s, r) => s + r.netto, 0),
    fsecFV: totalFsecKpl * FSEC_RECURRING * 12,
  }

  return ({ kuukausi: fileName, sellers: results, stores: storeResults, totals, standiInfo: standiRows.map(s => ({ nimi: s.nimi, liittKpl: s.liittKpl, liittEur: s.liittEur })), sheetNames, format: 'new' as const })
}

async function parseOldFormat(sheets: ReturnType<typeof google.sheets>, fileId: string, sheetNames: string[], fileName: string) {
  const monthNum = parseMonthNumFromFileName(fileName)
  const targetSheet = sheetNames.find(n =>
    n.toLowerCase().includes('etelän') || n.toLowerCase().includes('etela') ||
    n.toLowerCase().includes('härät') || n.toLowerCase().includes('harat')
  ) ?? sheetNames[0]

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: `'${targetSheet}'!A1:BZ200` })
  const rows = (res.data.values ?? []).map((r: unknown[]) => r.map((c: unknown) => String(c ?? '')))

  let headerIdx = -1
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some(c => c.toLowerCase().includes('myyjä'))) { headerIdx = i; break }
  }
  if (headerIdx < 0) throw new Error('Header row not found')

  const headers = rows[headerIdx].map(h => h.toLowerCase().trim())
  const getCol = (patterns: string[]) => {
    for (const p of patterns) {
      const idx = headers.findIndex(h => h.includes(p))
      if (idx >= 0) return idx
    }
    return -1
  }

  const idxLiittKpl = getCol(['liittymät kpl', 'liittymä kpl'])
  const idxLiittEur = getCol(['liittymät  €', 'liittymät €', 'liittymä €'])
  const idxFsecKpl = getCol(['f-secure kpl', 'fsecure kpl', 'fsecu'])
  // Vanhassa formaatissa F-Secure € on jo valmiiksi laskettu provisio — luetaan suoraan
  const idxFsecEur = getCol(['f-secure €', 'fsecure €', 'f-secure  €'])
  // Vanhassa formaatissa kassakate on jo oikea kassakate (ei provisio) — ei kerrointa
  const idxKassa = getCol(['kassakate'])
  const idxTunnit = getCol(['tunnit'])

  const sellers: SellerRaw[] = []
  const standiRows: SellerRaw[] = []

  let myymalaIdx = rows.length
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cell = (rows[i][0] ?? '').toLowerCase()
    if (cell.includes('myymälä') || cell.includes('helsinki') || cell.includes('lahti') ||
      cell.includes('vantaa') || cell.includes('ständi') || cell.includes('standi')) {
      myymalaIdx = i; break
    }
  }

  for (let i = headerIdx + 1; i < myymalaIdx; i++) {
    const row = rows[i]
    if (!row || !row[0]) continue
    const nimi = row[0].trim()
    if (!nimi || shouldSkip(nimi)) continue

    const fsecKpl = idxFsecKpl >= 0 ? parseNum(row[idxFsecKpl]) : 0
    // Vanhassa formaatissa fsecEur luetaan suoraan sarakkeesta
    const fsecEur = idxFsecEur >= 0 ? parseNum(row[idxFsecEur]) : 0

    const raw: SellerRaw = {
      nimi,
      liittKpl: parseNum(row[idxLiittKpl]),
      liittEur: parseNum(row[idxLiittEur]),
      fsecKpl, fsecTotalKpl: 0, fsecInternetKpl: 0, fsecEur, palkkaTunnit: parseNum(row[idxTunnit]),
      kassa: parseNum(row[idxKassa]),
      tunnit: parseNum(row[idxTunnit]),
      dnaUusmyyntiKpl: 0,
    }
    if (raw.liittKpl === 0 && raw.liittEur === 0) continue
    if (isStandi(nimi)) standiRows.push(raw)
    else if (isRJMobSellerForMonth(nimi, monthNum)) sellers.push(raw)
  }

  const storeResults: Record<string, { liittKpl: number, liittEur: number, fsecKpl: number, fsecEur: number, kassa: number, kassaRjmob: number, tunnit: number }> = {}
  for (let i = myymalaIdx; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row[0]) continue
    const nimi = row[0].trim().toLowerCase()
    if (RJ_STORES.some(s => nimi.includes(s))) {
      const fsecKpl = idxFsecKpl >= 0 ? parseNum(row[idxFsecKpl]) : 0
      const fsecEur = idxFsecEur >= 0 ? parseNum(row[idxFsecEur]) : 0
      const kassa = parseNum(row[idxKassa])
      storeResults[rows[i][0].trim()] = {
        liittKpl: parseNum(row[idxLiittKpl]),
        liittEur: parseNum(row[idxLiittEur]),
        fsecKpl, fsecEur,
        kassa,       // vanhassa formaatissa kassakate on jo oikea arvo
        kassaRjmob: kassa,
        tunnit: parseNum(row[idxTunnit]),
      }
    }
  }

  const results = sellers.map(s => laskeMyyja(s))
  const active = results.filter(r => r.tyyppi !== 'ref' && r.tyyppi !== 'standi')
  const tiimi = active.filter(r => r.tyyppi !== 'owner')
  const storeFsecKpl = Object.values(storeResults).reduce((s, r) => s + r.fsecKpl, 0)
  const totalFsecKpl = Object.keys(storeResults).length > 0 ? storeFsecKpl : active.reduce((s, r) => s + r.fsecKpl, 0)

  const totals = {
    liittKpl: active.reduce((s, r) => s + r.liittKpl, 0),
    liittEur: active.reduce((s, r) => s + r.liittEur, 0),
    fsecKpl: totalFsecKpl,
    kassa: active.reduce((s, r) => s + r.kassa, 0),
    rjmobTulo: active.reduce((s, r) => s + r.rjmobTulo, 0),
    tyokulu: tiimi.reduce((s, r) => s + r.tyokulu, 0),
    netto: active.reduce((s, r) => s + r.netto, 0),
    fsecFV: totalFsecKpl * FSEC_RECURRING * 12,
  }

  return ({ kuukausi: fileName, sellers: results, stores: storeResults, totals, standiInfo: standiRows.map(s => ({ nimi: s.nimi, liittKpl: s.liittKpl, liittEur: s.liittEur })), sheetNames, format: 'old' as const })
}
