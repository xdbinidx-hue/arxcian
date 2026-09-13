import { pctTavoitteesta, type RunRateMittari } from './rjmob.ts'
import type { DayInfo } from './shiftSchedule.ts'
import type { LahtiVuoro } from './shifts/lahtiVuorot.ts'

/** Käyttäjän Nest-kuva ja vahvistus: kaikki Malmin 10.–12.9. myynnit
 * ovat tapahtumamyyntiä ja sisältyvät jo kuukausitoteumaan. Muiden
 * myymälöiden samojen päivien myyntiä ei vähennetä. Ei tavoitelukuja. */
export const MALMI_SYYSKUU_2026 = {
  alku: '2026-09-10', loppu: '2026-09-12', storeKey: 'Helsinki, Malmi',
  myyjat: {
    'Hamza Hanif': 111, 'Arbnor Rashica': 48, 'Miska Hyttinen': 51,
    'Alec Fambro': 50, 'Ikko Hero': 48, 'Lauri Ukkonen': 39,
    'Aki Valtonen': 40, 'Kasperi Kemppainen': 33, 'Joni Viljamaa': 24,
    'Krenar Bajqinovci': 20, 'Ramin Kadiri': 19, 'Joona Huttunen': 19,
    'Vladimir Kogan': 12, 'Albin Rashica': 1,
  } as Record<string, number>,
}

export type TapahtumaOikaisu = {
  /** Tapahtumatoteuma on jo kuukauden toteumassa. */
  toteuma: number
  paattyneet: number
  kaikki: number
  selite: string
  /** Epätäydellistä erittelyä ei käytetä normaalitahdin laskemiseen. */
  puute?: string
}
export type TapahtumaRunRate = {
  myymalat: Record<string, TapahtumaOikaisu>
  myyjat: Record<string, TapahtumaOikaisu>
}

type Vuoro = { seller: string; date: string; paikka: string; tapahtuma: boolean }

/** Sama lähdevalinta kuin vuoroikkunoilla: Lahden myyjän vuorot voittavat.
 * Pelkkä tapahtuman päivämäärä ei muuta muualla tehtyä vuoroa tapahtumaksi. */
export function tapahtumaOikaisut(
  order: number, viimeinen: string, pk: DayInfo[], lahti: LahtiVuoro[],
): TapahtumaRunRate {
  const result: TapahtumaRunRate = { myymalat: {}, myyjat: {} }
  // Tämä vahvistettu erittely koskee vain yhtä tapahtumaa. Muiden kuukausien
  // toteumaa tai tapahtuman tavoitetta ei lainata sen tilalle.
  if (order !== 202609) return result
  const e = MALMI_SYYSKUU_2026
  const valmis = viimeinen >= e.loppu
  result.myymalat[e.storeKey] = {
    toteuma: Object.values(e.myyjat).reduce((a, b) => a + b, 0),
    paattyneet: 3, kaikki: 3,
    selite: 'Malmi 10.–12.9.: 515 tapahtumaliittymää. Ennuste jatkaa vain normaalipäivien tahtia.',
    ...(!valmis ? { puute: 'Tapahtuman 10.–12.9. erittelyä voi käyttää vasta tapahtuman päätyttyä.' } : {}),
  }
  const lahtiNimet = new Set(lahti.map(v => v.seller))
  const vuorot: Vuoro[] = pk.flatMap(d => d.shifts.map(s => ({
    seller: s.seller, date: d.date, paikka: s.store, tapahtuma: s.store === 'Tapahtuma',
  }))).filter(v => !lahtiNimet.has(v.seller))
  const normaaliPaikka = /^(h|s|m|e|k|holma|syke|malmi|easton|kivistö)(\s*\+\s*(h|s|m|e|k))*$/i
  vuorot.push(...lahti.map(v => ({
    seller: v.seller, date: v.date, paikka: v.paikka,
    tapahtuma: v.paikka.trim() !== '' && !normaaliPaikka.test(v.paikka.trim()),
  })))
  const nimet = new Set([...Object.keys(e.myyjat), ...vuorot.filter(v => v.tapahtuma).map(v => v.seller)])
  for (const nimi of Array.from(nimet)) {
    const omat = vuorot.filter(v => v.seller === nimi)
    const kuuluu = (v: Vuoro) => nimi in e.myyjat && v.date >= e.alku && v.date <= e.loppu
      && (v.paikka.toLowerCase() === 'malmi' || v.paikka.toLowerCase() === 'm' || v.tapahtuma)
    const tapahtumaVuorot = omat.filter(kuuluu)
    const muut = omat.filter(v => v.tapahtuma && !kuuluu(v))
    const syyt: string[] = []
    if (!valmis && nimi in e.myyjat) syyt.push('Malmin tapahtuman erittely ei ole vielä päättynyt')
    if (nimi in e.myyjat && tapahtumaVuorot.length === 0) syyt.push('Malmin tapahtumamyynti on tiedossa, mutta tapahtumavuoro puuttuu työvuorolistasta')
    const aiemmat = muut.filter(v => v.date <= viimeinen)
    const tulevat = muut.filter(v => v.date > viimeinen)
    if (aiemmat.length) syyt.push(`Muiden tapahtumien toteumaerittely puuttuu (${Array.from(new Set(aiemmat.map(v => v.date))).join(', ')})`)
    if (tulevat.length) syyt.push(`Tulevien tapahtumavuorojen myyntiarvio puuttuu (${Array.from(new Set(tulevat.map(v => v.date))).join(', ')})`)
    // Kaksi vuoroa saman päivän aikana ei kerro ajankäytön jakoa. Älä
    // vähennä koko päivää normaalimyynnistä ilman tarkempaa erittelyä.
    if (tapahtumaVuorot.some(v => omat.filter(o => o.date === v.date).length > 1)) syyt.push('Samalla päivällä on useita vuoroja; tapahtuma-aika on eriteltävä')
    result.myyjat[nimi] = {
      toteuma: e.myyjat[nimi] ?? 0,
      paattyneet: tapahtumaVuorot.filter(v => v.date <= viimeinen).length,
      kaikki: tapahtumaVuorot.length,
      selite: `Malmin tapahtuma: ${e.myyjat[nimi] ?? 0} liittymää, ${tapahtumaVuorot.length} tapahtumavuoroa. Ennuste käyttää normaalivuorojen tahtia.`,
      ...(syyt.length ? { puute: syyt.join('. ') } : {}),
    }
  }
  return result
}

/** Toteuma säilyy; vain loppukuun lisämyynti ennustetaan normaalitahdilla. */
export function tapahtumaMittari(
  mittari: RunRateMittari, ikkuna: { paattyneet: number; kaikki: number }, o: TapahtumaOikaisu,
): RunRateMittari & { huomautus: string } {
  const tyhja = (syy: string) => ({ ...mittari, ennuste: null, pct: null, huomautus: syy })
  if (!Number.isFinite(mittari.toteuma) || mittari.toteuma < o.toteuma) return tyhja('Kuukausitoteuma on tapahtumaerittelyä pienempi. Tarkista lähdetiedot.')
  if (ikkuna.kaikki > 0 && ikkuna.paattyneet === ikkuna.kaikki) {
    return { ...mittari, ennuste: mittari.toteuma, pct: pctTavoitteesta(mittari.toteuma, mittari.tavoite), huomautus: 'Kausi on päättynyt: ennuste vastaa toteumaa.' }
  }
  if (o.puute) return tyhja(o.puute)
  const paattyneet = ikkuna.paattyneet - o.paattyneet
  const kaikki = ikkuna.kaikki - o.kaikki
  if (paattyneet <= 0 || kaikki < paattyneet || o.paattyneet > ikkuna.paattyneet || o.kaikki > ikkuna.kaikki) return tyhja('Normaalivuorojen myyntitahtia ei voi vielä laskea työvuorolistasta.')
  const ennuste = mittari.toteuma + (mittari.toteuma - o.toteuma) / paattyneet * (kaikki - paattyneet)
  return { ...mittari, ennuste, pct: pctTavoitteesta(ennuste, mittari.tavoite), huomautus: o.selite }
}
