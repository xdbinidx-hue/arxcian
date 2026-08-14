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
import { parseWinposReport, type WinposRaportti, type WinposRivi } from './winpos-parser'

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
 * nimeä — muuten XLOOKUP ei osu ja nimikorjaus hajoaa. Speksin kohta 7
 * ("täytä Virallinen nimi -sarake nimikartasta") jää siis tekemättä
 * tarkoituksella: taulukko tekee sen itse.
 *
 * Rivimäärää ei ole kiinnitetty. Jos raportissa on enemmän myyjiä kuin
 * sarakkeen A kaavoja riittää, kaava kopioidaan alaspäin niin pitkälle kuin
 * dataa on. Jos kaavaa ei saada laajennettua, kirjoitus keskeytetään —
 * rivi jonka nimi ei korjaudu on pahempi kuin puuttuva rivi.
 */

/** Käsitellyt Drive-tiedostot ja raportit. Tiedoston siirto ei nollaa tilaa. */
const KV_FILES = 'winpos:processed:files'
const KV_REPORTS = 'winpos:processed:reports'

/** Ensimmäinen datarivi; rivi 1 on otsikko. */
const ENSIMMAINEN_DATARIVI = 2

/** Kuinka pitkälle välilehteä luetaan rakennetta selvitettäessä. */
const LUKURAJA = 1000

/** Kassamyynti-välilehden sarakkeet ja mistä Winpos-rivin kentästä ne täytetään. */
const SARAKKEET: { otsikot: string[]; arvo: (r: WinposRivi) => string | number }[] = [
  { otsikot: ['koodi'], arvo: r => r.koodi },
  // Raakanimi, koska sarakkeen A XLOOKUP hakee juuri sillä.
  { otsikot: ['nimi'], arvo: r => r.nimiRaaka },
  { otsikot: ['myynti'], arvo: r => r.myynti },
  { otsikot: ['kate'], arvo: r => r.kate },
  { otsikot: ['palautus'], arvo: r => r.palautus },
  { otsikot: ['alennus'], arvo: r => r.alennus },
  { otsikot: ['kuittien määrä', 'kuitit', 'kuitti'], arvo: r => r.kuitit },
]

export type KirjoitusSuunnitelma = {
  /** Kuukausitiedosto johon kirjoitettaisiin. */
  kohde: string
  valilehti: string
  /** Kirjoitettava alue, esim. "B2:H19". */
  alue: string
  rivit: number
  /** Montako nimikorjauskaavaa jouduttiin kopioimaan alaspäin. */
  laajennetutKaavat: number
  /** Mikä alue tyhjennetään ennen kirjoitusta. */
  tyhjennettavaAlue: string
  /** Muutama ensimmäinen rivi sellaisena kuin ne menisivät taulukkoon. */
  esimerkkirivit: (string | number)[][]
}

export type TuontiTulos = {
  /** Onko kyseessä kuiva ajo: mitään ei kirjoitettu eikä merkitty käsitellyksi. */
  kuivaAjo: boolean
  tuodut: string[]
  ohitetut: string[]
  varoitukset: string[]
  /** Mitä kustakin raportista kirjoitettiin tai kirjoitettaisiin. */
  suunnitelmat: KirjoitusSuunnitelma[]
}

function sarakeKirjain(index: number): string {
  return String.fromCharCode(65 + index)
}

/** Sama otsikkohaku kuin muualla RJ-Mobissa: nimen perusteella, ei paikan. */
function etsiSarake(otsikot: string[], haut: string[]): number {
  for (const h of haut) {
    const idx = otsikot.findIndex(o => o.toLowerCase().includes(h.toLowerCase()))
    if (idx >= 0) return idx
  }
  return -1
}

/**
 * Siirtää kaavan viittaukset toiselle riville: `=XLOOKUP(C77; ...)` → `C78`.
 * Sarakeviittaukset ilman rivinumeroa (`J:J`) jäävät koskematta.
 */
function siirraKaava(kaava: string, mistaRivi: number, minneRivi: number): string {
  return kaava.replace(new RegExp(`(\\$?[A-Z]{1,3}\\$?)${mistaRivi}\\b`, 'g'), `$1${minneRivi}`)
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
  const valilehti = nimet.find(n => /kassakate|kassamyynti/i.test(n))
  if (!valilehti) {
    throw new Error(`Kassamyynti-välilehteä ei löytynyt tiedostosta ${kohde.name} (löytyi: ${nimet.join(', ')})`)
  }

  // Otsikkorivi luetaan aina uudelleen: sarakkeet voidaan järjestää milloin
  // tahansa uudelleen, eikä paikkaan saa luottaa.
  const otsikkoRes = await sheets.spreadsheets.values.get({
    spreadsheetId: kohde.id!,
    range: `'${valilehti}'!A1:Z1`,
  })
  const otsikot = (otsikkoRes.data.values?.[0] ?? []).map(v => String(v ?? ''))

  const indeksit = SARAKKEET.map(s => etsiSarake(otsikot, s.otsikot))
  const puuttuvat = SARAKKEET.filter((s, i) => indeksit[i] < 0).map(s => s.otsikot[0])
  if (puuttuvat.length > 0) {
    throw new Error(`Kassamyynti-välilehdeltä puuttuu sarake: ${puuttuvat.join(', ')}`)
  }

  const eka = Math.min(...indeksit)
  const vika = Math.max(...indeksit)

  // Turvaraja: sarake A on nimikorjauskaava, eikä sen päälle kirjoiteta
  // dataa koskaan. Jos otsikkohaku osuisi siihen, keskeytetään.
  if (eka === 0) {
    throw new Error('Sarakekohdistus osui sarakkeeseen A, jossa on nimikorjauskaava — kirjoitus keskeytetty.')
  }

  const rivit = raportti.myyjat
  const viimeinenUusiRivi = ENSIMMAINEN_DATARIVI + rivit.length - 1

  // --- Nimikorjauskaavan kattavuus sarakkeessa A ---
  const kaavaRes = await sheets.spreadsheets.values.get({
    spreadsheetId: kohde.id!,
    range: `'${valilehti}'!A1:A${LUKURAJA}`,
    valueRenderOption: 'FORMULA',
  })
  const aSarake = (kaavaRes.data.values ?? []).map(r => String(r?.[0] ?? ''))

  let viimeinenKaavaRivi = 0
  let malliRivi = 0
  for (let i = 0; i < aSarake.length; i++) {
    if (aSarake[i].startsWith('=')) {
      viimeinenKaavaRivi = i + 1
      malliRivi = i + 1
    }
  }

  const lisattavatKaavat: { rivi: number; kaava: string }[] = []
  if (viimeinenUusiRivi > viimeinenKaavaRivi) {
    if (malliRivi === 0) {
      throw new Error(
        `Sarakkeesta A ei löytynyt yhtään nimikorjauskaavaa, joten sitä ei voi laajentaa ` +
          `${rivit.length} riville. Kirjoitus keskeytetty — rivi jonka nimi ei korjaudu on pahempi kuin puuttuva rivi.`,
      )
    }
    const malli = aSarake[malliRivi - 1]
    for (let r = viimeinenKaavaRivi + 1; r <= viimeinenUusiRivi; r++) {
      lisattavatKaavat.push({ rivi: r, kaava: siirraKaava(malli, malliRivi, r) })
    }
  }

  // --- Nykyinen datan laajuus, jotta lyhyempi raportti ei jätä jämiä ---
  const nykyinenRes = await sheets.spreadsheets.values.get({
    spreadsheetId: kohde.id!,
    range: `'${valilehti}'!${sarakeKirjain(eka)}1:${sarakeKirjain(vika)}${LUKURAJA}`,
  })
  const nykyiset = nykyinenRes.data.values ?? []
  let viimeinenNykyinenRivi = ENSIMMAINEN_DATARIVI - 1
  for (let i = 0; i < nykyiset.length; i++) {
    if ((nykyiset[i] ?? []).some(c => String(c ?? '').trim() !== '')) viimeinenNykyinenRivi = i + 1
  }

  const tyhjennettavaLoppu = Math.max(viimeinenNykyinenRivi, viimeinenUusiRivi, ENSIMMAINEN_DATARIVI)
  const tyhjennettavaAlue = `${sarakeKirjain(eka)}${ENSIMMAINEN_DATARIVI}:${sarakeKirjain(vika)}${tyhjennettavaLoppu}`
  const kirjoitettavaAlue = `${sarakeKirjain(eka)}${ENSIMMAINEN_DATARIVI}:${sarakeKirjain(vika)}${Math.max(viimeinenUusiRivi, ENSIMMAINEN_DATARIVI)}`

  // Rivi rakennetaan sarakejärjestyksessä eka..vika, jotta yhtenäinen alue
  // voidaan kirjoittaa kerralla.
  const leveys = vika - eka + 1
  const taulukko = rivit.map(r => {
    const solut: (string | number)[] = new Array(leveys).fill('')
    SARAKKEET.forEach((s, i) => {
      solut[indeksit[i] - eka] = s.arvo(r)
    })
    return solut
  })

  const suunnitelma: KirjoitusSuunnitelma = {
    kohde: kohde.name!,
    valilehti,
    alue: kirjoitettavaAlue,
    rivit: taulukko.length,
    laajennetutKaavat: lisattavatKaavat.length,
    tyhjennettavaAlue,
    esimerkkirivit: taulukko.slice(0, 3),
  }

  if (kuivaAjo) return suunnitelma

  // Kaavat ensin, jotta nimikorjaus on paikallaan kun data saapuu.
  if (lisattavatKaavat.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: kohde.id!,
      range: `'${valilehti}'!A${lisattavatKaavat[0].rivi}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: lisattavatKaavat.map(k => [k.kaava]) },
    })
  }

  // Tyhjennetään koko käytössä ollut ikkuna: edellinen raportti on voinut
  // olla pidempi, eivätkä sen rivit saa jäädä roikkumaan uusien alle.
  await sheets.spreadsheets.values.clear({
    spreadsheetId: kohde.id!,
    range: `'${valilehti}'!${tyhjennettavaAlue}`,
  })

  if (taulukko.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: kohde.id!,
      range: `'${valilehti}'!${sarakeKirjain(eka)}${ENSIMMAINEN_DATARIVI}`,
      valueInputOption: 'RAW',
      requestBody: { values: taulukko },
    })
  }

  return suunnitelma
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

  const tulos: TuontiTulos = { kuivaAjo, tuodut: [], ohitetut: [], varoitukset: [], suunnitelmat: [] }

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

    const suunnitelma = await kirjoitaKassamyyntiin(raportti, kuivaAjo)
    tulos.suunnitelmat.push(suunnitelma)
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
