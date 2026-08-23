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
 * Kirjoituksen lopputulos.
 *
 * `conflict` ja `error` on pidettävä erillään: edellinen kannattaa yrittää
 * uudelleen, jälkimmäinen ei. Yhtenä totuusarvona ne olivat sama asia, jolloin
 * rikkinäinen Redis näytti ikuiselta kilpailulta.
 */
export type WriteOutcome = 'ok' | 'conflict' | 'error'

export type StoreBackend<T> = {
  /** Heittää jos luku epäonnistuu — tyhjä lista ei saa tarkoittaa "ei vastausta". */
  read(): Promise<{ items: T[]; version: string }>
  write(expectedVersion: string, items: T[]): Promise<WriteOutcome>
}

/**
 * Kirjoitus ei mennyt läpi.
 *
 * **Heitto on tässä koko pointti.** Aiemmin epäonnistunut kirjoitus palautti
 * viimeksi luetun listan, jolloin reitti vastasi `200 OK` ja listalla jonka
 * käyttäjä juuri lisäsi ei ollut hänen lisäystään — ei virhettä, ei merkkiä,
 * vain rivi lokissa. Se on täsmälleen se kuvio jonka CLAUDE.md kieltää
 * ("Jos vika näkyy lokissa mutta ei vastauksessa, se on bugi").
 */
export class StoreWriteError extends Error {
  // Kentät kirjoitetaan auki: Node ajaa TypeScriptiä pelkällä tyyppien
  // riisumisella, eikä konstruktorin parametriominaisuus käänny siinä
  // tilassa lainkaan (ks. CLAUDE.md, "Testit ajetaan ilman testiajuria").
  readonly reason: 'conflict' | 'error'
  readonly key: string

  constructor(reason: 'conflict' | 'error', key: string) {
    super(
      reason === 'conflict'
        ? `Kirjoitus ${key} ei mennyt läpi: toinen muutos ehti väliin`
        : `Kirjoitus ${key} epäonnistui`,
    )
    this.reason = reason
    this.key = key
    this.name = 'StoreWriteError'
  }
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
 *
 * **Takaisinkutsussa ei saa olla sivuvaikutuksia** — se voi ajautua useamman
 * kerran. Ks. `promoteNoteToGoal` siitä miten sivuvaikutus tehdään turvallisesti.
 */
export async function runMutate<T extends Owned>(
  key: string,
  backend: StoreBackend<T>,
  mutation: Mutation<T>,
): Promise<T[]> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { items, version } = await backend.read()

    const next = mutation(items)
    if (next === null) return items

    const outcome = await backend.write(version, next)
    if (outcome === 'ok') return next
    // Kova virhe ei parane yrittämällä uudelleen — vain törmäys paranee.
    if (outcome === 'error') throw new StoreWriteError('error', key)
  }

  throw new StoreWriteError('conflict', key)
}
