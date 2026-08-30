import { google } from 'googleapis'
import { getTuntipalkka } from '@/lib/rjmob'
import {
  parseMyyjat, vertaaTuntipalkkoihin, vertaaNimikorjauksiin, tuntipalkkaKuukaudelle,
  type MyyjatTiedosto, type NimikorjausPari,
} from '@/lib/rjmobMyyjat'

/**
 * `myyjat.md` Drivestä.
 *
 * Kansio `Arxcian / Infopaketti` — tiedosto haetaan **nimellä eikä id:llä**,
 * jotta uudelleen luotu dokumentti ei katkaise lukua hiljaa. Se on Google
 * Docs -dokumentti, joten sisältö tulee `files.export`illa tekstinä.
 *
 * **Tämä ei ole laskennan lähde vaan sen tarkistus.** Palkat luetaan yhä
 * koodin `TUNTIPALKAT`ista, ja tämä kertoo jos ne ovat erkaantuneet siitä
 * mitä Albin ylläpitää. Elävä Drive-lähde tarkoittaisi, että rikkoutunut
 * dokumenttimuoto muuttaisi palkkakulua hiljaa — juuri se vika jota vastaan
 * jäsentimen tyhjä tulos on virhe eikä tyhjä lista.
 */
export const INFOPAKETTI_FOLDER_ID = '1sj6Qg5NTgqv634gYBIZhta8ipdMzJrin'

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!),
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ],
  })
}

/** Otsikkorivien tunnistus: nämä eivät ole nimipareja. */
const OTSIKKOSANAT = ['nimi', 'tunnus', 'korjaus', 'oikea', 'väärin', 'vaarin']

/**
 * Myyntiseurannan Kassamyynti-välilehden nimikorjaustaulu, sarakkeet J → K.
 *
 * Taulukon oma `XLOOKUP(C2; J:J; K:K)` kääntää Winposin raakanimen koko
 * nimeksi sarakkeeseen A, ja **se jää voimaan** — tämä vain lukee saman taulun
 * jotta sitä voi verrata `myyjat.md`:hen. Sarakkeeseen A lukevaa päätä
 * ([rjmobTargets.ts](src/lib/rjmobTargets.ts)) ei kosketa.
 */
export async function lueNimikorjaustaulu(fileId: string): Promise<NimikorjausPari[]> {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() })
  const meta = await sheets.spreadsheets.get({ spreadsheetId: fileId })
  const nimet = meta.data.sheets?.map(sh => sh.properties?.title ?? '') ?? []
  const kassa = nimet.find(n => n.toLowerCase().includes('kassamyynti'))
    ?? nimet.find(n => n.toLowerCase().includes('kassakate'))
  if (!kassa) return []

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: fileId,
    range: `'${kassa}'!I1:K60`,
  })
  const rows = (res.data.values ?? []).map((r: unknown[]) => r.map((c: unknown) => String(c ?? '').trim()))

  const parit: NimikorjausPari[] = []
  for (const r of rows) {
    const alias = r[1] ?? ''
    const nimi = r[2] ?? ''
    if (!alias || !nimi) continue
    const otsikko = OTSIKKOSANAT.some(o => alias.toLowerCase().includes(o) || nimi.toLowerCase().includes(o))
    if (otsikko) continue
    parit.push({ alias, nimi })
  }
  return parit
}

export type MyyjatHaku = {
  kuukausiOrder: number | null
  tiedosto: string | null
  paivitetty: string | null
  rivit: MyyjatTiedosto['rivit']
  palkkamuutokset: MyyjatTiedosto['palkkamuutokset']
  /** Tiedoston omat puutteet ja koodin ja tiedoston väliset erot yhdessä. */
  varoitukset: string[]
  /** Erot Excelin nimikorjaustauluun. Tyhjä myös silloin kun taulua ei luettu. */
  nimivaroitukset: string[]
}

/**
 * `fileId` on myyntiseurantatiedosto jonka nimikorjaustauluun verrataan.
 * Ilman sitä vertailu jätetään tekemättä — se on eri asia kuin "ei eroja", ja
 * siksi omassa kentässään eikä sekoitettuna palkkavaroituksiin.
 */
export async function haeMyyjat(
  kuukausiOrder: number | null = null,
  fileId: string | null = null,
): Promise<MyyjatHaku> {
  const drive = google.drive({ version: 'v3', auth: getAuth() })

  const lista = await drive.files.list({
    q: `'${INFOPAKETTI_FOLDER_ID}' in parents and name = 'myyjat.md' and trashed = false`,
    fields: 'files(id, name, modifiedTime)',
  })
  const tiedosto = lista.data.files?.[0]
  if (!tiedosto?.id) {
    return {
      kuukausiOrder, tiedosto: null, paivitetty: null, rivit: [], palkkamuutokset: [],
      varoitukset: ['myyjat.md ei löytynyt kansiosta Arxcian / Infopaketti'],
      nimivaroitukset: [],
    }
  }

  const res = await drive.files.export(
    { fileId: tiedosto.id, mimeType: 'text/plain' },
    { responseType: 'text' },
  )
  const parsittu = parseMyyjat(String(res.data))

  // Nimikorjaustaulun luku ei saa kaataa palkkavertailua: eri lähde, eri vika.
  let nimivaroitukset: string[] = []
  if (fileId) {
    try {
      nimivaroitukset = vertaaNimikorjauksiin(parsittu, await lueNimikorjaustaulu(fileId), kuukausiOrder)
    } catch (e: unknown) {
      nimivaroitukset = [`Nimikorjaustaulun luku epäonnistui: ${e instanceof Error ? e.message : String(e)}`]
    }
  }

  return {
    kuukausiOrder,
    tiedosto: tiedosto.name ?? null,
    paivitetty: tiedosto.modifiedTime ?? null,
    rivit: parsittu.rivit,
    palkkamuutokset: parsittu.palkkamuutokset,
    varoitukset: [
      ...parsittu.varoitukset,
      ...vertaaTuntipalkkoihin(parsittu, getTuntipalkka, kuukausiOrder),
    ],
    nimivaroitukset,
  }
}

/** Yhden myyjän palkka tiedoston mukaan — vertailua ja diagnostiikkaa varten. */
export function palkkaTiedostosta(haku: MyyjatHaku, nimi: string, kuukausiOrder: number | null) {
  return tuntipalkkaKuukaudelle(
    { rivit: haku.rivit, palkkamuutokset: haku.palkkamuutokset, varoitukset: [] },
    nimi,
    kuukausiOrder,
  )
}
