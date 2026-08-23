// Personalin listojen kirjoituslogiikka ilman I/O:ta.
//
// **Miksi tämä on olemassa.** Tavoitteet, rutiinit, muistiinpanot ja tehtävät
// olivat kaikki samassa kuviossa: lue koko lista, muokkaa muistissa, kirjoita
// koko lista takaisin. Avain on jaettu molemmille käyttäjille, joten kaksi
// yhtaikaista kirjoitusta hukkasi toisen hiljaa — Albinin lisäämä tehtävä
// katosi jos Arbnor merkitsi samalla hetkellä tavoitteen tehdyksi. Sama vaara
// on kirjattu kalenterin tokeneille (ks. CLAUDE.md, "Google Calendar"), ja se
// ratkaistiin siellä jakamalla avain. Täällä avainta ei voi jakaa: `shared`
// on määritelmällisesti molempien.
//
// Redis-toteutus on [ownedStoreKv.ts](src/lib/arxcian/personal/ownedStoreKv.ts):ssä.
// Tämä moduuli on tarkoituksella I/O:ton, jotta kilpailutilanne on testattavissa
// ilman Redistä — sama jako kuin työvuorolistan puhtailla säännöillä.

import type { Owner } from '@/lib/session'

/** Jokaisella tietueella on tunniste ja omistaja — muuta varasto ei tiedä. */
export type Owned = { id: string; owner: Owner }

/** Muutosfunktio: `null` tarkoittaa "ei muutosta", jolloin kirjoitusta ei tehdä. */
export type Mutation<T> = (current: T[]) => T[] | null

/**
 * Tallennuksen ja version luku/kirjoitus. Rajapinta, jotta sekä oikea
 * Redis-varasto että testin väärentämä kilpaileva kirjoittaja ajavat
 * täsmälleen saman logiikan.
 */
export type StoreBackend<T> = {
  read(): Promise<{ items: T[]; version: string }>
  /** `true` jos kirjoitus meni läpi, `false` jos versio oli ehtinyt muuttua. */
  write(expectedVersion: string, items: T[]): Promise<boolean>
}

/**
 * Montako kertaa törmännyt kirjoitus yritetään uudelleen.
 *
 * Kolme riittää: kirjoittajia on enintään kaksi ja kierros on yksi
 * Redis-edestakainen. Ääretön silmukka olisi väärä vastaus — jos versio
 * muuttuu joka kierroksella, vika on muualla eikä sitä korjata jankkaamalla.
 */
const MAX_ATTEMPTS = 3

/**
 * Lue–muokkaa–kirjoita uudelleenyrityksellä.
 *
 * Takaisinkutsu ajetaan joka yrityksellä uudelleen sitä listaa vasten jota
 * vasten kirjoitus oikeasti tehdään. Siksi omistajuustarkistus kuuluu
 * takaisinkutsun sisään: aiemmin `canView` tarkistettiin vanhentuneesta
 * luvusta ja kirjoitus tehtiin sen perusteella.
 */
export async function runMutate<T extends Owned>(
  backend: StoreBackend<T>,
  mutation: Mutation<T>,
): Promise<T[]> {
  let last: T[] = []

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { items, version } = await backend.read()
    last = items

    const next = mutation(items)
    if (next === null) return items

    if (await backend.write(version, next)) return next
  }

  // Kaikki yritykset törmäsivät. Palautetaan viimeisin luettu tila eikä
  // kirjoiteta väkisin: hiljainen ylikirjoitus on juuri se vika jota tämä
  // moduuli estää. Kutsuja näkee muuttumattoman listan.
  console.error('[ownedStore] kirjoitus ei mennyt läpi kilpailun takia')
  return last
}
