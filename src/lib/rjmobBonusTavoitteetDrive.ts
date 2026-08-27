import { google } from 'googleapis'
import { monthOrder, SPREADSHEET_MIME } from '@/lib/rjmobDrive'
import { parseTavoiteTaulukko, valitseTavoitteet, type ValitutTavoitteet } from '@/lib/rjmobBonusTavoitteet'

/**
 * Myymäläpäällikköbonuksen tavoitteet Drivestä.
 *
 * Kansio `Arxcian / RJ-Mob / Tavoitteet (kopio)`, yksi taulukko kuukautta
 * kohti ja tiedostonimessä sama `N. Kuukausi VVVV` -muoto kuin
 * myyntiseurannassa ja työvuoroissa — kuukausi tunnistetaan `monthOrder`illa
 * eli samalla `vuosi × 100 + kuukausi` -säännöllä kuin kaikkialla muualla.
 *
 * Kansio oli tyhjä 27.8.2026 (todettu palvelutilillä), joten ensimmäinen
 * taulukko on vielä tulossa. Siihen asti lukija ei löydä mitään ja
 * `valitseTavoitteet` palauttaa lukitun koodikopion — puuttuva taulukko ei ole
 * virhe vaan tila, samaan tapaan kuin watchin puuttuva lähdelista.
 *
 * Jäsennys itsessään on puhtaana funktiona
 * ([rjmobBonusTavoitteet.ts](src/lib/rjmobBonusTavoitteet.ts)), joten se on
 * testattavissa ilman verkkoa.
 */
export const BONUS_TAVOITTEET_FOLDER_ID = '1CPRQ0x_iObkzRbhAHRKxU70bYCnsJbil'

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!),
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ],
  })
}

/**
 * Kansion taulukot, myös yhden vuosikansiotason takaa.
 *
 * Sisarkansiot (Myyntiseuranta, Maksukuitit) jakautuvat vuosikansioihin, ja
 * tavoitekansio tekee ennen pitkää saman. Vuosikansion olettaminen pois
 * tarkoittaisi että lukija lakkaa löytämästä mitään sinä päivänä kun Albin
 * siirtää tiedostot vuoden alle.
 */
async function listaaTaulukot(drive: ReturnType<typeof google.drive>) {
  const juuri = await drive.files.list({
    q: `'${BONUS_TAVOITTEET_FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
  })
  const kaikki = juuri.data.files ?? []

  const vuosikansiot = kaikki.filter(f => f.mimeType === 'application/vnd.google-apps.folder')
  if (vuosikansiot.length === 0) return kaikki.filter(f => f.mimeType === SPREADSHEET_MIME)

  const perVuosi = await Promise.all(
    vuosikansiot.map(async vf => {
      const res = await drive.files.list({
        q: `'${vf.id}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)',
      })
      return res.data.files ?? []
    }),
  )
  return [...kaikki, ...perVuosi.flat()].filter(f => f.mimeType === SPREADSHEET_MIME)
}

export type TavoiteHaku = ValitutTavoitteet & {
  kuukausiOrder: number
  /** Drivestä löytyneen taulukon nimi, `null` jos taulukkoa ei ollut. */
  tiedosto: string | null
}

export async function haeBonusTavoitteet(kuukausiOrder: number): Promise<TavoiteHaku> {
  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })
  const sheets = google.sheets({ version: 'v4', auth })

  const taulukot = await listaaTaulukot(drive)
  const osuma = taulukot.find(f => monthOrder(f.name ?? '') === kuukausiOrder)

  if (!osuma?.id) {
    return { ...valitseTavoitteet(kuukausiOrder, null), kuukausiOrder, tiedosto: null }
  }

  const meta = await sheets.spreadsheets.get({ spreadsheetId: osuma.id })
  const ekaValilehti = meta.data.sheets?.[0]?.properties?.title ?? ''
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: osuma.id,
    range: ekaValilehti ? `'${ekaValilehti}'!A1:Z200` : 'A1:Z200',
  })
  const rows = (res.data.values ?? []).map((r: unknown[]) => r.map((c: unknown) => String(c ?? '')))

  const { tavoitteet, varoitukset } = parseTavoiteTaulukko(rows)
  // Jäsennyksen varoitukset ovat taulukon omia puutteita, lähteen valinnan
  // varoitukset kertovat lukituksesta — molemmat kuuluvat käyttäjälle, mutta
  // niitä ei sekoiteta yhdeksi listaksi ennen kuin ne näytetään.
  const valittu = valitseTavoitteet(kuukausiOrder, Object.keys(tavoitteet).length > 0 ? tavoitteet : null)

  return {
    ...valittu,
    varoitukset: [...varoitukset, ...valittu.varoitukset],
    kuukausiOrder,
    tiedosto: osuma.name ?? null,
  }
}
