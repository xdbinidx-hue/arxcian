import { kv } from '@/lib/arxcian/kv'
import type { Myymala, MyymalaTavoite } from '@/lib/rjmobBonus'
import type { MuutosMerkinta } from '@/lib/rjmobBonusTavoitteet'

/**
 * Bonustavoitteiden jäädytys ja muutoshistoria.
 *
 * Kuukauden tavoitteet jäädytetään omaan avaimeensa, ja **jäädytyksen jälkeen
 * Drive-muutos ei enää muuta laskentaa**. Bonus on sidottu prosenttiin eikä
 * euroon, joten tavoitteen lasku kesken kuun olisi sama kuin bonuksen
 * jakaminen ilmaiseksi. Ero ei silti katoa: se kirjataan historiaan (kuka,
 * milloin, vanha → uusi) ja näytetään näkymässä.
 *
 * **Jäädytys tapahtuu laiskasti ensimmäisellä luvulla kuukauden alettua**, ei
 * ajastettuna työnä. Ajastus voi myöhästyä tai jäädä ajamatta, ja silloin
 * jäädytys jäisi tekemättä juuri siltä kuukaudelta jota katsotaan — laiska
 * jäädytys tapahtuu määritelmällisesti ennen kuin kukaan ehtii nähdä
 * jäädyttämätöntä lukua.
 *
 * Kirjoitus on `nx`, joten kaksi yhtaikaista lukua eivät jäädytä eri arvoja:
 * ensimmäinen voittaa ja toinen lukee saman.
 */

const LUKKO = (order: number) => `rjmob:bonus:targets:locked:${order}`
const HISTORIA = (order: number) => `rjmob:bonus:targets:history:${order}`

/** Historian katto. Yksi muutos kirjataan kerran, joten tämä ei täyty käytössä. */
const HISTORIA_MAX = 200

export type LukittuTavoite = {
  kuukausiOrder: number
  tavoitteet: Partial<Record<Myymala, MyymalaTavoite>>
  /** ISO-aika jolloin jäädytys tehtiin. */
  jaadytetty: string
  /** Mistä jäädytetty arvo tuli. */
  lahde: 'drive' | 'koodi'
}

export async function haeLukittu(kuukausiOrder: number): Promise<LukittuTavoite | null> {
  return (await kv().get<LukittuTavoite>(LUKKO(kuukausiOrder))) ?? null
}

/**
 * Jäädyttää kuukauden tavoitteet jos niitä ei ole vielä jäädytetty.
 *
 * Palauttaa **voimassa olevan** jäädytyksen: jos toinen pyyntö ehti ensin,
 * palautetaan sen arvo eikä omaa. Muuten kaksi yhtaikaista sivulatausta voisi
 * päätyä laskemaan bonusta eri tavoitteista.
 */
export async function jaadyta(
  kuukausiOrder: number,
  tavoitteet: Partial<Record<Myymala, MyymalaTavoite>>,
  lahde: 'drive' | 'koodi',
  nyt: Date = new Date(),
): Promise<LukittuTavoite> {
  const arvo: LukittuTavoite = {
    kuukausiOrder,
    tavoitteet,
    jaadytetty: nyt.toISOString(),
    lahde,
  }
  await kv().set(LUKKO(kuukausiOrder), arvo, { nx: true })
  return (await haeLukittu(kuukausiOrder)) ?? arvo
}

export async function haeHistoria(kuukausiOrder: number): Promise<MuutosMerkinta[]> {
  return (await kv().get<MuutosMerkinta[]>(HISTORIA(kuukausiOrder))) ?? []
}

/**
 * Lisää merkinnät historiaan.
 *
 * Historia luetaan ja kirjoitetaan kokonaisuutena, mutta kilpailu on tässä
 * vaaraton: sama muutos tunnistetaan `uudetMerkinnat`illa, joten hukkuneen
 * kirjoituksen merkintä syntyy uudelleen seuraavalla luvulla. Siksi tähän ei
 * tarvita `ownedStore`n versiointia.
 */
export async function lisaaHistoriaan(
  kuukausiOrder: number,
  uudet: MuutosMerkinta[],
): Promise<MuutosMerkinta[]> {
  if (uudet.length === 0) return haeHistoria(kuukausiOrder)
  const nykyinen = await haeHistoria(kuukausiOrder)
  const paivitetty = [...nykyinen, ...uudet].slice(-HISTORIA_MAX)
  await kv().set(HISTORIA(kuukausiOrder), paivitetty)
  return paivitetty
}
