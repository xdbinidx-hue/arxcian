import { google } from 'googleapis'
import { getTuntipalkka } from '@/lib/rjmob'
import {
  parseMyyjat, vertaaTuntipalkkoihin, tuntipalkkaKuukaudelle,
  type MyyjatTiedosto,
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
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
}

export type MyyjatHaku = {
  kuukausiOrder: number | null
  tiedosto: string | null
  paivitetty: string | null
  rivit: MyyjatTiedosto['rivit']
  palkkamuutokset: MyyjatTiedosto['palkkamuutokset']
  /** Tiedoston omat puutteet ja koodin ja tiedoston väliset erot yhdessä. */
  varoitukset: string[]
}

export async function haeMyyjat(kuukausiOrder: number | null = null): Promise<MyyjatHaku> {
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
    }
  }

  const res = await drive.files.export(
    { fileId: tiedosto.id, mimeType: 'text/plain' },
    { responseType: 'text' },
  )
  const parsittu = parseMyyjat(String(res.data))

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
