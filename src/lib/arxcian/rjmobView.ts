import type { DashData } from '../rjmobSheets.ts'
import type { RunRateData } from '../rjmobRunRate.ts'
import type { TargetRow } from '../rjmobTargets.ts'
import { myymalaRivit, myyjaTavoiteRivit, tavoiteSumma, yhteensaRivi, tapahtumaYhteensa } from '../rjmobRunRateRivit.ts'
import { runRateMittari } from '../rjmob.ts'

export type RjMobSelection = { route: '/arxcian/rj-mob/etela'; fileId: string; view: 'tavoitteet' | 'uusmyynti' | 'kassamyynti'; fingerprint?: string }
export function parseRjMobSelection(value: unknown): RjMobSelection {
  const v = value as Partial<RjMobSelection> | null
  if (!v || v.route !== '/arxcian/rj-mob/etela' || typeof v.fileId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(v.fileId) || !['tavoitteet', 'uusmyynti', 'kassamyynti'].includes(v.view ?? '')) throw new Error('RJ-Mobin näkymävalinta on virheellinen.')
  if (v.fingerprint !== undefined && (typeof v.fingerprint !== 'string' || !/^[0-9a-f]{8}$/.test(v.fingerprint))) throw new Error('Virheellinen lukutilanne')
  return { route: v.route, fileId: v.fileId, view: v.view!, ...(v.fingerprint === undefined ? {} : { fingerprint: v.fingerprint }) }
}
// Tilapäinen sivukohtainen valinta. Ei paikallista muistia eikä myyntitietoja.
let selection: RjMobSelection | undefined
export function setRjMobSelection(value: RjMobSelection | undefined) { selection = value }
export function getRjMobSelection(): RjMobSelection | undefined {
  return typeof window !== 'undefined' && window.location.pathname === selection?.route ? selection : undefined
}

export function rjMobComparisons(dash: { sellers: { nimi: string; tyyppi: string; liittKpl: number; fsecKpl: number; kassa: number }[]; stores: Pick<DashData, 'stores'>['stores'] }, runrate: RunRateData | null, targets: TargetRow[]) {
  const sellers = dash.sellers.filter(s => s.tyyppi !== 'standi')
  const storeTargets = Object.fromEntries((runrate?.tavoitteet.myymalat ?? []).map(m => [m.storeKey, m]))
  const sellerTargets = Object.fromEntries((runrate?.tavoitteet.myyjat ?? []).map(m => [m.nimi, m]))
  const days = runrate?.tyopaivat ?? { paattyneet: 0, kaikki: 0 }
  const stores = myymalaRivit(Object.entries(dash.stores).map(([nimi, s]) => ({ nimi, liittymat: s.liittKpl, fsecure: s.fsecKpl, kassakate: s.kassa })), storeTargets, days, runrate?.tapahtumat?.myymalat)
  const sellerRows = myyjaTavoiteRivit(sellers.map(s => ({ nimi: s.nimi, liittymat: s.liittKpl, fsecure: s.fsecKpl, kassakate: s.kassa * 10 })), sellerTargets, runrate?.myyjaVuorot ?? {}, runrate?.tapahtumat?.myyjat)
  const cash = (r: TargetRow) => {
    const window = runrate?.myyjaVuorot[r.nimi] ?? { paattyneet: 0, kaikki: 0 }
    const target = sellerTargets[r.nimi]?.kassakate ?? null
    return r.kassaKate === null ? { tavoite: target, toteuma: null, ennuste: null, pct: null } : runRateMittari(r.kassaKate, target, window.paattyneet, window.kaikki)
  }
  const cashTotalTarget = tavoiteSumma(Object.values(sellerTargets)).kassakate
  const cashTotal = !targets.length || targets.some(r => r.kassaKate === null)
    ? { tavoite: cashTotalTarget, toteuma: null, ennuste: null, pct: null }
    : runRateMittari(targets.reduce((sum, r) => sum + r.kassaKate!, 0), cashTotalTarget, days.paattyneet, days.kaikki)
  const storeTotal = runrate ? tapahtumaYhteensa(yhteensaRivi(Object.entries(dash.stores).map(([nimi, s]) => ({ nimi, liittymat: s.liittKpl, fsecure: s.fsecKpl, kassakate: s.kassa })), runrate.tavoitteet.yhteensa, days), stores) : null
  const sellerTotal = runrate ? tapahtumaYhteensa(yhteensaRivi(sellers.map(s => ({ nimi: s.nimi, liittymat: s.liittKpl, fsecure: s.fsecKpl, kassakate: s.kassa * 10 })), tavoiteSumma(Object.values(sellerTargets)), days), sellerRows) : null
  const completeTotal = (total: typeof storeTotal, rows: typeof sellerRows) => {
    if (total === null) return null
    const metric = (key: 'liittymat' | 'fsecure' | 'kassakate') => !rows.length || rows.some(r => r[key].toteuma === null)
      ? { ...total[key], toteuma: null, ennuste: null, pct: null } : total[key]
    return { liittymat: metric('liittymat'), fsecure: metric('fsecure'), kassakate: metric('kassakate') }
  }
  return { stores, sellers: sellerRows, storeTotal: completeTotal(storeTotal, stores), sellerTotal: completeTotal(sellerTotal, sellerRows), cash, cashTotal }
}

export function rjMobViewData(view: RjMobSelection['view'], comparisons: ReturnType<typeof rjMobComparisons>, targets: TargetRow[] | null) {
  const sum = (key: keyof TargetRow) => !targets?.length || targets.some(r => r[key] === null) ? null : targets.reduce((s, r) => s + (r[key] as number), 0)
  return view === 'tavoitteet' ? { stores: comparisons.stores, sellers: comparisons.sellers, storeTotal: comparisons.storeTotal, sellerTotal: comparisons.sellerTotal }
    : view === 'uusmyynti' ? { sellers: targets?.map(r => ({ nimi: r.nimi, dnaUusmyynti: r.dnaUusmyynti, elisaUusmyynti: r.elisaUusmyynti, teliaUusmyynti: r.teliaUusmyynti, uusmyyntiYhteensa: r.uusmyyntiYhteensa, uusmyyntiPerPaiva: r.uusmyyntiPerPaiva })) ?? null, total: { dna: sum('dnaUusmyynti'), elisa: sum('elisaUusmyynti'), telia: sum('teliaUusmyynti'), yhteensa: sum('uusmyyntiYhteensa') } }
    : { sellers: targets?.map(r => ({ nimi: r.nimi, kassaMyynti: r.kassaMyynti, kassaPalautus: r.kassaPalautus, kassaAlennus: r.kassaAlennus, kassaKuitit: r.kassaKuitit, kassaKate: r.kassaKate, kassaPerPaiva: r.kassaPerPaiva, comparison: comparisons.cash(r) })) ?? null, total: comparisons.cashTotal }
}

// Tunnistaa muuttuneen näkymän; käyttöoikeudet tarkistetaan erikseen palvelimella.
export function viewFingerprint(data: unknown): string {
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value
  const serialized = JSON.stringify(canonical(data))
  let hash = 2166136261
  for (let i = 0; i < serialized.length; i++) hash = Math.imul(hash ^ serialized.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(16).padStart(8, '0')
}
