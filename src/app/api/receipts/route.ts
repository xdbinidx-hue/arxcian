import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import ExcelJS from 'exceljs'
import { RJ_MOB_SELLERS, getTuntipalkka } from '@/lib/rjmob'

// Maksukuitin tiedostonimi kertoo MAKSUKUUKAUDEN, ei myyntikuukauden — esim. "Maksukuitti
// 5. Toukokuu" sisältää toukokuussa maksetut korvaukset, ei toukokuun myyntiä:
//   - Liittymäprovisiot: 3 kk viive (myynti helmikuu → aktivointi huhtikuu → maksu toukokuu)
//   - Kassakate ja F-Secure: 1 kk viive (edellisen kuukauden myynnistä)
// Tämä ei vaikuta itse parsintaan (kaikki luvut luetaan sellaisenaan siltä kuukausikuitilta
// jota pyydetään), mutta on oleellista kun tätä dataa verrataan myyntiseurantaan (ks.
// PAYOUT_DELAY trendit-sivulla).
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

// Nimet esiintyvät maksukuitin eri tauluissa vaihtelevasti: pelkkänä etunimenä isoin
// kirjaimin (esim. "ARBNOR" myymäläblokin sarakeotsikkona), "Etunimi Sukunimi" -muodossa
// tai "Sukunimi Etunimi" -muodossa (RJ_MOB_SELLERS listaa molemmat järjestykset pareina).
// Kaikki kolme muotoa normalisoidaan samaan kanoniseen "Etunimi Sukunimi" -nimeen, jotta
// sama myyjä ei pääse esiintymään kahtena eri rivinä eri tauluissa. Tuntematon nimi
// (esim. "Petri", "Muut") jää sellaisenaan, jotta rivi ei katoa vahingossa.
const CANONICAL_BY_ANY_FORM: Record<string, string> = {}
for (let i = 0; i + 1 < RJ_MOB_SELLERS.length; i += 2) {
  const canonical = RJ_MOB_SELLERS[i]
  const reversed = RJ_MOB_SELLERS[i + 1]
  CANONICAL_BY_ANY_FORM[canonical.toLowerCase()] = canonical
  CANONICAL_BY_ANY_FORM[reversed.toLowerCase()] = canonical
  CANONICAL_BY_ANY_FORM[canonical.split(' ')[0].toLowerCase()] = canonical
}

function normalizeSellerName(raw: string): string {
  const trimmed = raw.trim()
  const canonical = CANONICAL_BY_ANY_FORM[trimmed.toLowerCase()]
  if (canonical) return canonical
  // Tuntematon (esim. "Petri", "Muut") — näytetään omalla nimellä sellaisenaan.
  return trimmed.charAt(0) + trimmed.slice(1).toLowerCase()
}

const STORE_SECTIONS = ['HOLMA', 'SYKE', 'MALMI', 'EASTON', 'KIVISTÖ', 'MUUT MYYMÄLÄT']
const SIDE_PANEL_COL = 20 // sivupaneelien (Kassamyynti/Passiivitulo/Työntekijät) tavallisin alkusarake
// Käsin ylläpidetyissä kuukausikopioissa koko sivupaneelialue (Yhteenveto/Kassamyynti/Työntekijät/
// Passiivitulo) saattaa olla siirtynyt yhden sarakkeen vasemmalle (havaittu esim. huhtikuussa: koko
// alue sarakkeessa 19 eikä 20). Sarakehaku rajataan tästä alkaen, jotta myymäläblokin (sarakkeet
// 0-18) identtinen sana (esim. "F-SECURE") ei täsmää vahingossa ja sotke sarakelaskentaa.
const SIDE_PANEL_MIN_COL = 19

// Loppusarakkeen/-rivin otsikko vaihtelee kuukausikopioiden välillä ("TOTAL" vs "YHTEENSÄ") —
// jos molempia ei tunnisteta, loppusarake luetaan vahingossa ylimääräiseksi "myyjäksi" ja
// sen oma summa-arvo lasketaan mukaan tiimin kokonaissummaan (tuplaa luvut).
function isTotalLabel(v: string): boolean {
  const u = (v || '').trim().toUpperCase()
  return u === 'TOTAL' || u === 'YHTEENSÄ'
}

// Etsii sarakkeen jonka (trimmattu, isoiksi kirjaimiksi muutettu) arvo täsmää predikaattiin,
// alkaen minCol:sta — käytetään sivupaneelien sarakkeiden paikallistamiseen ilman kiinteää
// sarakeoletusta (ks. SIDE_PANEL_MIN_COL).
function findColFrom(row: string[], minCol: number, matches: (v: string) => boolean): number {
  for (let c = minCol; c < row.length; c++) {
    if (matches((row[c] || '').trim().toUpperCase())) return c
  }
  return -1
}

// Etsii rivin jolla jompikumpi sivupaneelin tavallisimmista alkusarakkeista (19 tai 20)
// täsmää predikaattiin — sietää edellä mainitun 1 sarakkeen siirtymän ilman että joudutaan
// skannaamaan koko riviä (mikä voisi osua myymäläblokin puolelle).
function findPanelRow(rows: string[][], matches: (v: string) => boolean): { rowIdx: number, col: number } | null {
  for (let i = 0; i < rows.length; i++) {
    for (const c of [SIDE_PANEL_MIN_COL, SIDE_PANEL_COL]) {
      if (matches((rows[i][c] || '').trim().toUpperCase())) return { rowIdx: i, col: c }
    }
  }
  return null
}

interface ReceiptSeller {
  nimi: string
  tuntipalkka: number
  provisio: number
  liittymat: number
  fsecEur: number
  bonus: number
  kassamyynti: number
  palkka: number
  verottomat: number
  sivukulut: number
  rjmobTulo: number
  netto: number
}

interface ReceiptStore {
  liittymat: number
  fsecEur: number
  bonus: number
  kassakate: number
  huoltokate: number
  rescueKate: number
}

interface KassamyyntiRow {
  kassakate: number
  huoltokate: number
  rescueKate: number
  ostorahdit: number
  rjmobOy: number
}

interface ReceiptsResult {
  kuukausi: string
  sellers: ReceiptSeller[]
  stores: Record<string, ReceiptStore>
  kassamyynti: Record<string, KassamyyntiRow>
  totals: {
    liittymat: number
    kassakate: number
    huoltokate: number
    rescueKate: number
    provisio: number
    netto: number
    fsecAsiakkuudet: number
    fsecPassiivitulo: number
    fsecEur: number
    bonus: number
    maksettavaSumma: number
    alv0: number
    tyontekijatKulu: number
  }
}

// ---- Yhteenveto-taulukko: koko yrityksen kooste myymälöittäin (LIITTYMÄT, KASSAKATE,
// F-SECURE, BONUS, PASSIIVI, TYÖNTEKIJÄT, YHTEENSÄ) + Yhteensä-rivi. Tämä on koko sivuston
// (trendit + kassamyynti-näkymä) pääasiallinen datalähde myymälä- ja kokonaistasolla —
// ei myymäläblokkien (12-rivin lohkot) laskennallinen summa, joka voi ajautua eriäväksi.
interface YhteenvetoRow {
  liittymat: number
  kassakate: number
  fsecEur: number
  bonus: number
  passiivi: number
  tyontekijat: number
  yhteensa: number
}

const YHTEENVETO_STORE_LABELS = ['Holma', 'Syke', 'Malmi', 'Easton', 'Kivistö', 'Muut']

function normalizeYhteenvetoStoreLabel(raw: string): string | null {
  const low = raw.trim().toLowerCase()
  if (!low) return null
  if (low === 'muut' || low === 'muut myymälät') return 'Muut myymälät'
  const match = YHTEENVETO_STORE_LABELS.find(s => s.toLowerCase() === low)
  return match ?? null
}

function parseYhteenveto(rows: string[][]): { perStore: Record<string, YhteenvetoRow>, yhteensa: YhteenvetoRow | null } {
  // Haku ja sarakkeiden tunnistus rajataan SIDE_PANEL_MIN_COL:sta alkaen. Myymäläblokit
  // (sarakkeet 0-18) ja sivupaneelit jakavat rivinumerot mutta eri sarakealueen — esim. jonkin
  // myymäläblokin oma "F-SECURE"-rivi voi osua samalle riville kuin Yhteenveto-taulukon
  // otsikkorivi. Ilman rajausta koko rivin skannaava haku voi täsmätä blokin puolelle ja
  // siirtää sarakelaskennan täysin väärään kohtaan (havaittu oikealla datalla).
  const headerIdx = rows.findIndex(r => {
    const seg = r.slice(SIDE_PANEL_MIN_COL).map(c => (c || '').trim().toUpperCase())
    return seg.includes('LIITTYMÄT') && seg.includes('KASSAKATE') && seg.includes('PASSIIVI')
  })
  if (headerIdx < 0) return { perStore: {}, yhteensa: null }

  const headerRow = rows[headerIdx]
  const col = {
    liittymat: findColFrom(headerRow, SIDE_PANEL_MIN_COL, v => v === 'LIITTYMÄT'),
    kassakate: findColFrom(headerRow, SIDE_PANEL_MIN_COL, v => v === 'KASSAKATE'),
    fsecure: findColFrom(headerRow, SIDE_PANEL_MIN_COL, v => v === 'F-SECURE'),
    bonus: findColFrom(headerRow, SIDE_PANEL_MIN_COL, v => v === 'BONUS'),
    passiivi: findColFrom(headerRow, SIDE_PANEL_MIN_COL, v => v === 'PASSIIVI'),
    tyontekijat: findColFrom(headerRow, SIDE_PANEL_MIN_COL, v => v.startsWith('TYÖNTEKIJÄ')),
    yhteensa: findColFrom(headerRow, SIDE_PANEL_MIN_COL, v => v === 'YHTEENSÄ'),
  }
  // Rivin nimi (myymälä) on sarake välittömästi ensimmäisen datasarakkeen vasemmalla puolella —
  // laskettu dynaamisesti, koska sivupaneelin alkusarake vaihtelee kuukausien välillä (ks.
  // SIDE_PANEL_MIN_COL-kommentti).
  const dataCols = [col.liittymat, col.kassakate, col.fsecure, col.bonus, col.passiivi].filter(c => c >= 0)
  const labelCol = dataCols.length ? Math.max(0, Math.min(...dataCols) - 1) : SIDE_PANEL_MIN_COL

  const readRow = (r: string[]): YhteenvetoRow => ({
    liittymat: col.liittymat >= 0 ? parseNum(r[col.liittymat]) : 0,
    kassakate: col.kassakate >= 0 ? parseNum(r[col.kassakate]) : 0,
    fsecEur: col.fsecure >= 0 ? parseNum(r[col.fsecure]) : 0,
    bonus: col.bonus >= 0 ? parseNum(r[col.bonus]) : 0,
    passiivi: col.passiivi >= 0 ? parseNum(r[col.passiivi]) : 0,
    tyontekijat: col.tyontekijat >= 0 ? parseNum(r[col.tyontekijat]) : 0,
    yhteensa: col.yhteensa >= 0 ? parseNum(r[col.yhteensa]) : 0,
  })

  const perStore: Record<string, YhteenvetoRow> = {}
  let yhteensa: YhteenvetoRow | null = null
  for (let i = headerIdx + 1; i < Math.min(rows.length, headerIdx + 15); i++) {
    const label = (rows[i][labelCol] || '').trim()
    if (!label) continue
    if (isTotalLabel(label)) { yhteensa = readRow(rows[i]); break }
    const storeName = normalizeYhteenvetoStoreLabel(label)
    if (storeName) perStore[storeName] = readRow(rows[i])
  }
  return { perStore, yhteensa }
}

// ---- Maksu-taulukko: ALV0-kentän arvo on maksukuitin tarkistussumma (viitteellinen —
// Yhteenveto-taulukon YHTEENSÄ-rivi on ensisijainen lähde, koska se on laskettu suoraan
// kaikista osista eikä siihen liity pientä pyöristyseroa ALV0:aan nähden).
function parseMaksuAlv0(rows: string[][]): number {
  const maksuIdx = rows.findIndex(r => r.some(c => (c || '').trim().toLowerCase() === 'maksu'))
  if (maksuIdx < 0) return 0
  for (let i = maksuIdx; i < Math.min(rows.length, maksuIdx + 15); i++) {
    const row = rows[i]
    const alvCol = row.findIndex(c => (c || '').trim().toUpperCase().replace(/\s+/g, '') === 'ALV0')
    if (alvCol >= 0) {
      // ALV0 on sarakeotsikko (esim. rivillä "Maksu"); itse arvo on samassa sarakkeessa
      // seuraavalla rivillä ("EUR"-rivi) — ei otsikkorivin viereisessä solussa (siinä on
      // seuraava otsikko, esim. "ALV25,5%").
      for (let j = i + 1; j < Math.min(rows.length, i + 5); j++) {
        const v = parseNum(rows[j][alvCol])
        if (v !== 0) return v
      }
      return 0
    }
  }
  return 0
}

// ---- Kassamyynti-taulukko: myymäläkohtainen erittely (Kassakate, Huoltokate, Rescue kate,
// Ostorahdit, RJ-Mob Oy). Oma näkymä sivustolla, erillinen Yhteenveto-taulukosta.
function parseKassamyynti(rows: string[][]): Record<string, KassamyyntiRow> {
  // Ks. SIDE_PANEL_MIN_COL-kommentti: koko sivupaneelialue voi olla siirtynyt yhden sarakkeen —
  // otsikkorivi ja sarakkeet haetaan dynaamisesti kiinteän SIDE_PANEL_COL-oletuksen sijaan.
  const headerIdx = rows.findIndex(r => {
    const seg = r.slice(SIDE_PANEL_MIN_COL).map(c => (c || '').trim().toUpperCase())
    return seg.includes('KASSAKATE') && seg.includes('HUOLTOKATE')
  })
  if (headerIdx < 0) return {}
  const headerRow = rows[headerIdx]
  const col = {
    kassakate: findColFrom(headerRow, SIDE_PANEL_MIN_COL, v => v === 'KASSAKATE'),
    huoltokate: findColFrom(headerRow, SIDE_PANEL_MIN_COL, v => v === 'HUOLTOKATE'),
    rescueKate: findColFrom(headerRow, SIDE_PANEL_MIN_COL, v => v.includes('RESCUE')),
    ostorahdit: findColFrom(headerRow, SIDE_PANEL_MIN_COL, v => v.includes('OSTORAH')),
    rjmobOy: findColFrom(headerRow, SIDE_PANEL_MIN_COL, v => v.replace(/[-\s]/g, '').includes('RJMOB')),
  }
  const labelCol = col.kassakate >= 0 ? Math.max(0, col.kassakate - 1) : SIDE_PANEL_MIN_COL
  const result: Record<string, KassamyyntiRow> = {}
  for (let i = headerIdx + 1; i < Math.min(rows.length, headerIdx + 8); i++) {
    const row = rows[i]
    const label = (row[labelCol] || '').trim()
    if (!label) continue
    // Yhteensä/Total-rivi on koko yrityksen loppusumma, ei oma myymälä — pysäytetään tähän
    // ettei se päädy 7. "myymäläksi" ja tuplaa /kassamyynti-sivun itse laskemaa Yhteensä-riviä.
    if (isTotalLabel(label)) break
    const storeName = label.toLowerCase() === 'muut' ? 'Muut myymälät' : label
    result[storeName] = {
      kassakate: col.kassakate >= 0 ? parseNum(row[col.kassakate]) : 0,
      huoltokate: col.huoltokate >= 0 ? parseNum(row[col.huoltokate]) : 0,
      rescueKate: col.rescueKate >= 0 ? parseNum(row[col.rescueKate]) : 0,
      ostorahdit: col.ostorahdit >= 0 ? parseNum(row[col.ostorahdit]) : 0,
      rjmobOy: col.rjmobOy >= 0 ? parseNum(row[col.rjmobOy]) : 0,
    }
  }
  return result
}

function parseReceiptRows(rows: string[][], fileName: string): ReceiptsResult {
  // Rivi jolla ensimmäinen solu on "MYYJÄ" — pääotsikkorivi, josta kaikki muut
  // rivisiirtymät lasketaan suhteellisesti (kuukausikopiot ovat käsin ylläpidettyjä
  // ja saattavat sisältää ylimääräisiä/puuttuvia rivejä otsikon yläpuolella).
  const headerIdx = rows.findIndex(r => (r[0] || '').trim().toUpperCase() === 'MYYJÄ')
  if (headerIdx < 0) throw new Error('Otsikkoriviä "MYYJÄ" ei löytynyt')

  const headerRow = rows[headerIdx]
  // Loppusarakkeen otsikko vaihtelee kuukausikopioiden välillä ("TOTAL" vs "YHTEENSÄ") —
  // jos tätä ei tunnisteta, loppusarake luetaan vahingossa ylimääräiseksi "myyjäksi".
  const totalColIdx = headerRow.findIndex((c, i) => i > 0 && isTotalLabel(c))
  const sellerCols: { nimi: string, col: number }[] = []
  for (let c = 1; c < (totalColIdx > 0 ? totalColIdx : headerRow.length); c++) {
    const raw = (headerRow[c] || '').trim()
    if (!raw) continue
    sellerCols.push({ nimi: normalizeSellerName(raw), col: c })
  }

  // ---- Kassamyynti-taulukko (Kassakate/Huoltokate/Rescue kate/Ostorahdit/RJ-Mob Oy per myymälä) ----
  const kassamyynti = parseKassamyynti(rows)

  // ---- Yhteenveto-taulukko: koko yrityksen kooste myymälöittäin — ensisijainen lähde
  // stores/totals-kentille (ks. parseYhteenveto). Myymäläblokin (12-rivin lohko) TOTAL-sarake
  // toimii varalähteenä vain jos Yhteenveto-taulukkoa ei löydy tältä kuukaudelta.
  const { perStore: yhteenvetoPerStore, yhteensa: yhteenvetoTotal } = parseYhteenveto(rows)
  const alv0 = parseMaksuAlv0(rows)

  // ---- Myymäläkohtaiset 12-rivin lohkot (liittymät, kokonaisprovisio per myyjä) ----
  // Rivijärjestys blokin sisällä (havaittu todellisesta datasta): DNA AUVO, DNA VISIO,
  // TELIA, ELISA, TOTAL(liittymät), F-SECURE, KASSAKATE 10%, HUOLTO, BONUS, TOTAL(lisät), TOTAL(kaikki).
  const stores: Record<string, ReceiptStore> = {}
  const provisioBySeller: Record<string, number> = {}
  const liittymatBySeller: Record<string, number> = {}
  // F-Secure ja Bonus ovat kaksi erillistä riviä tuottotaulukossa (F-Secure € ja Bonukset €) —
  // pidetään ne erillään sen sijaan että summattaisiin yhdeksi "fsecEur"-luvuksi, joka
  // aiemmin yliarvioi F-Securen osuuden bonuksen verran.
  const fsecureBySeller: Record<string, number> = {}
  const bonusBySeller: Record<string, number> = {}

  for (const storeLabel of STORE_SECTIONS) {
    const idx = rows.findIndex(r => (r[0] || '').trim() === storeLabel)
    if (idx < 0) continue
    const liittRow = rows[idx + 5]   // " TOTAL" (DNA AUVO+VISIO+TELIA+ELISA)
    const fsecRow = rows[idx + 6]    // " F-SECURE" (myymälän F-Secure-provisio)
    const bonusRow = rows[idx + 9]   // "BONUS" (myyjäkohtainen bonus, sis. F-Secure/DNA-bonukset)
    const grandRow = rows[idx + 11]  // "TOTAL" (koko myymälän kokonaisprovisio per myyjä)
    if (!liittRow || !grandRow) continue

    const storeName = storeLabel === 'MUUT MYYMÄLÄT' ? 'Muut myymälät' : storeLabel.charAt(0) + storeLabel.slice(1).toLowerCase()
    const yv = yhteenvetoPerStore[storeName]
    const km = kassamyynti[storeName]

    stores[storeName] = {
      liittymat: yv ? yv.liittymat : (totalColIdx > 0 ? parseNum(liittRow[totalColIdx]) : 0),
      fsecEur: yv ? yv.fsecEur : (totalColIdx > 0 && fsecRow ? parseNum(fsecRow[totalColIdx]) : 0),
      bonus: yv ? yv.bonus : (totalColIdx > 0 && bonusRow ? parseNum(bonusRow[totalColIdx]) : 0),
      kassakate: yv ? yv.kassakate : (km ? km.kassakate : 0),
      huoltokate: km ? km.huoltokate : 0,
      rescueKate: km ? km.rescueKate : 0,
    }

    for (const s of sellerCols) {
      provisioBySeller[s.nimi] = (provisioBySeller[s.nimi] ?? 0) + parseNum(grandRow[s.col])
      liittymatBySeller[s.nimi] = (liittymatBySeller[s.nimi] ?? 0) + parseNum(liittRow[s.col])
      const fsecPart = fsecRow ? parseNum(fsecRow[s.col]) : 0
      const bonusPart = bonusRow ? parseNum(bonusRow[s.col]) : 0
      fsecureBySeller[s.nimi] = (fsecureBySeller[s.nimi] ?? 0) + fsecPart
      bonusBySeller[s.nimi] = (bonusBySeller[s.nimi] ?? 0) + bonusPart
    }
  }

  // ---- Työntekijät-paneeli: Bruttopalkka / Verottomat / Sivukuluineen / Tulos per työntekijä ----
  // Otsikko vaihtelee kuukausikopioiden välillä ("Työntekijät" vs "Työntekijä") — startsWith
  // sallii molemmat ilman että osuu RJ-Mob Oy -laatikon TYÖNTEKIJÄT-sarakeotsikkoon (eri
  // sarake). findPanelRow sietää koko sivupaneelialueen 1 sarakkeen siirtymän (ks.
  // SIDE_PANEL_MIN_COL) — kiinteä SIDE_PANEL_COL aiheutti tyhjän datan niille kuukausille
  // joissa paneelit alkavat sarakkeesta 19.
  const tyontekijatPanel = findPanelRow(rows, v => v.startsWith('TYÖNTEKIJÄ'))
  const tyontekijatHeaderIdx = tyontekijatPanel?.rowIdx ?? -1
  const empCols: { nimi: string, col: number }[] = []
  if (tyontekijatPanel) {
    const empHeaderRow = rows[tyontekijatHeaderIdx]
    for (let c = tyontekijatPanel.col + 1; c < empHeaderRow.length; c++) {
      const raw = (empHeaderRow[c] || '').trim()
      if (!raw || isTotalLabel(raw)) continue
      empCols.push({ nimi: normalizeSellerName(raw), col: c })
    }
  }
  // Bruttopalkka/Verottomat/Sivukuluineen/Tulos-rivit haetaan omalla rivitekstillään kiinteän
  // rivisiirtymän sijaan — myymälärivien määrä (ja siten Työntekijät-otsikon jälkeisten rivien
  // määrä ennen näitä) on havaittu vaihtelevan kuukausien välillä (esim. huhtikuu), jolloin
  // kiinteä +9/+10/+11/+13 osui väärälle riville (mm. "Kerroin"-riville).
  const findLabeledRow = (label: string): string[] | undefined => {
    if (!tyontekijatPanel) return undefined
    for (let i = tyontekijatHeaderIdx + 1; i < Math.min(rows.length, tyontekijatHeaderIdx + 20); i++) {
      if ((rows[i][tyontekijatPanel.col] || '').trim().toLowerCase() === label) return rows[i]
    }
    return undefined
  }
  const bruttoRow = findLabeledRow('bruttopalkka')
  const verottomatRow = findLabeledRow('verottomat')
  const sivukuluRow = findLabeledRow('sivukuluineen')
  const tulosRow = findLabeledRow('tulos')
  // Myyjäkohtainen Kassamyynti-rivi (kassakate+huoltokate+rescue kate-ostorahdit per työntekijä)
  // ei ole aina täytetty käsin ylläpidetyssä taulukossa (havaittu "Ei löydy" -teksti useissa
  // kuukausissa) — parseNum palauttaa tällöin 0:n, mikä on oikea varalähde kun dataa ei ole.
  const kassamyyntiRow = findLabeledRow('kassamyynti')

  // ---- Passiivitulo-paneeli: F-Secure-lisenssimäärä (koko tiimi) ----
  const passiivituloPanel = findPanelRow(rows, v => v === 'PASSIIVITULO')
  const passiivituloHeaderIdx = passiivituloPanel?.rowIdx ?? -1
  const passiivituloRow = passiivituloHeaderIdx >= 0 ? rows[passiivituloHeaderIdx + 1] : undefined

  // F-Secure-passiivitulo (koko kuukausi): Yhteenveto-taulukon Yhteensä-rivin PASSIIVI-sarake
  // on ensisijainen lähde. Varalähteenä sama "RJ-Mob Oy" -laatikko kuin ennen, siltä varalta
  // ettei Yhteenveto-taulukkoa löydy tältä kuukaudelta (esim. eri layout/PDF-tuonti).
  let fsecPassiivitulo = yhteenvetoTotal?.passiivi ?? 0
  if (!yhteenvetoTotal) {
    const rjmobBoxHeaderIdx = rows.findIndex(r =>
      (r[SIDE_PANEL_COL] || '').trim() === 'RJ-Mob Oy' &&
      r.slice(SIDE_PANEL_COL + 1, SIDE_PANEL_COL + 4).some(c => (c || '').trim().toUpperCase() === 'LIITTYMÄT'))
    if (rjmobBoxHeaderIdx >= 0) {
      const headerRow = rows[rjmobBoxHeaderIdx]
      const passiiviCol = headerRow.findIndex((c, i) => i > SIDE_PANEL_COL && (c || '').trim().toUpperCase() === 'PASSIIVI')
      const yhteensaIdx = rows.findIndex((r, i) => i > rjmobBoxHeaderIdx && i < rjmobBoxHeaderIdx + 20 && (r[SIDE_PANEL_COL] || '').trim().toLowerCase() === 'yhteensä')
      if (yhteensaIdx >= 0 && passiiviCol >= 0) fsecPassiivitulo = parseNum(rows[yhteensaIdx][passiiviCol])
    }
  }

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
      liittymat: liittymatBySeller[nimi] ?? 0,
      fsecEur: fsecureBySeller[nimi] ?? 0,
      bonus: bonusBySeller[nimi] ?? 0,
      kassamyynti: emp && kassamyyntiRow ? parseNum(kassamyyntiRow[emp.col]) : 0,
      palkka,
      verottomat,
      sivukulut,
      rjmobTulo: provisio,
      netto,
    }
  })

  const totals = {
    liittymat: yhteenvetoTotal ? yhteenvetoTotal.liittymat : Object.values(stores).reduce((s, r) => s + r.liittymat, 0),
    kassakate: yhteenvetoTotal ? yhteenvetoTotal.kassakate : Object.values(stores).reduce((s, r) => s + r.kassakate, 0),
    huoltokate: Object.values(stores).reduce((s, r) => s + r.huoltokate, 0),
    rescueKate: Object.values(stores).reduce((s, r) => s + r.rescueKate, 0),
    provisio: sellers.reduce((s, r) => s + r.provisio, 0),
    netto: sellers.reduce((s, r) => s + r.netto, 0),
    fsecAsiakkuudet: passiivituloRow && passiivituloPanel ? parseNum(passiivituloRow[passiivituloPanel.col + 4]) : 0,
    fsecPassiivitulo,
    // F-Secure kertaprovisio ja Bonukset (koko yritys): Yhteenveto-taulukon omat sarakkeet —
    // ensisijainen lähde, varalähteenä myymälöiden (stores) summa jos Yhteenveto-taulukkoa ei löydy.
    fsecEur: yhteenvetoTotal ? yhteenvetoTotal.fsecEur : Object.values(stores).reduce((s, r) => s + r.fsecEur, 0),
    bonus: yhteenvetoTotal ? yhteenvetoTotal.bonus : Object.values(stores).reduce((s, r) => s + r.bonus, 0),
    // Maksettava summa (tilille tuleva summa): Yhteenveto-taulukon YHTEENSÄ-rivi on ensisijainen
    // lähde (laskettu suoraan kaikista osista). ALV0 on Maksu-taulukon viitteellinen tarkistusluku
    // (pieni pyöristysero mahdollinen) ja toimii varalähteenä.
    maksettavaSumma: yhteenvetoTotal ? yhteenvetoTotal.yhteensa : alv0,
    alv0,
    // Työntekijäkulut (koko tiimi): Yhteenveto-taulukon TYÖNTEKIJÄT-sarake on koko yrityksen
    // työntekijäkustannus (tallennettu negatiivisena, koska YHTEENSÄ = LIITTYMÄT+KASSAKATE+
    // F-SECURE+BONUS+PASSIIVI+TYÖNTEKIJÄT) — ensisijainen lähde "money out" -kululle. Varalähteenä
    // sellers-taulukon sivukulut yhteensä, jos Yhteenveto-taulukkoa ei löydy tältä kuukaudelta.
    tyontekijatKulu: yhteenvetoTotal ? Math.abs(yhteenvetoTotal.tyontekijat) : sellers.reduce((s, r) => s + r.sivukulut, 0),
  }

  return {
    kuukausi: fileName.replace(/^Kopio tiedostosta\s+/i, ''),
    sellers,
    stores,
    kassamyynti,
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

    // Kuittikansiossa on vuosikansio(t) (esim. "2025", "2026") — kaikki vuodet listataan ja
    // yhdistetään, ei vain ensimmäinen Drive-haun palauttama (aiemmin luettiin vahingossa vain
    // yhtä vuotta kerrallaan, jolloin toisen vuosikansion lisääminen saattoi jopa PIILOTTAA
    // aiemmin näkyneen vuoden kuitit, koska Driven palautusjärjestys ei ole taattu). Jokainen
    // tiedosto merkitään sen kansion nimestä pääteltävällä vuodella, jotta frontend ei joudu
    // arvaamaan vuotta kuukausinumeron ja tämänhetkisen päivämäärän perusteella.
    const yearFoldersRes = await drive.files.list({
      q: `'${RECEIPTS_ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
    })
    const yearFolders = yearFoldersRes.data.files ?? []

    interface DriveFileWithYear { id?: string | null; name?: string | null; mimeType?: string | null; modifiedTime?: string | null; year: number | null }
    let rawFiles: DriveFileWithYear[]
    if (yearFolders.length > 0) {
      const perYear = await Promise.all(yearFolders.map(async yf => {
        const res = await drive.files.list({
          q: `'${yf.id}' in parents and trashed = false`,
          fields: 'files(id, name, mimeType, modifiedTime)',
        })
        const year = /^\d{4}$/.test((yf.name ?? '').trim()) ? Number(yf.name) : null
        return (res.data.files ?? []).map(f => ({ ...f, year }))
      }))
      rawFiles = perYear.flat()
    } else {
      // Varalähde: ei vuosikansioita, listataan juurikansio suoraan (vanha käytös).
      const listRes = await drive.files.list({
        q: `'${RECEIPTS_ROOT_FOLDER_ID}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, modifiedTime)',
      })
      rawFiles = (listRes.data.files ?? []).map(f => ({ ...f, year: null }))
    }
    rawFiles.sort((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''))

    // "Pohja" (template/blank) -tiedostot eivät ole todellista kuukausidataa — kuukausikopiot
    // ("Kopio tiedostosta Maksukuitti N. Kuukausi") tehdään niistä, mutta pohja itse jää kansioon.
    const files = rawFiles
      .filter(f => SPREADSHEET_MIMETYPES.includes(f.mimeType ?? ''))
      .filter(f => !(f.name ?? '').toLowerCase().includes('pohja'))

    if (req.nextUrl.searchParams.get('debugFull') === '1') {
      const dbgFileId = req.nextUrl.searchParams.get('fileId') ?? files[0]?.id
      if (!dbgFileId) return NextResponse.json({ error: 'no fileId' })
      const meta = await drive.files.get({ fileId: dbgFileId, fields: 'name,mimeType' })
      const rows = meta.data.mimeType === 'application/vnd.google-apps.spreadsheet'
        ? await loadRowsFromSheet(sheets, dbgFileId)
        : await loadRowsFromXlsx(drive, dbgFileId)
      const malmiIdx = rows.findIndex(r => (r[0] || '').trim() === 'MALMI')
      const malmiBlock = rows.slice(malmiIdx, malmiIdx + 12).map((r, i) => ({ row: malmiIdx + i, cells: r.slice(0, 20) }))
      const yhteenvetoLabelIdx = rows.findIndex(r => r.some(c => (c || '').trim().toLowerCase() === 'yhteenveto'))
      const yhteenvetoBox = rows.slice(Math.max(0, (yhteenvetoLabelIdx >= 0 ? yhteenvetoLabelIdx : 5) - 2), (yhteenvetoLabelIdx >= 0 ? yhteenvetoLabelIdx : 5) + 15).map((r, i) => ({ row: (yhteenvetoLabelIdx >= 0 ? yhteenvetoLabelIdx - 2 : 3) + i, cells: r.slice(19, 32) }))
      const maksuIdx = rows.findIndex(r => r.some(c => (c || '').trim().toLowerCase() === 'maksu'))
      const maksuBox = maksuIdx >= 0 ? rows.slice(maksuIdx, maksuIdx + 6).map((r, i) => ({ row: maksuIdx + i, cells: r.slice(19, 32) })) : []
      const kassamyyntiIdx = rows.findIndex(r => r.some(c => (c || '').trim().toLowerCase() === 'kassamyynti'))
      const kassamyyntiBox = kassamyyntiIdx >= 0 ? rows.slice(kassamyyntiIdx, kassamyyntiIdx + 10).map((r, i) => ({ row: kassamyyntiIdx + i, cells: r.slice(19, 32) })) : []
      const passiivituloPanelDbg = findPanelRow(rows, v => v === 'PASSIIVITULO')
      const passiivituloIdxDbg = passiivituloPanelDbg?.rowIdx ?? -1
      const passiivituloBox = passiivituloIdxDbg >= 0 ? rows.slice(passiivituloIdxDbg, passiivituloIdxDbg + 15).map((r, i) => ({ row: passiivituloIdxDbg + i, cells: r.slice(19, 32) })) : []
      const tyontekijatPanelDbg = findPanelRow(rows, v => v.startsWith('TYÖNTEKIJÄ'))
      const tyontekijatIdx = tyontekijatPanelDbg?.rowIdx ?? -1
      const tyontekijatBox = tyontekijatIdx >= 0 ? rows.slice(tyontekijatIdx, tyontekijatIdx + 20).map((r, i) => ({ row: tyontekijatIdx + i, cells: r.slice(19, 36) })) : []
      // Ajetaan myös varsinaiset parserit läpi, jotta debugFull näyttää suoraan mitä
      // tuotantokoodi lukisi tästä samasta tiedostosta (helpottaa uuden layoutin diagnosointia).
      const parsedYhteenveto = parseYhteenveto(rows)
      const parsedKassamyynti = parseKassamyynti(rows)
      const parsedAlv0 = parseMaksuAlv0(rows)
      return NextResponse.json({ name: meta.data.name, malmiBlock, yhteenvetoLabelIdx, yhteenvetoBox, maksuIdx, maksuBox, kassamyyntiIdx, kassamyyntiBox, passiivituloIdxDbg, passiivituloBox, tyontekijatIdx, tyontekijatBox, parsedYhteenveto, parsedKassamyynti, parsedAlv0 })
    }

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
