import { google } from 'googleapis'
import { isRJMobSeller, shouldSkip, RJ_MOB_SELLERS } from '@/lib/rjmob'

/**
 * Yhden kuukauden tavoitteet ja niiden toteuma.
 *
 * Sama laskenta jota /api/targets tarjoili ennen suoraan reitin sisällä —
 * siirretty kirjastoon, jotta ajastettu työ pääsee siihen palvelimella ilman
 * istuntoa ja HTTP-kierrosta. Logiikkaa ei muutettu, ja kentät ovat samat kuin
 * ennen, joten tavoitteet-sivun oma rajapintatyyppi vastaa tätä.
 *
 * Neljä välilehteä yhdistetään: Tavoitteet määrittää rivit, Myyjät Yhteensä
 * antaa liittymä- ja F-Secure-toteuman, Kassakate kassaluvut ja data
 * toteutuneet työpäivät.
 */

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

// RJ_MOB_SELLERS-listassa jokainen myyjä esiintyy parina: [i] on kanoninen
// 'Etunimi Sukunimi' -muoto, [i+1] sama nimi käänteisessä järjestyksessä.
// Rakennetaan käänteishaku, jotta eri välilehtien nimijärjestys (kumpi
// tahansa) normalisoituu aina samaan näytettävään muotoon.
const CANONICAL_NAME: Record<string, string> = {}
const FIRST_NAME_TO_CANONICAL: Record<string, string> = {}
for (let i = 0; i + 1 < RJ_MOB_SELLERS.length; i += 2) {
  const canonical = RJ_MOB_SELLERS[i]
  CANONICAL_NAME[canonical.toLowerCase()] = canonical
  CANONICAL_NAME[RJ_MOB_SELLERS[i + 1].toLowerCase()] = canonical
  const firstName = canonical.split(/\s+/)[0].toLowerCase()
  // Vain yksiselitteiset etunimet kelpaavat varakeinoksi (esim. Kassakate-välilehdellä
  // saattaa esiintyä pelkkä etunimi ilman sukunimeä).
  FIRST_NAME_TO_CANONICAL[firstName] = firstName in FIRST_NAME_TO_CANONICAL ? '' : canonical
}

function normalizeName(raw: string): string {
  // Lähdesheetin oma hakukaava jättää joskus soluun muotoon "Kadiri Ramin?Myyjän
  // tietoja ei löytynyt." kun se ei tunnista nimeä omasta viitelistastaan —
  // puretaan virheteksti pois ennen normalisointia.
  const trimmed = (raw.includes('?') ? raw.split('?')[0] : raw).trim()
  const known = CANONICAL_NAME[trimmed.toLowerCase()]
  if (known) return known
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    const byFirstName = FIRST_NAME_TO_CANONICAL[trimmed.toLowerCase()]
    if (byFirstName) return byFirstName
  }
  if (parts.length >= 2) {
    const reversed = parts.slice(1).join(' ') + ' ' + parts[0]
    const knownReversed = CANONICAL_NAME[reversed.toLowerCase()]
    if (knownReversed) return knownReversed
  }
  return trimmed
}

export interface TargetRow {
  nimi: string
  liittKpl: number; liittTavoite: number; liittRunrate: number; liittPerPaiva: number
  fsecKpl: number; fsecTavoite: number; fsecRunrate: number
  kassaKate: number; kassaTavoite: number; kassaRunrate: number
  kassaMyynti: number; kassaPalautus: number; kassaAlennus: number; kassaKuitit: number; kassaPerPaiva: number
  paivat: number; liittEur: number
  dnaUusmyynti: number; elisaUusmyynti: number; teliaUusmyynti: number
  uusmyyntiYhteensa: number; uusmyyntiPerPaiva: number; uusmyyntiRunrate: number
}

export type TargetsData = {
  kuukausi: string
  targets: TargetRow[]
  sheetNames: string[]
}

/**
 * Tavoitteet-välilehden puuttuminen on käyttäjän korjattavissa oleva tilanne
 * (väärä tiedosto valittuna), ei palvelinvirhe — reitti vastaa tähän 400:lla.
 * Oma virhetyyppi säilyttää sen erottelun kun laskenta siirtyi kirjastoon.
 */
export class TavoitteetPuuttuu extends Error {}

function findSheet(sheetNames: string[], ...patterns: string[]): string {
  for (const p of patterns) {
    const found = sheetNames.find(n => n.toLowerCase().includes(p.toLowerCase()))
    if (found) return found
  }
  return ''
}

export async function loadTargets(fileId: string): Promise<TargetsData> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const drive = google.drive({ version: 'v3', auth })

  const meta = await drive.files.get({ fileId, fields: 'name' })
  const fileName = meta.data.name ?? 'Myyntiseuranta'

  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: fileId })
  const sheetNames = sheetMeta.data.sheets?.map(s => s.properties?.title ?? '') ?? []

  const tavoitteetSheet = findSheet(sheetNames, 'tavoitteet')
  const kassakateSheet = findSheet(sheetNames, 'kassakate', 'kassamyynti')
  const dataSheet = findSheet(sheetNames, 'data')
  const myyjatSheet = findSheet(sheetNames, 'myyjät yhteensä', 'myyjat yhteensa')

  if (!tavoitteetSheet) {
    throw new TavoitteetPuuttuu(`Tavoitteet-välilehteä ei löytynyt (löytyi: ${sheetNames.join(', ')})`)
  }

  // ---- Tavoitteet: rivi 1 otsikko, rivi 2 headerit, rivi 3+ data ----
  const targetsMap: Record<string, { nimi: string; liittTavoite: number; fsecTavoite: number; kassaTavoite: number }> = {}
  {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: `'${tavoitteetSheet}'!A1:BZ200` })
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
  const actualsMap: Record<string, {
    liittKpl: number; liittEur: number; fsecKpl: number
    dnaUusmyynti: number; elisaUusmyynti: number; teliaUusmyynti: number
  }> = {}
  if (myyjatSheet) {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: `'${myyjatSheet}'!A1:BZ200` })
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
      // Uusmyynti operaattoreittain (Tavoitteet ja Run Rate -> Uusmyynti-välilehti). Elisan
      // uusmyynti näkyy datassa "ELISA Pakettiliittymät" -sarakkeena, ei omana uusmyynti-sarakkeena.
      const idxDnaUusmyynti = findCol(headers, 'dna uusmyynti')
      const idxElisaUusmyynti = findCol(headers, 'elisa pakettiliittymät', 'elisa paketti')
      const idxTeliaUusmyynti = findCol(headers, 'telia uusmyynti')
      const idxTeliaYritysUusmyynti = findCol(headers, 'telia yritysliittymä uusmyynti', 'telia yritys uusmyynti')

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
          dnaUusmyynti: idxDnaUusmyynti >= 0 ? parseNum(row[idxDnaUusmyynti]) : 0,
          elisaUusmyynti: idxElisaUusmyynti >= 0 ? parseNum(row[idxElisaUusmyynti]) : 0,
          teliaUusmyynti: (idxTeliaUusmyynti >= 0 ? parseNum(row[idxTeliaUusmyynti]) : 0) + (idxTeliaYritysUusmyynti >= 0 ? parseNum(row[idxTeliaYritysUusmyynti]) : 0),
        }
      }
    }
  }

  // ---- Kassakate: myynti / palautus / alennus / kuitit ----
  const kassaMap: Record<string, { kassaMyynti: number; kassaPalautus: number; kassaAlennus: number; kassaKuitit: number; kassaKate: number }> = {}
  if (kassakateSheet) {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: `'${kassakateSheet}'!A1:BZ200` })
    const rows = (res.data.values ?? []).map((r: unknown[]) => r.map((c: unknown) => String(c ?? '')))

    let headerIdx = -1
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].some(c => ['myyjä', 'myyjat', 'nimi'].includes(c.toLowerCase().trim()))) { headerIdx = i; break }
    }

    if (headerIdx >= 0) {
      const headers = rows[headerIdx].map(h => h.toLowerCase().trim())
      // "Myyjä"-sarake sisältää usein vain etunimen/lempinimen (esim. "Joni V", "Steven"),
      // joka ei aina normalisoidu oikein — "Virallinen nimi" on luotettava täysi nimi.
      const idxNimi = findCol(headers, 'virallinen nimi', 'myyjä', 'myyjat', 'nimi')
      const idxMyynti = findCol(headers, 'myynti')
      const idxPalautus = findCol(headers, 'palautus', 'palautukset')
      const idxAlennus = findCol(headers, 'alennus', 'alennukset')
      const idxKuitit = findCol(headers, 'kuitti', 'kuitit')
      const idxKate = findCol(headers, 'kate', 'kassakate')

      // Sama myyjä voi esiintyä usealla rivillä (eri kustannuspaikat) — summataan.
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

        const key = nimi.toLowerCase()
        const prev = kassaMap[key] ?? { kassaMyynti: 0, kassaPalautus: 0, kassaAlennus: 0, kassaKuitit: 0, kassaKate: 0 }
        kassaMap[key] = {
          kassaMyynti: prev.kassaMyynti + kassaMyynti,
          kassaPalautus: prev.kassaPalautus + kassaPalautus,
          kassaAlennus: prev.kassaAlennus + kassaAlennus,
          kassaKuitit: prev.kassaKuitit + kassaKuitit,
          kassaKate: prev.kassaKate + kassaKate,
        }
      }
    }
  }

  // ---- data: kuluneet työpäivät myyjää kohden ----
  const paivatMap: Record<string, number> = {}
  if (dataSheet) {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: `'${dataSheet}'!A1:BZ200` })
    const rows = (res.data.values ?? []).map((r: unknown[]) => r.map((c: unknown) => String(c ?? '')))
    const headers = rows[0]?.map(h => h.toLowerCase().trim()) ?? []
    const idxNimi = findCol(headers, 'nimi', 'myyjä')
    const idxPaivat = findCol(headers, 'toteutuneet työpäivät', 'työpäivät', 'päivät', 'tyopaiva', 'päivä')

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
    const actual = actualsMap[key] ?? { liittKpl: 0, liittEur: 0, fsecKpl: 0, dnaUusmyynti: 0, elisaUusmyynti: 0, teliaUusmyynti: 0 }
    const kassa = kassaMap[key] ?? { kassaMyynti: 0, kassaPalautus: 0, kassaAlennus: 0, kassaKuitit: 0, kassaKate: 0 }
    const paivat = paivatMap[key] ?? 0
    const uusmyyntiYhteensa = actual.dnaUusmyynti + actual.elisaUusmyynti + actual.teliaUusmyynti

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
      dnaUusmyynti: actual.dnaUusmyynti,
      elisaUusmyynti: actual.elisaUusmyynti,
      teliaUusmyynti: actual.teliaUusmyynti,
      uusmyyntiYhteensa,
      uusmyyntiPerPaiva: paivat > 0 ? uusmyyntiYhteensa / paivat : 0,
      uusmyyntiRunrate: t.liittTavoite > 0 ? (uusmyyntiYhteensa / t.liittTavoite) * 100 : 0,
    }
  }).filter(t => t.nimi !== 'Albin Rashica')
    .sort((a, b) => b.liittRunrate - a.liittRunrate)

  return { kuukausi: fileName, targets, sheetNames }
}
