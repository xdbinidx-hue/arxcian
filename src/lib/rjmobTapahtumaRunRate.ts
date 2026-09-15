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

/** Albin vahvisti kuvista ja päivistä 15.9.2026: Iisalmen myynnit kuuluvat kokonaan
 * 3.–5.9. tapahtumaan ja sisältyvät jo myyjien kuukausitoteumiin. */
export const IISALMI_SYYSKUU_2026 = {
  alku: '2026-09-03', loppu: '2026-09-05',
  myyjat: { 'Hamza Hanif': 127, 'Alec Fambro': 82 } as Record<string, number>,
}

// Käyttäjän Ylöjärven kuva: Joona 20 liittymää 4.9., jo kuukausitoteumassa.
export const YLOJARVI_SYYSKUU_2026 = {
  alku: '2026-09-04', loppu: '2026-09-04',
  myyjat: { 'Joona Huttunen': 20 } as Record<string, number>,
}

export const TAPAHTUMA_LIITTYMAT_PER_PAIVA = 20
export const TAPAHTUMA_HYVA_PER_PAIVA = 25
export const TAPAHTUMA_ERINOMAINEN_YLI = 30
export function tapahtumaPaivanTaso(myynti: number | null): 'heikko' | 'minimi' | 'hyva' | 'erinomainen' | 'tuntematon' {
  if (myynti === null || !Number.isFinite(myynti)) return 'tuntematon'
  if (myynti > TAPAHTUMA_ERINOMAINEN_YLI) return 'erinomainen'
  if (myynti >= TAPAHTUMA_HYVA_PER_PAIVA) return 'hyva'
  if (myynti >= TAPAHTUMA_LIITTYMAT_PER_PAIVA) return 'minimi'
  return 'heikko'
}

export type TapahtumaOikaisu = {
  /** Tulevat tapahtumapäivät ennustetaan erikseen, kerran per päivä. */
  tulevatPaivat?: number
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
  // Nämä vahvistetut erittelyt koskevat syyskuun 2026 tapahtumia. Muiden kuukausien
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
  const iisalmi = IISALMI_SYYSKUU_2026
  const ylojarvi = YLOJARVI_SYYSKUU_2026
  const nimet = new Set([...Object.keys(e.myyjat), ...Object.keys(iisalmi.myyjat), ...Object.keys(ylojarvi.myyjat), ...vuorot.filter(v => v.tapahtuma).map(v => v.seller)])
  for (const nimi of Array.from(nimet)) {
    const omat = vuorot.filter(v => v.seller === nimi)
    const kuuluuMalmiin = (v: Vuoro) => nimi in e.myyjat && v.date >= e.alku && v.date <= e.loppu
      && (v.paikka.toLowerCase() === 'malmi' || v.paikka.toLowerCase() === 'm' || v.tapahtuma)
    const kuuluuIisalmeen = (v: Vuoro) => nimi in iisalmi.myyjat && v.date >= iisalmi.alku && v.date <= iisalmi.loppu
      && v.tapahtuma
    const kuuluuYlojarveen = (v: Vuoro) => nimi in ylojarvi.myyjat && v.date === ylojarvi.alku && v.tapahtuma
    const malmiVuorot = omat.filter(kuuluuMalmiin)
    const iisalmiVuorot = omat.filter(kuuluuIisalmeen)
    const ylojarviVuorot = omat.filter(kuuluuYlojarveen)
    const tapahtumaVuorot = [...malmiVuorot, ...iisalmiVuorot, ...ylojarviVuorot]
    const muut = omat.filter(v => v.tapahtuma && !kuuluuMalmiin(v) && !kuuluuIisalmeen(v) && !kuuluuYlojarveen(v))
    const syyt: string[] = []
    if (!valmis && nimi in e.myyjat) syyt.push('Malmin tapahtuman erittely ei ole vielä päättynyt')
    if (nimi in e.myyjat && malmiVuorot.length === 0) syyt.push('Malmin tapahtumamyynti on tiedossa, mutta tapahtumavuoro puuttuu työvuorolistasta')
    if (nimi in iisalmi.myyjat) {
      if (viimeinen < iisalmi.loppu) syyt.push('Iisalmen tapahtuman erittely ei ole vielä päättynyt')
      if (new Set(iisalmiVuorot.map(v => v.date)).size !== 3) syyt.push('Iisalmen 3.–5.9. tapahtumavuorojen erittely puuttuu työvuorolistasta')
    }
    if (nimi in ylojarvi.myyjat) {
      if (viimeinen < ylojarvi.loppu) syyt.push('Ylöjärven tapahtuman erittely ei ole vielä päättynyt')
      if (new Set(ylojarviVuorot.map(v => v.date)).size !== 1) syyt.push('Ylöjärven 4.9. tapahtumavuoro puuttuu työvuorolistasta')
    }
    const aiemmat = muut.filter(v => v.date <= viimeinen)
    if (aiemmat.length) syyt.push(`Muiden tapahtumien toteumaerittely puuttuu (${Array.from(new Set(aiemmat.map(v => v.date))).join(', ')})`)
    // Albinin uusin päätös 14.9.2026: 20 liittymää / myyjä / tuleva
    // tapahtumapäivä. Päivä poistetaan normaalitahdin loppuennusteesta.
    const tulevat = muut.filter(v => v.date > viimeinen)
    if ([...tapahtumaVuorot, ...tulevat].some(v => omat.filter(o => o.date === v.date).length > 1)) syyt.push('Samalla päivällä on useita vuoroja; tapahtuma-aika on eriteltävä')
    const toteuma = (e.myyjat[nimi] ?? 0) + (iisalmi.myyjat[nimi] ?? 0) + (ylojarvi.myyjat[nimi] ?? 0)
    result.myyjat[nimi] = {
      toteuma,
      tulevatPaivat: new Set(tulevat.map(v => v.date)).size,
      paattyneet: tapahtumaVuorot.filter(v => v.date <= viimeinen).length,
      kaikki: tapahtumaVuorot.length,
      selite: `Vahvistettu tapahtumamyynti: ${toteuma} liittymää, ${tapahtumaVuorot.length} tapahtumavuoroa. Tulevat tapahtumapäivät: ${new Set(tulevat.map(v => v.date)).size} × ${TAPAHTUMA_LIITTYMAT_PER_PAIVA} liittymää. Muut jäljellä olevat vuorot ennustetaan normaalitahdilla.`,
      ...(syyt.length ? { puute: syyt.join('. ') } : {}),
    }
  }
  for (const o of Object.values(result.myyjat)) {
    if (!o.puute && o.paattyneet > 0) {
      const daily = o.toteuma / o.paattyneet
      const labels = {heikko:'alle minimin',minimi:'minimi',hyva:'hyvä',erinomainen:'erittäin hyvä',tuntematon:'tuntematon'}
      o.selite += ` Vahvistettujen tapahtumapäivien keskiarvo ${daily.toFixed(1)} liitt/pv: ${labels[tapahtumaPaivanTaso(daily)]}.`
    }
    o.selite += ` Tapahtumapäivän rajat: minimi ${TAPAHTUMA_LIITTYMAT_PER_PAIVA}, hyvä ${TAPAHTUMA_HYVA_PER_PAIVA}, erittäin hyvä yli ${TAPAHTUMA_ERINOMAINEN_YLI}.`
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
  const tulevat = o.tulevatPaivat ?? 0
  const normaalejaJaljella = kaikki - paattyneet - tulevat
  if (!Number.isInteger(tulevat) || tulevat < 0 || normaalejaJaljella < 0 || paattyneet < 0
    || (paattyneet === 0 && normaalejaJaljella > 0) || o.paattyneet > ikkuna.paattyneet || o.kaikki > ikkuna.kaikki) {
    return tyhja('Normaalivuorojen myyntitahtia ei voi vielä laskea työvuorolistasta.')
  }
  const normaaliEnnuste = normaalejaJaljella === 0 ? 0 : (mittari.toteuma - o.toteuma) / paattyneet * normaalejaJaljella
  const ennuste = mittari.toteuma + normaaliEnnuste + tulevat * TAPAHTUMA_LIITTYMAT_PER_PAIVA
  return { ...mittari, ennuste, pct: pctTavoitteesta(ennuste, mittari.tavoite), huomautus: o.selite }
}
