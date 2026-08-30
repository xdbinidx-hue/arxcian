import { google } from 'googleapis'
import { monthOrder, SPREADSHEET_MIME } from '@/lib/rjmobDrive'
import {
  parseTavoiteTaulukko, valitseTavoitteet, yhdistaTavoitteet, tavoitteetKuukaudelle,
  onLukittu, tavoiteErot, uudetMerkinnat,
  type MuutosMerkinta, type ValitutTavoitteet,
} from '@/lib/rjmobBonusTavoitteet'
import { haeLukittu, jaadyta, haeHistoria, lisaaHistoriaan } from '@/lib/rjmobBonusLukitus'
import type { Myymala, MyymalaTavoite } from '@/lib/rjmobBonus'

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
  /** ISO-aika jolloin kuukauden tavoitteet jäädytettiin, `null` jos ei vielä. */
  jaadytetty: string | null
  /** Jäädytyksen jälkeen havaitut Drive-muutokset. Ei vaikuta laskentaan. */
  historia: MuutosMerkinta[]
}

type DriveLuku = {
  tavoitteet: Partial<Record<Myymala, MyymalaTavoite>> | null
  tiedosto: string | null
  varoitukset: string[]
}

async function lueDrivesta(kuukausiOrder: number): Promise<DriveLuku> {
  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })
  const sheets = google.sheets({ version: 'v4', auth })

  // Myyjäkohtaiset tavoitteet ovat samassa kuukausikansiossa 30.8.2026
  // alkaen, ja niissä on sama `N. Kuukausi VVVV` -osa nimessä. Bonus on
  // myymäläkohtainen, joten myyjätaulukko ohitetaan nimen perusteella —
  // muuten `parseTavoiteTaulukko` lukisi sen eikä tunnistaisi yhtään
  // myymälää, ja kuukausi jäisi varoituksineen koodikopion varaan.
  const taulukot = (await listaaTaulukot(drive)).filter(f => !/myyj[äa]/i.test(f.name ?? ''))
  const osuma = taulukot.find(f => monthOrder(f.name ?? '') === kuukausiOrder)
  if (!osuma?.id) return { tavoitteet: null, tiedosto: null, varoitukset: [] }

  const meta = await sheets.spreadsheets.get({ spreadsheetId: osuma.id })
  const ekaValilehti = meta.data.sheets?.[0]?.properties?.title ?? ''
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: osuma.id,
    range: ekaValilehti ? `'${ekaValilehti}'!A1:Z200` : 'A1:Z200',
  })
  const rows = (res.data.values ?? []).map((r: unknown[]) => r.map((c: unknown) => String(c ?? '')))

  const { tavoitteet, varoitukset } = parseTavoiteTaulukko(rows)
  return {
    tavoitteet: Object.keys(tavoitteet).length > 0 ? tavoitteet : null,
    tiedosto: osuma.name ?? null,
    varoitukset,
  }
}

/**
 * Kuukauden tavoitteet ja niiden lukitustila.
 *
 * Alkanut kuukausi luetaan **jäädytetystä avaimesta**, ei Drivestä: Driven
 * arvo vain verrataan siihen ja ero kirjataan historiaan. Jäädytys tehdään
 * laiskasti ensimmäisellä luvulla kuukauden alettua.
 *
 * Redisin ollessa poissa palataan lukitsemattomaan valintaan ja kerrotaan
 * siitä — sivun on toimittava, mutta ei valehdellen että tavoite on lukossa.
 */
export async function haeBonusTavoitteet(
  kuukausiOrder: number,
  kuka = 'tuntematon',
): Promise<TavoiteHaku> {
  const drive = await lueDrivesta(kuukausiOrder)
  const koodi = tavoitteetKuukaudelle(kuukausiOrder)

  if (!onLukittu(kuukausiOrder)) {
    const valittu = valitseTavoitteet(kuukausiOrder, drive.tavoitteet, koodi)
    return {
      ...valittu,
      varoitukset: [...drive.varoitukset, ...valittu.varoitukset],
      kuukausiOrder,
      tiedosto: drive.tiedosto,
      jaadytetty: null,
      historia: [],
    }
  }

  try {
    let lukittu = await haeLukittu(kuukausiOrder)

    if (!lukittu) {
      const siemen = drive.tavoitteet
        ? yhdistaTavoitteet(drive.tavoitteet, koodi)
        : { tavoitteet: koodi ?? {}, varoitukset: [] }
      if (Object.keys(siemen.tavoitteet).length === 0) {
        // Ei jäädytetä tyhjää: muuten kuukausi lukittuisi pysyvästi nollaan
        // sen takia että taulukko sattui puuttumaan ensimmäisellä luvulla.
        return {
          tavoitteet: null, lahde: 'puuttuu',
          varoitukset: [...drive.varoitukset, 'Kuukaudelle ei ole tavoitteita — ei jäädytetty'],
          kuukausiOrder, tiedosto: drive.tiedosto, jaadytetty: null, historia: [],
        }
      }
      lukittu = await jaadyta(kuukausiOrder, siemen.tavoitteet, drive.tavoitteet ? 'drive' : 'koodi')
    }

    const erot = tavoiteErot(lukittu.tavoitteet, drive.tavoitteet)
    const historia = await lisaaHistoriaan(
      kuukausiOrder,
      uudetMerkinnat(await haeHistoria(kuukausiOrder), erot, kuka),
    )

    return {
      tavoitteet: lukittu.tavoitteet,
      lahde: 'lukittu',
      varoitukset: drive.varoitukset,
      kuukausiOrder,
      tiedosto: drive.tiedosto,
      jaadytetty: lukittu.jaadytetty,
      historia,
    }
  } catch (e: unknown) {
    // Redis poissa. Palataan lukitsemattomaan valintaan, jossa koodikopio
    // voittaa alkaneessa kuukaudessa — mutta kerrotaan ettei lukko ole
    // luettavissa, jottei "lukittu" jää lupaukseksi jota ei ole pidetty.
    const valittu = valitseTavoitteet(kuukausiOrder, drive.tavoitteet, koodi)
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ...valittu,
      varoitukset: [...drive.varoitukset, ...valittu.varoitukset, `Tavoitteiden lukitusta ei voitu lukea: ${msg}`],
      kuukausiOrder,
      tiedosto: drive.tiedosto,
      jaadytetty: null,
      historia: [],
    }
  }
}
