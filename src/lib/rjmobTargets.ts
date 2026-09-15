import { google } from 'googleapis'
import { isRJMobSeller, shouldSkip, RJ_MOB_SELLERS } from '@/lib/rjmob'
import { haeTavoitteet } from '@/lib/rjmobTavoiteDrive'
import { kuukausiTiedostonimesta } from '@/lib/rjmobTavoiteTaulukko'
import { UUSI_LUKULAHDE_ALKAEN, KASSAKATE_KERROIN } from '@/lib/rjmobMyymalaTaulukko'

/** Kuukauden myynnit ja tavoitteet. Tavoitteet eivät rajaa myyntirivejä.
 * Elokuu 2026 alkaen käytetään samaa Drive-tavoitelähdettä kuin päätaulukko.
 * Kassamyynnin erittely pysyy omassa lähteessään; sitä ei päätellä katteesta.
 */

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

function findCol(headers: string[], ...patterns: string[]): number {
  for (const p of patterns) {
    const normalized = p.toLowerCase().trim().replace(/\s+/g, ' ')
    const idx = headers.findIndex(h => h.toLowerCase().trim().replace(/\s+/g, ' ').includes(normalized))
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
  liittKpl: number | null; liittTavoite: number | null; liittRunrate: number | null; liittPerPaiva: number | null
  fsecKpl: number | null; fsecTavoite: number | null; fsecRunrate: number | null
  kassaKate: number | null; kassaTavoite: number | null; kassaRunrate: number | null
  kassaMyynti: number | null; kassaPalautus: number | null; kassaAlennus: number | null; kassaKuitit: number | null; kassaPerPaiva: number | null
  paivat: number | null; liittEur: number | null
  dnaUusmyynti: number | null; elisaUusmyynti: number | null; teliaUusmyynti: number | null
  uusmyyntiYhteensa: number | null; uusmyyntiPerPaiva: number | null; uusmyyntiRunrate: number | null
}

export type TargetsData = {
  kuukausi: string
  targets: TargetRow[]
  sheetNames: string[]
  varoitukset: string[]
}

/** Kuukautta ei tunnisteta: mitään toista kuukautta ei käytetä varalla. */
export class TavoitteetPuuttuu extends Error {}

// Erillinen tavoitekansio otettiin käyttöön elokuussa 2026.
const DRIVE_TAVOITTEET_ALKAEN = 202608

const summa = (a: number | null, b: number | null) => a === null || b === null ? null : a + b
const suhde = (a: number | null, b: number | null, kerroin = 1) =>
  a !== null && b !== null && b > 0 ? a / b * kerroin : null
const solu = (row: string[], col: number): number | null => {
  if (col < 0) return null
  const raw = String(row[col] ?? '').trim()
  if (!raw || raw === '-' || raw.includes('#')) return null
  const n = Number(raw.replace(/\s|€/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

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
  const kuukausi = kuukausiTiedostonimesta(fileName)
  if (!kuukausi) throw new TavoitteetPuuttuu('Myyntitiedoston kuukautta ja vuotta ei tunnistettu')
  const uusiLahde = kuukausi.order >= UUSI_LUKULAHDE_ALKAEN
  const varoitukset: string[] = []

  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: fileId })
  const sheetNames = sheetMeta.data.sheets?.map(s => s.properties?.title ?? '') ?? []

  const tavoitteetSheet = findSheet(sheetNames, 'tavoitteet')
  const kassakateSheet = findSheet(sheetNames, 'kassakate', 'kassamyynti')
  const dataSheet = findSheet(sheetNames, 'data')
  // Elokuusta 2026 "Myyjät Yhteensä" on poistettu tiedostosta, jolloin toteumat
  // (liittymät, F-Secure, uusmyynti) luetaan "Myyjät Myymälöittäin"
  // -välilehdeltä. Järjestys on tarkoituksella tämä: kun valmis yhteenveto on
  // olemassa (heinäkuu ja vanhemmat), käytetään sitä eikä summata riveistä.
  // Sama tunnistus kuin rjmobSheets.ts:n loadDashDatassa.
  const myymaloittain = findSheet(sheetNames, 'myyjät myymälöittäin', 'myyjat myymaloittain', 'myymäl', 'myymal')
  const myyjatSheet = uusiLahde ? myymaloittain
    : findSheet(sheetNames, 'myyjät yhteensä', 'myyjat yhteensa') || myymaloittain

  const targetsMap: Record<string, { nimi: string; liittTavoite: number | null; fsecTavoite: number | null; kassaTavoite: number | null }> = {}
  if (kuukausi.order >= DRIVE_TAVOITTEET_ALKAEN) {
    try {
      const tavoitteet = await haeTavoitteet(kuukausi.order, kuukausi.nimi)
      varoitukset.push(...tavoitteet.varoitukset)
      for (const t of tavoitteet.myyjat) {
        const nimi = normalizeName(t.nimi)
        targetsMap[nimi.toLowerCase()] = { nimi, liittTavoite: t.liittymat, fsecTavoite: t.fsecure, kassaTavoite: t.kassakate }
      }
    } catch {
      varoitukset.push('Kuukauden tavoitteiden haku epäonnistui. Myyntitiedot näytetään ilman tavoitteita.')
    }
  } else if (tavoitteetSheet) {
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
        liittTavoite: solu(row, idxLiitt),
        fsecTavoite: solu(row, idxFsec),
        kassaTavoite: solu(row, idxKassa),
      }
    }
  }

  // ---- Myyjät Yhteensä: toteutuneet liittymät ja F-Secure ----
  const actualsMap: Record<string, {
    liittKpl: number | null; liittEur: number | null; fsecKpl: number | null; kassaKate: number | null
    dnaUusmyynti: number | null; elisaUusmyynti: number | null; teliaUusmyynti: number | null
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
      const idxKate = headers.findIndex(h => h === 'kassakate')
      const idxDnaUusmyynti = findCol(headers, 'dna uusmyynti')
      const idxElisaUusmyynti = findCol(headers, 'elisa pakettiliittymät', 'elisa paketti')
      const idxTeliaUusmyynti = findCol(headers, 'telia uusmyynti')
      const idxTeliaYritysUusmyynti = findCol(headers, 'telia yritysliittymä uusmyynti', 'telia yritys uusmyynti')

      if ([idxDnaUusmyynti, idxElisaUusmyynti, idxTeliaUusmyynti].some(i => i < 0)) varoitukset.push('Uusmyynnin operaattorierittelyssä on puuttuvia sarakkeita.')
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i]
        const rawNimi = row[idxNimi >= 0 ? idxNimi : 1]?.trim() ?? ''
        if (!rawNimi || shouldSkip(rawNimi) || rawNimi === 'Kaikki myymälät') continue
        const nimi = normalizeName(rawNimi)
        if (!isRJMobSeller(nimi)) continue

        const fsecKpl = idxFsecTotal >= 0 && idxFsecInternet >= 0
          ? summa(solu(row, idxFsecTotal), solu(row, idxFsecInternet)) : solu(row, idxFsecKpl)

        // Summataan eikä korvata: "Myyjät Myymälöittäin" -välilehdellä sama
        // myyjä esiintyy kerran jokaisesta myymälästä jossa hän on myynyt.
        // Vanhalla "Myyjät Yhteensä" -välilehdellä rivi on yksi per myyjä,
        // joten summaus käyttäytyy siellä täsmälleen kuin korvaus.
        const key = nimi.toLowerCase()
        const edell = actualsMap[key] ?? {
          liittKpl: 0, liittEur: 0, fsecKpl: 0, kassaKate: 0,
          dnaUusmyynti: 0, elisaUusmyynti: 0, teliaUusmyynti: 0,
        }
        actualsMap[key] = {
          liittKpl: summa(edell.liittKpl, solu(row, idxLiittKpl)),
          liittEur: summa(edell.liittEur, solu(row, idxLiittEur)),
          fsecKpl: summa(edell.fsecKpl, fsecKpl),
          kassaKate: summa(edell.kassaKate, solu(row, idxKate)),
          dnaUusmyynti: summa(edell.dnaUusmyynti, solu(row, idxDnaUusmyynti)),
          elisaUusmyynti: summa(edell.elisaUusmyynti, solu(row, idxElisaUusmyynti)),
          teliaUusmyynti: summa(edell.teliaUusmyynti, summa(solu(row, idxTeliaUusmyynti), idxTeliaYritysUusmyynti >= 0 ? solu(row, idxTeliaYritysUusmyynti) : 0)),
        }
      }
    }
  }

  // ---- Kassakate: myynti / palautus / alennus / kuitit ----
  const kassaMap: Record<string, { kassaMyynti: number | null; kassaPalautus: number | null; kassaAlennus: number | null; kassaKuitit: number | null; kassaKate: number | null }> = {}
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
      // ⚠️ Tämä osuu tarkoituksella sarakkeeseen A ("Nimikorjaus"), ei
      // sarakkeeseen C ("Nimi") — `findCol` vertaa osajonolla, ja
      // "Nimikorjaus" sisältää sanan "nimi" ja tulee ensin.
      //
      // Se EI ole bugi:
      //
      //   sarake C       myyjän RAAKANIMI ("Steven")
      //   sarake A       =XLOOKUP(C2; J:J; K:K; C2) kääntää sen koko
      //                  nimeksi ("Steven Sainio") hakutaulusta J:K
      //   tämä lukukohta lukee sarakkeen A eli valmiiksi korjatun nimen,
      //                  joka on ainoa muoto joka matchaa RJ_MOB_SELLERS-
      //                  listaan
      //
      // Jos tämän "korjaa" osumaan sarakkeeseen C, nimimatch hajoaa:
      // lyhytnimet ("Joni V", "Kasperi K.") eivät vastaa myyjälistaa ja
      // kassaluvut katoavat kaikilta. (Sarake C:n kirjoitti ennen automaattinen
      // Winpos-tuonti, poistettu 15.9.2026 — ks. CLAUDE.md, "Winpos-tuonti on
      // poistettu". Kaava sarakkeessa A säilyy, jos joku täyttää sarakkeen C
      // käsin.)
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

        const kassaMyynti = solu(row, idxMyynti)
        const kassaPalautus = solu(row, idxPalautus)
        const kassaAlennus = solu(row, idxAlennus)
        const kassaKuitit = solu(row, idxKuitit)
        const kassaKate = idxKate >= 0 ? solu(row, idxKate) : kassaMyynti !== null && kassaPalautus !== null && kassaAlennus !== null ? kassaMyynti - kassaPalautus - kassaAlennus : null

        const key = nimi.toLowerCase()
        const prev = kassaMap[key] ?? { kassaMyynti: 0, kassaPalautus: 0, kassaAlennus: 0, kassaKuitit: 0, kassaKate: 0 }
        kassaMap[key] = {
          kassaMyynti: summa(prev.kassaMyynti, kassaMyynti),
          kassaPalautus: summa(prev.kassaPalautus, kassaPalautus),
          kassaAlennus: summa(prev.kassaAlennus, kassaAlennus),
          kassaKuitit: summa(prev.kassaKuitit, kassaKuitit),
          kassaKate: summa(prev.kassaKate, kassaKate),
        }
      }
    }
  }

  // ---- data: kuluneet työpäivät myyjää kohden ----
  const paivatMap: Record<string, number | null> = {}
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
        paivatMap[nimi.toLowerCase()] = solu(row, idxPaivat)
      }
    }
  }

  if (!myyjatSheet || Object.keys(actualsMap).length === 0) varoitukset.push('Myyntitietoja ei löytynyt valitulta kuukaudelta.')
  if (!kassakateSheet) varoitukset.push('Kassamyynnin erittely puuttuu valitulta kuukaudelta.')
  if (!Object.keys(paivatMap).length) varoitukset.push('Toteutuneita työpäiviä ei löytynyt. Päiväkohtaisia lukuja ei lasketa.')

  // Myynti näkyy myös ilman tavoitetta, tavoite myös ilman myyntiriviä.
  const nimet = new Set([...Object.keys(targetsMap), ...Object.keys(actualsMap), ...Object.keys(kassaMap)])
  const targets: TargetRow[] = Array.from(nimet).filter(key => isRJMobSeller(key)).map(key => {
    const t = targetsMap[key] ?? { nimi: normalizeName(key), liittTavoite: null, fsecTavoite: null, kassaTavoite: null }
    const actual = actualsMap[key] ?? { liittKpl: null, liittEur: null, fsecKpl: null, kassaKate: null, dnaUusmyynti: null, elisaUusmyynti: null, teliaUusmyynti: null }
    const kassa = kassaMap[key] ?? { kassaMyynti: null, kassaPalautus: null, kassaAlennus: null, kassaKuitit: null, kassaKate: null }
    const kate = uusiLahde ? actual.kassaKate === null ? null : actual.kassaKate * KASSAKATE_KERROIN : kassa.kassaKate
    const paivat = paivatMap[key] ?? null
    const uusmyyntiYhteensa = summa(summa(actual.dnaUusmyynti, actual.elisaUusmyynti), actual.teliaUusmyynti)

    return {
      nimi: t.nimi,
      liittKpl: actual.liittKpl,
      liittTavoite: t.liittTavoite,
      liittRunrate: suhde(actual.liittKpl, t.liittTavoite, 100),
      liittPerPaiva: suhde(actual.liittKpl, paivat),
      fsecKpl: actual.fsecKpl,
      fsecTavoite: t.fsecTavoite,
      fsecRunrate: suhde(actual.fsecKpl, t.fsecTavoite, 100),
      kassaKate: kate,
      kassaTavoite: t.kassaTavoite,
      kassaRunrate: suhde(kate, t.kassaTavoite, 100),
      kassaMyynti: kassa.kassaMyynti,
      kassaPalautus: kassa.kassaPalautus,
      kassaAlennus: kassa.kassaAlennus,
      kassaKuitit: kassa.kassaKuitit,
      kassaPerPaiva: suhde(kate, paivat),
      paivat,
      liittEur: actual.liittEur,
      dnaUusmyynti: actual.dnaUusmyynti,
      elisaUusmyynti: actual.elisaUusmyynti,
      teliaUusmyynti: actual.teliaUusmyynti,
      uusmyyntiYhteensa,
      uusmyyntiPerPaiva: suhde(uusmyyntiYhteensa, paivat),
      uusmyyntiRunrate: suhde(uusmyyntiYhteensa, t.liittTavoite, 100),
    }
  }).filter(t => t.nimi !== 'Albin Rashica')
    .sort((a, b) => (b.liittRunrate ?? -1) - (a.liittRunrate ?? -1))

  return { kuukausi: fileName, targets, sheetNames, varoitukset }
}
