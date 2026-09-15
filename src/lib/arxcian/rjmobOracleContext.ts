import { listSeurantaFiles, SPREADSHEET_MIME } from '../rjmobDrive'
import { loadDashData } from '../rjmobSheets'
import { loadRunRate } from '../rjmobRunRate'
import { loadTargets } from '../rjmobTargets'
import { parseRjMobSelection, rjMobComparisons, rjMobViewData, viewFingerprint } from './rjmobView'
import type { SessionUser } from '../session'

// Molemmilla nykyisillä käyttäjillä on pääsy jaettuun RJ-Mob-näkymään.
// Tiedosto rajataan näkymän kuukausilistaan; mielivaltaisia Drive-ID:itä ei lueta.
export async function resolveRjMobOracleContext(value: unknown, user: SessionUser) {
  if (user !== 'albin' && user !== 'arbnor') throw new Error('Ei käyttöoikeutta')
  const selection = parseRjMobSelection(value)
  const files = await listSeurantaFiles()
  if (!files.some(f => f.id === selection.fileId && f.mimeType === SPREADSHEET_MIME)) throw new Error('Tiedosto ei kuulu näkymään')
  const [dashResult, runrateResult, targetsResult] = await Promise.allSettled([loadDashData(selection.fileId), loadRunRate(selection.fileId), loadTargets(selection.fileId)])
  const dash = dashResult.status === 'fulfilled' ? dashResult.value : null
  const runrate = runrateResult.status === 'fulfilled' ? runrateResult.value : null
  const targets = targetsResult.status === 'fulfilled' ? targetsResult.value : null
  const comparisons = rjMobComparisons(dash ?? { sellers: [], stores: {} }, runrate, targets?.targets ?? [])
  const warnings = [ ...(dash?.puutteet ?? []), ...(runrate?.varoitukset ?? []), ...(targets?.varoitukset ?? []),
    ...(!dash ? ['Myyntitiedot puuttuvat: lukuvirhe.'] : []), ...(!runrate ? ['Tavoitteet ja työpäivät puuttuvat: lukuvirhe.'] : []), ...(!targets ? ['Uusmyynti ja kassamyynti puuttuvat: lukuvirhe.'] : []) ]
  const data = rjMobViewData(selection.view, comparisons, targets?.targets ?? null)
  if (selection.fingerprint && selection.fingerprint !== viewFingerprint(data)) throw new Error('Näkymän luvut muuttuneet. Päivitä näkymä.')
  return {
    selection, capturedAt: new Date().toISOString(), month: dash?.kuukausi ?? runrate?.kuukausi ?? targets?.kuukausi,
    filters: { sellers: 'Nykyisen näkymän kaikki myyjät; ständimyyjät rajattu myyntiseurannasta pois.' },
    missingValue: 'null tarkoittaa puuttuvaa tietoa; 0 on mitattu nolla. Ennuste ja pct ovat nykyisen näkymän run rate -säännöillä. Älä keksi puuttuvia lukuja. Kolme parasta vaatii käyttäjän valitseman mittarin.',
    warnings,
    data,
  }
}
