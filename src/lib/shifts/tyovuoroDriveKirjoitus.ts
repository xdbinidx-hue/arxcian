// Työvuorolistan kirjoitus Driveen.
//
// **Erillään lukupuolesta** ([tyovuoroDrive.ts](src/lib/shifts/tyovuoroDrive.ts))
// samasta syystä kuin Winpos-putkessa: lukureitit pysyvät readonly-scopessa,
// jolloin bugi lukupuolella ei voi millään rikkoa lähdedataa. Kirjoitusoikeus
// on vain tässä moduulissa.
import { google } from 'googleapis'
import { getWriteAuth, SPREADSHEET_MIME, type DriveFile } from '../rjmobDrive'
import { etsiKuukaudenTiedosto } from './tyovuoroDrive'
import { rakennaKirjoitussuunnitelma, type Kirjoitussuunnitelma } from './tyovuoroKirjoitus'
import type { DayInfo } from '../shiftSchedule'

export interface KirjoitusTulos {
  kuivaAjo: boolean
  tiedosto: { nimi?: string | null; id?: string | null; mimeType?: string | null }
  valilehti: string
  alue: string
  vuoroja: number
  poissaoloja: number
  /** Kirjoitettiinko oikeasti. Kuiva-ajossa aina false. */
  kirjoitettu: boolean
  /** Muutama ensimmäinen rivi luettavassa muodossa kuiva-ajon tarkistukseen. */
  esikatselu: string[]
  /** Myyjät joilla on vuoroja muttei saraketta taulukossa. Kirjoitus estyy. */
  puuttuvatSarakkeet: string[]
}

/** "FECACA" → Sheetsin 0..1-väri. */
function hexVari(hex: string) {
  return {
    red: parseInt(hex.slice(0, 2), 16) / 255,
    green: parseInt(hex.slice(2, 4), 16) / 255,
    blue: parseInt(hex.slice(4, 6), 16) / 255,
  }
}

const VALKOINEN = { red: 1, green: 1, blue: 1 }

/** Luku kirjoitetaan lukuna, muu tekstinä — muuten tuntisarake ei summaudu. */
function soluArvo(teksti: string) {
  if (teksti === '') return {}
  const numero = Number(teksti.replace(',', '.'))
  if (teksti.trim() !== '' && Number.isFinite(numero) && /^-?\d+([.,]\d+)?$/.test(teksti.trim())) {
    return { userEnteredValue: { numberValue: numero } }
  }
  return { userEnteredValue: { stringValue: teksti } }
}

function esikatseleRivit(s: Kirjoitussuunnitelma, maara = 8): string[] {
  const out: string[] = []
  for (let r = 0; r < Math.min(maara, s.arvot.length); r++) {
    const solut = s.arvot[r]
      .map((v, c) => (v ? `${c + s.ekaSarake}:${v}` : ''))
      .filter(Boolean)
    out.push(`rivi ${s.ekaRivi + r}: ${solut.length ? solut.join(' ') : '(tyhjä)'}`)
  }
  return out
}

/**
 * Kirjoita vahvistettu lista kuukauden Drive-taulukkoon.
 *
 * Kirjoitus tehdään **yhdellä `updateCells`-pyynnöllä** joka kattaa
 * täsmälleen alueen B4:AH33 (tai …:AH34 31 päivän kuukaudessa). Yksi
 * suorakaide on tässä turvaominaisuus eikä optimointi: alue rajaa
 * kirjoituksen niin ettei sarakkeisiin A, AR ja AU tai riville 35 voi osua
 * edes bugin sattuessa. Kenttämaski `userEnteredValue,…backgroundColor`
 * myös tyhjentää vanhat jäänteet samalla kertaa, joten erillistä
 * `values.clear`ia ei tarvita.
 */
export async function kirjoitaTyovuorot(
  vuosi: number, kuukausi: number, days: DayInfo[], optiot: { kuivaAjo: boolean },
): Promise<KirjoitusTulos> {
  const tiedosto: DriveFile | null = await etsiKuukaudenTiedosto(vuosi, kuukausi)
  if (!tiedosto?.id) {
    throw new Error(
      `Kuukauden ${kuukausi}/${vuosi} työvuorotiedostoa ei löydy Drive-kansiosta. `
      + 'Luo se itse kansioon — tiedostoa ei luoda automaattisesti, koska '
      + 'väärään paikkaan luotu tiedosto on pahempi kuin puuttuva.',
    )
  }

  if (tiedosto.mimeType !== SPREADSHEET_MIME) {
    // Tietoinen rajaus: .xlsx-kirjoitus vaatisi lataa-muokkaa-lähetä
    // -kierroksen, jossa kaavojen ja muotoilujen säilyminen on kiinni
    // kirjaston round-tripistä. Sitä ei toteuteta arvaamalla — mieluummin
    // selvä virhe kuin rikotut tuntisummakaavat.
    throw new Error(
      `Tiedosto "${tiedosto.name}" ei ole Google Sheets vaan ${tiedosto.mimeType}. `
      + 'Kirjoitus on toteutettu vain Sheets-muodolle. Muunna tiedosto Google '
      + 'Sheetsiksi (Tiedosto → Tallenna Google Sheetsinä) tai pyydä xlsx-tuki erikseen.',
    )
  }

  const suunnitelma = rakennaKirjoitussuunnitelma(days, vuosi, kuukausi)
  const auth = getWriteAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const meta = await sheets.spreadsheets.get({ spreadsheetId: tiedosto.id })
  const eka = meta.data.sheets?.[0]?.properties
  if (!eka?.title || eka.sheetId == null) throw new Error('Taulukossa ei ole yhtään välilehteä')

  const tulos: KirjoitusTulos = {
    kuivaAjo: optiot.kuivaAjo,
    tiedosto: { nimi: tiedosto.name, id: tiedosto.id, mimeType: tiedosto.mimeType },
    valilehti: eka.title,
    alue: `'${eka.title}'!${suunnitelma.alue}`,
    vuoroja: suunnitelma.vuoroja,
    poissaoloja: suunnitelma.poissaoloja,
    kirjoitettu: false,
    esikatselu: esikatseleRivit(suunnitelma),
    puuttuvatSarakkeet: suunnitelma.puuttuvatSarakkeet,
  }

  if (optiot.kuivaAjo) return tulos

  // Sarakkeeton myyjä on kirjoituseste, ei varoitus. Suunnitelma osaa jättää
  // hänet pois ilman virhettä, joten ilman tätä Vahvista kirjoittaisi listan
  // josta hänen vuoronsa puuttuvat ja raportoisi silti onnistuneensa.
  // Kuiva-ajo pääsee tähän asti ja näyttää nimet — juuri sitä varten se on.
  if (suunnitelma.puuttuvatSarakkeet.length > 0) {
    throw new Error(
      `Näillä myyjillä on vuoroja mutta ei saraketta taulukossa: `
      + `${suunnitelma.puuttuvatSarakkeet.join(', ')}. Lisää sarake taulukkoon ja `
      + 'kirjaa se MYYJA_SARAKKEET-karttaan (src/lib/shifts/tyovuoroExcel.ts) '
      + 'ennen kirjoitusta — muuten heidän vuoronsa katoaisivat hiljaa.',
    )
  }

  const rows = suunnitelma.arvot.map((rivi, r) => ({
    values: rivi.map((arvo, c) => ({
      ...soluArvo(arvo),
      userEnteredFormat: {
        backgroundColor: suunnitelma.varit[r][c] ? hexVari(suunnitelma.varit[r][c]!) : VALKOINEN,
      },
    })),
  }))

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: tiedosto.id,
    requestBody: {
      requests: [{
        updateCells: {
          range: {
            sheetId: eka.sheetId,
            startRowIndex: suunnitelma.ekaRivi - 1,
            endRowIndex: suunnitelma.vikaRivi,
            startColumnIndex: suunnitelma.ekaSarake,
            endColumnIndex: suunnitelma.vikaSarake + 1,
          },
          rows,
          fields: 'userEnteredValue,userEnteredFormat.backgroundColor',
        },
      }],
    },
  })

  tulos.kirjoitettu = true
  return tulos
}
