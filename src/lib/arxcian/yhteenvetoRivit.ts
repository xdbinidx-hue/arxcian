// Yhteenveto-API:n puhtaat osat: mittarin muunnos ja myyjän myymäläkohdistus.
//
// Erotettu [yhteenveto.ts](yhteenveto.ts):stä samasta syystä kuin
// työvuorosäännöt Drive-luvusta: kokoaja tuo googleapisin ja Sheets-lukijat,
// eikä sitä voi ajaa Macilla lainkaan (`.env.local`in palvelutiliavain on
// paikanpitäjä). Nämä funktiot testataan ilman verkkoa.
//
// ".ts"-pääte importissa on tahallinen, ja `import type` katoaa käännöksessä
// kokonaan — Noden ESM-resolveri ei osaa `@/*`-aliasta.
import type { RunRateMittari } from '../rjmob.ts'

/**
 * Yhden mittarin run rate. Sama nelikko kuin `RunRateMittari`, mutta `pct`
 * (0–100) on muunnettu desimaaliksi `osuus` — muotoilu kuuluu vastauksen
 * lukijalle, ei API:lle.
 */
export type Mittari = {
  tavoite: number | null
  toteuma: number
  ennuste: number | null
  osuus: number | null
}

export type MittariSetti = {
  liittymat: Mittari
  fsecure: Mittari
  kassakate: Mittari
}

export function mittari(m: RunRateMittari): Mittari {
  return {
    tavoite: m.tavoite,
    toteuma: m.toteuma,
    ennuste: m.ennuste,
    osuus: m.pct === null ? null : m.pct / 100,
  }
}

export function setti(
  r: { liittymat: RunRateMittari; fsecure: RunRateMittari; kassakate: RunRateMittari },
): MittariSetti {
  return { liittymat: mittari(r.liittymat), fsecure: mittari(r.fsecure), kassakate: mittari(r.kassakate) }
}

/**
 * Nimen molemmat kirjoitusjärjestykset samaan avaimeen: "Etunimi Sukunimi" ja
 * "Sukunimi Etunimi". Myymäläerittely ja myyjätaulukko voivat käyttää eri
 * järjestystä, ja väärä pariutus kohdistaisi myyjän hiljaa väärään myymälään.
 */
export function nimiAvaimet(nimi: string): string[] {
  const osat = nimi.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (osat.length < 2) return [osat.join(' ')]
  return [osat.join(' '), [...osat.slice(1), osat[0]].join(' ')]
}

/**
 * Myyjä → myymälä jossa hän teki eniten tunteja.
 *
 * Kohdistus tehdään **tehdyistä tunneista** eikä myyjän aluetiedosta, samasta
 * syystä kuin palkkakulun kohdistus `loadDashData`ssa: myyjät kiertävät
 * myymälöiden välillä ja alue kertoo vain missä päin hän pääsääntöisesti on.
 *
 * Tasatilanteessa voittaa ensin luettu myymälä — järjestys on Driven, joten
 * mielivaltainen valinta on parempi kuin kaksi eri vastausta samasta datasta.
 */
export function myymalaPerMyyja(
  storeHours: Record<string, Record<string, number>>,
): Record<string, string> {
  const paras: Record<string, { myymala: string; tunnit: number }> = {}
  for (const [myymala, myyjat] of Object.entries(storeHours)) {
    for (const [nimi, tunnit] of Object.entries(myyjat)) {
      for (const avain of nimiAvaimet(nimi)) {
        if (!paras[avain] || tunnit > paras[avain].tunnit) paras[avain] = { myymala, tunnit }
      }
    }
  }
  return Object.fromEntries(Object.entries(paras).map(([k, v]) => [k, v.myymala]))
}
