import { RJ_MOB_SELLERS } from './rjmob.ts'
import type { LahtiVuoro } from './shifts/lahtiVuorot.ts'

/** Toteutuma ja jäljellä oleva suunnitelma ovat eri lähteitä. */
export function toteutuneetPaivat(rivit: string[][]): Record<string, number> {
  const otsikot = rivit[0]?.map(s => s.toLowerCase().trim()) ?? []
  const nimi = otsikot.findIndex(s => s === 'nimi')
  const paivat = otsikot.findIndex(s => s.startsWith('toteutuneet työpäivät'))
  if (nimi < 0 || paivat < 0) throw new Error('Toteutuneiden työpäivien sarake puuttuu')
  const nimet = new Map<string, string>()
  for (let i = 0; i < RJ_MOB_SELLERS.length; i += 2) {
    nimet.set(RJ_MOB_SELLERS[i].toLowerCase(), RJ_MOB_SELLERS[i])
    nimet.set(RJ_MOB_SELLERS[i + 1].toLowerCase(), RJ_MOB_SELLERS[i])
  }
  const tulos: Record<string, number> = {}
  for (const r of rivit.slice(1)) {
    const n = nimet.get((r[nimi] ?? '').trim().toLowerCase())
    const solu = (r[paivat] ?? '').trim()
    const arvo = Number(solu.replace(',', '.'))
    if (n && solu && Number.isInteger(arvo) && arvo >= 0) tulos[n] = arvo
  }
  return tulos
}

/** Sama henkilö samana päivänä lasketaan vain kerran. Lahti täydentää PK:ta. */
export function yhdistaVuorot(pk: LahtiVuoro[], lahti: LahtiVuoro[]): LahtiVuoro[] {
  const rivit = new Map<string, LahtiVuoro>()
  for (const v of [...pk, ...lahti]) rivit.set(`${v.seller}:${v.date}`, v)
  return Array.from(rivit.values())
}

export function toteumaIkkunat(vuorot: LahtiVuoro[], paivat: Record<string, number>, viimeinen: string) {
  const tulos: Record<string, { paattyneet: number; kaikki: number }> = {}
  for (const nimi of Array.from(new Set([...vuorot.map(v => v.seller), ...Object.keys(paivat)]))) {
    // Puuttuva toteuma ei muutu suunnitelluiksi tai nollaksi tehdyiksi päiviksi.
    if (!(nimi in paivat)) continue
    const tulevat = new Set(vuorot.filter(v => v.seller === nimi && v.date > viimeinen).map(v => v.date)).size
    tulos[nimi] = { paattyneet: paivat[nimi], kaikki: paivat[nimi] + tulevat }
  }
  return tulos
}
