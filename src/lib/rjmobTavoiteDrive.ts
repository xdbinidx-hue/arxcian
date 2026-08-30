import { google } from 'googleapis'
import * as XLSX from 'xlsx'
import { RJ_MOB_SELLERS } from '@/lib/rjmob'
import { SPREADSHEET_MIME } from '@/lib/rjmobDrive'
import {
  kuukausiTiedostonimesta, parseMyymalaTavoitteet, parseMyyjaTavoitteet, tavoiteYhteensa,
  type MyymalaTavoiteRivi, type MyyjaTavoiteRivi,
} from '@/lib/rjmobTavoiteTaulukko'

/**
 * Kuukauden tavoitteet Drivestä.
 *
 * Lähde vaihtui 30.8.2026: tavoitteet luetaan kansiosta `ARXCIAN / RJ-Mob /
 * Tavoitteet (kopio)` eikä enää myyntiseurantataulukon `Tavoitteet`
 * -välilehdeltä.
 *
 * **Kansiorakennetta ei oleteta, vaan tiedostot etsitään nimen perusteella.**
 * Rakenne muuttui kesken tämän toteutuksen: aamulla se oli `Myymälä/` ja
 * `Myyjä/`, illalla `Elokuu 2026/` ja `Syyskuu 2026/`. Molemmat toimivat, ja
 * niin toimii myös litteä kansio — hakija käy juuren ja yhden alikansiotason
 * läpi ja poimii sen tiedoston jonka **nimi** osoittaa oikeaan kuukauteen.
 * Kansion nimeen ei kosketa, koska se on ainoa asia joka on jo muuttunut.
 *
 * Kuukausitiedostoja on kaksi ja ne ovat eri muotoa — myös se on todettu eikä
 * oletettu:
 *
 * | Tiedosto | Muoto | Sisältö |
 * |---|---|---|
 * | `Elokuu_2026_Tavoitteet.xlsx` | .xlsx-blob | kolmen aluejohtajan myymälätavoitteet |
 * | `Myyjäkohtaiset Tavoitteet 8. Elokuu 2026` | natiivi Sheets | myyjätavoitteet |
 *
 * .xlsx-blobia **ei voi lukea** `sheets.spreadsheets.values.get`illä lainkaan;
 * se ladataan `files.get({ alt: 'media' })`illä ja jäsennetään SheetJS:llä,
 * samaan tapaan kuin Winpos-raportit. Natiivi taulukko luetaan Sheets-API:lla.
 * Siksi lukija tukee molempia eikä valitse toista.
 *
 * **Puuttuva kuukausitiedosto on varoitus, ei paluu edelliseen kuukauteen.**
 * Edellisen kuun tavoitteita vasten laskettu prosentti näyttäisi oikealta
 * eikä mikään kertoisi että se on väärän kuukauden luku.
 *
 * **Ei välimuistia.** Albinin vaatimus on että luvut päivittyvät heti kun
 * taulukko Drivessä päivittyy, ja tavoitetaulukot ovat pieniä: muutama
 * listaus ja kaksi lukua per sivulataus. Sama malli kuin tuottoseurannassa,
 * joka lukee Sheetsin joka latauksella.
 */

/** `ARXCIAN / RJ-Mob / Tavoitteet (kopio)`. */
export const TAVOITE_JUURI_ID = '1CPRQ0x_iObkzRbhAHRKxU70bYCnsJbil'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!),
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ],
  })
}

type DriveTiedosto = { id: string; name: string; mimeType: string }

/**
 * Juuren ja yhden alikansiotason taulukot.
 *
 * Yksi taso riittää kaikkiin nähtyihin rakenteisiin (`Myymälä/`, `Myyjä/`,
 * `Elokuu 2026/`) eikä syvempi haku ole ilmainen: jokainen kansio on oma
 * listauskutsunsa, ja tämä reitti ajetaan ilman välimuistia.
 */
async function listaaTiedostot(drive: ReturnType<typeof google.drive>): Promise<DriveTiedosto[]> {
  const kelpaa = (f: { id?: string | null; name?: string | null; mimeType?: string | null }): DriveTiedosto | null =>
    f.id && f.name && (f.mimeType === XLSX_MIME || f.mimeType === SPREADSHEET_MIME)
      ? { id: f.id, name: f.name, mimeType: f.mimeType }
      : null

  const juuri = await drive.files.list({
    q: `'${TAVOITE_JUURI_ID}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
  })
  const kaikki = juuri.data.files ?? []

  const alikansiot = kaikki.filter(f => f.mimeType === FOLDER_MIME && f.id)
  const alta = await Promise.all(
    alikansiot.map(async kansio => {
      const res = await drive.files.list({
        q: `'${kansio.id}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)',
      })
      return res.data.files ?? []
    }),
  )

  return [...kaikki, ...alta.flat()].map(kelpaa).filter((f): f is DriveTiedosto => f !== null)
}

/** Onko tiedosto myyjä- vai myymälätavoitteita. Nimi ratkaisee, ei muoto. */
function onMyyjaTiedosto(name: string): boolean {
  return /myyj[äa]/i.test(name)
}

/**
 * Taulukon solut riveinä, muodosta riippumatta.
 *
 * Natiivista taulukosta luetaan ensimmäinen välilehti, ellei `Tavoitteet`
 * -nimistä ole. `.xlsx`-blobista sama valinta SheetJS:n kautta.
 */
async function lueRivit(
  drive: ReturnType<typeof google.drive>,
  sheets: ReturnType<typeof google.sheets>,
  tiedosto: DriveTiedosto,
): Promise<string[][]> {
  if (tiedosto.mimeType === SPREADSHEET_MIME) {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: tiedosto.id })
    const nimet = meta.data.sheets?.map(s => s.properties?.title ?? '') ?? []
    const valilehti = nimet.find(n => n.toLowerCase().includes('tavoitteet')) ?? nimet[0] ?? ''
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: tiedosto.id,
      range: valilehti ? `'${valilehti}'!A1:BZ200` : 'A1:BZ200',
    })
    return (res.data.values ?? []).map((r: unknown[]) => r.map((c: unknown) => String(c ?? '')))
  }

  const res = await drive.files.get({ fileId: tiedosto.id, alt: 'media' }, { responseType: 'arraybuffer' })
  const wb = XLSX.read(Buffer.from(res.data as ArrayBuffer), { type: 'buffer' })
  const ws = wb.Sheets['Tavoitteet'] ?? wb.Sheets[wb.SheetNames[0]]
  // `defval` pitää tyhjät solut paikoillaan — ilman sitä sarakkeet siirtyisivät
  // vasemmalle ja tavoitesarake osuisi väärään mittariin.
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
    .map(r => r.map(c => String(c ?? '')))
}

export type TavoiteHaku = {
  kuukausiOrder: number
  /** Myymälärivit, tyhjä kun kuukauden tiedostoa ei ole. */
  myymalat: MyymalaTavoiteRivi[]
  /** Aluetason summa myymäläriveistä. */
  yhteensa: ReturnType<typeof tavoiteYhteensa>
  /** Myyjärivit, tyhjä kun kuukauden tiedostoa ei ole. */
  myyjat: MyyjaTavoiteRivi[]
  /** Löytyneiden tiedostojen nimet, `null` kun kuukaudelta ei ole tiedostoa. */
  myymalaTiedosto: string | null
  myyjaTiedosto: string | null
  /** Näytettävät varoitukset. Tyhjä lista tarkoittaa että kaikki luettiin. */
  varoitukset: string[]
}

const TYHJA_SUMMA = { liittymat: null, fsecure: null, kassakate: null }

/**
 * Kuukauden tavoitteet: myymälät ja myyjät.
 *
 * Toisen puuttuminen ei estä toista: ne ovat eri tiedostoja, ja Albin lisää
 * ne eri aikoina. Yhden kaatuminen jättäisi muuten molemmat näyttämättä.
 */
export async function haeTavoitteet(kuukausiOrder: number, kuukausiNimi: string): Promise<TavoiteHaku> {
  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })
  const sheets = google.sheets({ version: 'v4', auth })

  const tiedostot = await listaaTiedostot(drive)
  const kuukaudelta = tiedostot.filter(f => kuukausiTiedostonimesta(f.name)?.order === kuukausiOrder)
  const myymalaTiedosto = kuukaudelta.find(f => !onMyyjaTiedosto(f.name)) ?? null
  const myyjaTiedosto = kuukaudelta.find(f => onMyyjaTiedosto(f.name)) ?? null

  const varoitukset: string[] = []

  let myymalat: MyymalaTavoiteRivi[] = []
  if (!myymalaTiedosto) {
    varoitukset.push(`Kuukauden ${kuukausiNimi} myymälätavoitteita ei löytynyt Drivestä`)
  } else {
    const tulos = parseMyymalaTavoitteet(await lueRivit(drive, sheets, myymalaTiedosto), kuukausiNimi)
    myymalat = tulos.rivit
    varoitukset.push(...tulos.varoitukset)
  }

  let myyjat: MyyjaTavoiteRivi[] = []
  if (!myyjaTiedosto) {
    varoitukset.push(`Kuukauden ${kuukausiNimi} myyjäkohtaisia tavoitteita ei löytynyt Drivestä`)
  } else {
    const tulos = parseMyyjaTavoitteet(await lueRivit(drive, sheets, myyjaTiedosto), RJ_MOB_SELLERS)
    myyjat = tulos.rivit
    varoitukset.push(...tulos.varoitukset)
  }

  return {
    kuukausiOrder,
    myymalat,
    yhteensa: myymalat.length > 0 ? tavoiteYhteensa(myymalat) : TYHJA_SUMMA,
    myyjat,
    myymalaTiedosto: myymalaTiedosto?.name ?? null,
    myyjaTiedosto: myyjaTiedosto?.name ?? null,
    varoitukset,
  }
}
