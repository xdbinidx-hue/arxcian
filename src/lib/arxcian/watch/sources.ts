import { google } from 'googleapis'
import { fetchAndCache } from '../cache'
import type { Owner } from '@/lib/session'
import type { WatchAction, WatchList, WatchResult, WatchSource, WatchType } from './types'

export type WatchSourcesFrom = WatchResult['sourcesFrom']

/**
 * Lähdelistan luku Drive-taulukosta.
 *
 * **Lähdelista on taulukossa, ei koodissa.** Palvelutilillä on jo
 * `spreadsheets.readonly` RJ-Mobia varten, joten uutta tunnistautumista ei
 * tarvita, ja Albin voi lisätä kanavan lisäämättä koodiriviä.
 *
 * Sarakkeet: `lista`, `nimi`, `tyyppi`, `tunniste`, `toiminto`, `omistaja`,
 * `aktiivinen`. Yksi taulukko kaikille osioille — `lista`-sarake on juuri se
 * mikä tekee tästä yhden mekanismin eikä kolmea.
 *
 * **Tyhjä lähdelista on virhe, ei tulos.** Jos taulukko katoaa, nimetään
 * uudelleen tai sarakeotsikko kirjoitetaan väärin, haku heittää — muuten
 * watch näyttäisi "ei uutta sisältöä" ikuisesti sen sijaan että kertoisi
 * olevansa rikki. Heitto vie `fetchAndCache`n vanhentuneeseen listaan, ja jos
 * sitäkään ei ole, alla olevaan varalistaan. Sama päättely kuin
 * [channels.ts](../channels.ts):n `videos.length === 0` -heitossa.
 */

const CACHE_KEY = 'watch:sources'
const TTL_SECONDS = 6 * 60 * 60

/**
 * Taulukon id ympäristömuuttujasta.
 *
 * Puuttuva muuttuja ei ole virhe vaan "ei vielä otettu käyttöön": silloin
 * käytetään varalistaa eikä heitetä. Ero on olennainen — konfiguroimaton ja
 * rikki ovat eri tiloja, ja vain jälkimmäinen ansaitsee hälytyksen.
 */
function sheetId(): string | null {
  return process.env.WATCH_SOURCES_SHEET_ID?.trim() || null
}

/**
 * Koodiin käännetty varalista.
 *
 * Nämä ovat samat kanavat jotka hubin KANAVAT-paneeli jo seuraa, jaettuna
 * kahteen listaan. Toiminnot noudattavat CLAUDE.md:n linjausta: ICT pidetään
 * vain tuoreena, self-growth-kanavat ilmoitetaan.
 *
 * Varalista ei ole tarkoitettu pysyväksi. Se on se mikä pitää watchin
 * toimivana ennen kuin taulukko on olemassa, ja se mikä estää hiljaisen
 * pysähtymisen jos taulukko katoaa myöhemmin.
 */
const FALLBACK: readonly WatchSource[] = [
  { lista: 'trading', nimi: 'ICT Trading', tyyppi: 'youtube', tunniste: 'UCtjxa77NqamhVC8atV85Rog', toiminto: 'ei mitään', owner: 'shared', aktiivinen: true },
  { lista: 'trading', nimi: 'Mark Moss', tyyppi: 'youtube', tunniste: 'UC9ZM3N0ybRtp44-WLqsW3iQ', toiminto: 'ilmoita', owner: 'shared', aktiivinen: true },
  { lista: 'personal', nimi: 'Alex Hormozi', tyyppi: 'youtube', tunniste: 'UCrvchO1h6lWZAuGaa1LqX9Q', toiminto: 'ilmoita', owner: 'shared', aktiivinen: true },
  { lista: 'personal', nimi: 'Dan Martell', tyyppi: 'youtube', tunniste: 'UCA-mWX9CvCTVFWRMb9bKc9w', toiminto: 'ilmoita', owner: 'shared', aktiivinen: true },
  { lista: 'personal', nimi: 'Iman Gadzhi', tyyppi: 'youtube', tunniste: 'UC-l4IawN1e_eHns1NmkoKTg', toiminto: 'ilmoita', owner: 'shared', aktiivinen: true },
  { lista: 'personal', nimi: 'Joe Rogan', tyyppi: 'youtube', tunniste: 'UCzQUP1qoWDoEbmsQxvdjxgQ', toiminto: 'ilmoita', owner: 'shared', aktiivinen: true },
]

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

function findCol(headers: string[], ...patterns: string[]): number {
  for (const p of patterns) {
    const idx = headers.findIndex(h => h.toLowerCase().trim() === p.toLowerCase())
    if (idx >= 0) return idx
  }
  // Vasta täsmällisen osuman jälkeen osajono, jottei "listaus" osuisi
  // "lista"-sarakkeen edelle.
  for (const p of patterns) {
    const idx = headers.findIndex(h => h.toLowerCase().includes(p.toLowerCase()))
    if (idx >= 0) return idx
  }
  return -1
}

function parseList(v: string): WatchList | null {
  const s = v.toLowerCase().trim()
  return s === 'trading' || s === 'personal' || s === 'uutiset' ? s : null
}

function parseType(v: string): WatchType {
  return v.toLowerCase().trim() === 'rss' ? 'rss' : 'youtube'
}

function parseAction(v: string): WatchAction {
  const s = v.toLowerCase().trim()
  if (s === 'tiivista' || s === 'tiivistä') return 'tiivista'
  if (s === 'ilmoita') return 'ilmoita'
  return 'ei mitään'
}

function parseOwner(v: string): Owner {
  const s = v.toLowerCase().trim()
  return s === 'albin' || s === 'arbnor' ? s : 'shared'
}

/** "kyllä", "true", "1", "x" ja tyhjä = aktiivinen. Vain selvä ei sammuttaa. */
function parseActive(v: string): boolean {
  const s = v.toLowerCase().trim()
  return !(s === 'ei' || s === 'false' || s === '0' || s === 'no')
}

async function fetchFromSheet(id: string): Promise<WatchSource[]> {
  const auth = await getAuth().getClient()
  const sheets = google.sheets({ version: 'v4', auth: auth as never })
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: 'A1:Z200' })

  const rows = (res.data.values ?? []) as string[][]
  if (rows.length < 2) throw new Error('watch-lähdelista: taulukossa ei ole rivejä')

  const headers = (rows[0] ?? []).map(h => String(h ?? ''))
  const iLista = findCol(headers, 'lista')
  const iNimi = findCol(headers, 'nimi')
  const iTyyppi = findCol(headers, 'tyyppi')
  const iTunniste = findCol(headers, 'tunniste')
  const iToiminto = findCol(headers, 'toiminto')
  const iOmistaja = findCol(headers, 'omistaja')
  const iAktiivinen = findCol(headers, 'aktiivinen')

  // Kolme saraketta ovat pakollisia. Ilman niitä rivistä ei saa lähdettä, ja
  // hiljainen ohitus tekisi väärin kirjoitetusta otsikosta näkymättömän vian.
  if (iLista < 0 || iTyyppi < 0 || iTunniste < 0) {
    throw new Error(
      `watch-lähdelista: pakollinen sarake puuttuu (lista=${iLista}, tyyppi=${iTyyppi}, tunniste=${iTunniste}). Otsikot: ${headers.join(', ')}`,
    )
  }

  const sources: WatchSource[] = []
  for (const row of rows.slice(1)) {
    const lista = parseList(String(row[iLista] ?? ''))
    const tunniste = String(row[iTunniste] ?? '').trim()
    if (!lista || !tunniste) continue

    sources.push({
      lista,
      nimi: (iNimi >= 0 ? String(row[iNimi] ?? '').trim() : '') || tunniste,
      tyyppi: parseType(String(row[iTyyppi] ?? '')),
      tunniste,
      toiminto: iToiminto >= 0 ? parseAction(String(row[iToiminto] ?? '')) : 'ei mitään',
      owner: iOmistaja >= 0 ? parseOwner(String(row[iOmistaja] ?? '')) : 'shared',
      aktiivinen: iAktiivinen >= 0 ? parseActive(String(row[iAktiivinen] ?? '')) : true,
    })
  }

  if (sources.length === 0) throw new Error('watch-lähdelista: yhtään kelvollista riviä ei löytynyt')
  return sources
}

/**
 * Koko lähdelista. `sourcesFrom` kertoo mistä se tuli, jotta kutsuja voi
 * raportoida varalistalla ajamisen sen sijaan että se näyttäisi normaalilta.
 */
export async function getWatchSources(
  force = false,
): Promise<{ sources: WatchSource[]; from: WatchSourcesFrom }> {
  const id = sheetId()
  if (!id) return { sources: [...FALLBACK], from: 'fallback' }

  try {
    const result = await fetchAndCache(
      { key: CACHE_KEY, ttl: TTL_SECONDS, force },
      () => fetchFromSheet(id),
    )
    return { sources: result.data, from: result.source }
  } catch (e) {
    // Taulukko rikki eikä vanhentunuttakaan listaa ole. Varalista pitää
    // watchin hengissä, mutta vika on kerrottava — hiljainen varalista on
    // sama asia kuin "ei uutta sisältöä" ikuisesti.
    console.error('[watch] lähdelistan luku epäonnistui, käytetään varalistaa', e)
    return { sources: [...FALLBACK], from: 'fallback-virhe' }
  }
}

/** Yhden listan aktiiviset lähteet. */
export async function sourcesForList(lista: WatchList, force = false) {
  const { sources, from } = await getWatchSources(force)
  return { sources: sources.filter(s => s.lista === lista && s.aktiivinen), from }
}
