import { google } from 'googleapis'
import { kv } from '@vercel/kv'
import {
  getWriteAuth,
  listSeurantaFiles,
  listWinposReports,
  downloadDriveFile,
  monthOrder,
  SPREADSHEET_MIME,
} from '@/lib/rjmobDrive'
import { parseWinposReport, type WinposRaportti } from './winpos-parser'
import {
  suunnitteleKirjoitus,
  sarakeKirjain,
  ENSIMMAINEN_DATARIVI,
  type Taulukkotila,
} from './suunnitelma'

/**
 * Winpos-raportin vienti kuukausitiedoston Kassamyynti-välilehdelle.
 *
 * Korvaa sen työvaiheen jossa raportin rivit kopioitiin käsin. Ei muuta
 * mitään muuta: laskenta, tavoitteet ja myyntiseuranta pysyvät ennallaan ja
 * lukevat saman välilehden kuten ennenkin.
 *
 * **Välilehdellä on kaavoja, joten kirjoitus on rajattu tarkasti.** Rakenne
 * tarkistettiin ennen toteutusta (speksin kohta 8.1):
 *
 * | Sarake | Sisältö | Kirjoitetaanko |
 * |---|---|---|
 * | A | `=XLOOKUP(C2; J:J; K:K; C2)` | vain kaavan jatkoksi, ei koskaan dataa |
 * | B–H | Koodi, Nimi, Myynti(alv0), Kate(alv0), Palautus, Alennus, Kuittien määrä | kyllä |
 * | I–K | Nimikorjaukset-hakutaulu | ei |
 * | M–P | Myyntiseuranta-koonti, omat kaavansa | ei |
 *
 * Sarake A johtaa myyjän oikean nimen sarakkeesta C hakutaulun kautta, joten
 * **sarakkeeseen C kirjoitetaan Winposin raakanimi** ("Steven"), ei koko
 * nimeä — muuten XLOOKUP ei osu ja nimikorjaus hajoaa.
 *
 * Kirjoituksen päättely on omassa moduulissaan ([suunnitelma.ts]), jotta
 * rivikaton laajennus ja alueen tyhjennys ovat testattavissa ilman
 * Sheets-rajapintaa.
 */

/**
 * KV-avaimet erikseen ympäristöittäin.
 *
 * Kehitys käyttää samaa Upstash-kantaa kuin tuotanto (ks. CLAUDE.md), joten
 * ilman erottelua paikallinen testiajo merkitsisi tiedoston käsitellyksi ja
 * tuotanto ohittaisi sen hiljaa. Vika ei näkyisi mistään — taulukko vain
 * jäisi täyttymättä.
 */
const YMPARISTO = process.env.VERCEL_ENV ?? 'kehitys'
const KV_FILES = `winpos:${YMPARISTO}:processed:files`
const KV_REPORTS = `winpos:${YMPARISTO}:processed:reports`

/** Kuinka pitkälle välilehteä luetaan rakennetta selvitettäessä. */
const LUKURAJA = 1000

export type KirjoitusSuunnitelma = {
  kohde: string
  valilehti: string
  alue: string
  rivit: number
  /** Montako nimikorjauskaavaa kopioitiin (tai kopioitaisiin) alaspäin. */
  laajennetutKaavat: number
  tyhjennettavaAlue: string
  esimerkkirivit: (string | number)[][]
}

export type TuontiTulos = {
  /** Missä ympäristössä ajettiin — näkyy vastauksessa, jottei avainten erottelu jää arvailuksi. */
  ymparisto: string
  /** Onko kyseessä kuiva ajo: mitään ei kirjoitettu eikä merkitty käsitellyksi. */
  kuivaAjo: boolean
  tuodut: string[]
  ohitetut: string[]
  varoitukset: string[]
  suunnitelmat: KirjoitusSuunnitelma[]
}

/**
 * Välilehden haku samalla prioriteetilla kuin `/api/targets`: ensin
 * 'kassakate', sitten 'kassamyynti'. Jos tiedostossa olisi molemmat, tuonti
 * ja lukureitti osuisivat muuten eri välilehteen.
 */
function etsiValilehti(nimet: string[], ...haut: string[]): string {
  for (const h of haut) {
    const found = nimet.find(n => n.toLowerCase().includes(h.toLowerCase()))
    if (found) return found
  }
  return ''
}

async function luetutAvaimet(key: string): Promise<Set<string>> {
  try {
    return new Set((await kv.get<string[]>(key)) ?? [])
  } catch (e) {
    console.error(`[winpos] KV-luku epäonnistui: ${key}`, e)
    return new Set()
  }
}

async function tallennaAvaimet(key: string, arvot: Set<string>): Promise<void> {
  try {
    // Pidetään lista kohtuullisena — vanhimmat saavat pudota pois.
    await kv.set(key, Array.from(arvot).slice(-500))
  } catch (e) {
    console.error(`[winpos] KV-kirjoitus epäonnistui: ${key}`, e)
  }
}

/**
 * Kirjoittaa raportin rivit kuluvan kuukauden Kassamyynti-välilehdelle.
 * Korvaa aiemmat rivit — Winpos-raportti on aina kumulatiivinen jakson
 * alusta, joten lisääminen kahdentaisi luvut.
 */
async function kirjoitaKassamyyntiin(
  raportti: WinposRaportti,
  kuivaAjo: boolean,
): Promise<KirjoitusSuunnitelma> {
  const sheets = google.sheets({ version: 'v4', auth: getWriteAuth() })

  const tiedostot = (await listSeurantaFiles())
    .filter(f => f.mimeType === SPREADSHEET_MIME && f.id && f.name)
    .sort((a, b) => monthOrder(b.name!) - monthOrder(a.name!))

  if (tiedostot.length === 0) throw new Error('Myyntiseurantataulukoita ei löytynyt')

  // Kuluvan kuukauden tiedosto. Uutta ei luoda — se on Albinin työ.
  const now = new Date()
  const kuluva = now.getFullYear() * 100 + (now.getMonth() + 1)
  const kohde = tiedostot.find(f => monthOrder(f.name!) === kuluva)
  if (!kohde) {
    throw new Error(
      `Kuluvan kuukauden myyntiseurantatiedostoa ei löytynyt (haettiin ${kuluva}). ` +
        'Luo kuukausitiedosto kopiona pohjasta ennen tuontia.',
    )
  }

  const meta = await sheets.spreadsheets.get({ spreadsheetId: kohde.id! })
  const nimet = meta.data.sheets?.map(s => s.properties?.title ?? '') ?? []
  const valilehti = etsiValilehti(nimet, 'kassakate', 'kassamyynti')
  if (!valilehti) {
    throw new Error(`Kassamyynti-välilehteä ei löytynyt tiedostosta ${kohde.name} (löytyi: ${nimet.join(', ')})`)
  }

  // Kaikki taulukon tila luetaan ennen päättelyä. Otsikkorivi luetaan aina
  // uudelleen: sarakkeet voidaan järjestää milloin tahansa uudelleen.
  const [otsikkoRes, kaavaRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: kohde.id!, range: `'${valilehti}'!A1:Z1` }),
    sheets.spreadsheets.values.get({
      spreadsheetId: kohde.id!,
      range: `'${valilehti}'!A1:A${LUKURAJA}`,
      valueRenderOption: 'FORMULA',
    }),
  ])

  const otsikot = (otsikkoRes.data.values?.[0] ?? []).map(v => String(v ?? ''))
  const aSarake = (kaavaRes.data.values ?? []).map(r => String(r?.[0] ?? ''))

  // Datalohkon nykyinen laajuus tarvitaan tyhjennysalueen laskentaan. Luetaan
  // koko A–Z ja rajataan päättelyssä, jotta sarakkeiden paikkaa ei tarvitse
  // tietää jo tässä.
  const nykyinenRes = await sheets.spreadsheets.values.get({
    spreadsheetId: kohde.id!,
    range: `'${valilehti}'!A1:Z${LUKURAJA}`,
  })
  const kaikkiRivit = (nykyinenRes.data.values ?? []).map(r => (r ?? []).map(c => String(c ?? '')))

  const alustavaTila: Taulukkotila = { otsikot, aSarake, nykyisetRivit: [] }
  const kokeilu = suunnitteleKirjoitus({ ...alustavaTila, nykyisetRivit: [] }, raportti.myyjat)
  // Nyt kun sarakelohko tiedetään, rajataan nykyiset rivit siihen.
  const nykyisetRivit = kaikkiRivit.map(r => r.slice(kokeilu.eka, kokeilu.vika + 1))

  const suunnitelma = suunnitteleKirjoitus({ otsikot, aSarake, nykyisetRivit }, raportti.myyjat)

  const tulos: KirjoitusSuunnitelma = {
    kohde: kohde.name!,
    valilehti,
    alue: suunnitelma.kirjoitettavaAlue,
    rivit: suunnitelma.taulukko.length,
    laajennetutKaavat: suunnitelma.lisattavatKaavat.length,
    tyhjennettavaAlue: suunnitelma.tyhjennettavaAlue,
    esimerkkirivit: suunnitelma.taulukko.slice(0, 3),
  }

  if (kuivaAjo) return tulos

  // Kaavat ensin, jotta nimikorjaus on paikallaan kun data saapuu.
  if (suunnitelma.lisattavatKaavat.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: kohde.id!,
      range: `'${valilehti}'!A${suunnitelma.lisattavatKaavat[0].rivi}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: suunnitelma.lisattavatKaavat.map(k => [k.kaava]) },
    })
  }

  // Tyhjennys ennen kirjoitusta: edellinen raportti on voinut olla pidempi,
  // eivätkä sen rivit saa jäädä roikkumaan uusien alle.
  await sheets.spreadsheets.values.clear({
    spreadsheetId: kohde.id!,
    range: `'${valilehti}'!${suunnitelma.tyhjennettavaAlue}`,
  })

  if (suunnitelma.taulukko.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: kohde.id!,
      range: `'${valilehti}'!${sarakeKirjain(suunnitelma.eka)}${ENSIMMAINEN_DATARIVI}`,
      valueInputOption: 'RAW',
      requestBody: { values: suunnitelma.taulukko },
    })
  }

  return tulos
}

export type TuontiOptiot = {
  /** Kertoo mitä kirjoitettaisiin, mutta ei kirjoita eikä merkitse käsitellyksi. */
  kuivaAjo?: boolean
}

/**
 * Käy Winpos-arkiston läpi ja vie käsittelemättömät raportit.
 *
 * Jos yksi tiedosto on viallinen, se merkitään käsitellyksi ja muut jatkavat
 * — muuten sama roskatiedosto jumittaisi ajon joka kerta.
 */
export async function importWinposReports(optiot: TuontiOptiot = {}): Promise<TuontiTulos> {
  const kuivaAjo = optiot.kuivaAjo ?? false

  const tiedostot = await listWinposReports()
  const kasitellytTiedostot = await luetutAvaimet(KV_FILES)
  const kasitellytRaportit = await luetutAvaimet(KV_REPORTS)

  const tulos: TuontiTulos = {
    ymparisto: YMPARISTO,
    kuivaAjo,
    tuodut: [],
    ohitetut: [],
    varoitukset: [],
    suunnitelmat: [],
  }

  // Vanhin ensin, jotta uusin raportti jää viimeiseksi kirjoitetuksi.
  for (const tiedosto of Array.from(tiedostot).reverse()) {
    const nimi = tiedosto.name ?? tiedosto.id!
    if (kasitellytTiedostot.has(tiedosto.id!)) {
      tulos.ohitetut.push(nimi)
      continue
    }

    let raportti: WinposRaportti
    try {
      const data = await downloadDriveFile(tiedosto.id!)
      raportti = parseWinposReport(data, { filename: nimi })
    } catch (e) {
      const viesti = e instanceof Error ? e.message : String(e)
      tulos.varoitukset.push(`${nimi}: ei ole luettava Winpos-raportti (${viesti})`)
      if (!kuivaAjo) kasitellytTiedostot.add(tiedosto.id!)
      continue
    }

    if (kasitellytRaportit.has(raportti.reportId)) {
      tulos.ohitetut.push(`${nimi} (sama raportti on jo tuotu)`)
      if (!kuivaAjo) kasitellytTiedostot.add(tiedosto.id!)
      continue
    }

    // Väärä luku on pahempi kuin puuttuva: jos raportin oma Yhteensä-rivi ei
    // täsmää laskettuun summaan, mitään ei kirjoiteta.
    const ilmoitettu = raportti.ilmoitettuSumma
    if (!ilmoitettu) {
      throw new Error(`${nimi}: Yhteensä-riviä ei löytynyt, summia ei voi ristiintarkistaa — ei kirjoiteta.`)
    }
    const heitto = Math.abs(ilmoitettu.myynti - raportti.summary.myynti)
    if (heitto > 0.05 || ilmoitettu.kuitit !== raportti.summary.kuitit) {
      throw new Error(
        `${nimi}: summat eivät täsmää Yhteensä-riviin (myynti ${raportti.summary.myynti} vs ${ilmoitettu.myynti}, ` +
          `kuitit ${raportti.summary.kuitit} vs ${ilmoitettu.kuitit}) — ei kirjoiteta.`,
      )
    }

    tulos.suunnitelmat.push(await kirjoitaKassamyyntiin(raportti, kuivaAjo))
    tulos.tuodut.push(nimi)
    // Parserin omat huomiot (esim. nimikartasta puuttuva myyjä) välitetään
    // eteenpäin sellaisenaan — niitä ei niellä hiljaa.
    tulos.varoitukset.push(...raportti.varoitukset.map(v => `${nimi}: ${v}`))

    if (!kuivaAjo) {
      kasitellytTiedostot.add(tiedosto.id!)
      kasitellytRaportit.add(raportti.reportId)
    }
  }

  // Kuivassa ajossa ei jää jälkiä, jotta saman voi ajaa uudelleen.
  if (!kuivaAjo) {
    await tallennaAvaimet(KV_FILES, kasitellytTiedostot)
    await tallennaAvaimet(KV_REPORTS, kasitellytRaportit)
  }

  return tulos
}
