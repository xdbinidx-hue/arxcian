import { readCached, writeCached } from '../cache'
import type { UserId } from '@/lib/session'

/**
 * Jonoon laitetut tapahtumat: mitkä ilmoitukset on jo ajastettu ja millä
 * QStashin viesti-id:llä.
 *
 * **Miksi tämä on olemassa.** Suunnittelija ajetaan useita kertoja
 * vuorokaudessa, ja ilman muistia jokainen ajo jonottaisi samat tapahtumat
 * uudelleen — Lontoon avaus tulisi neljästi. QStashilla on oma
 * deduplikaationsa, mutta siihen ei nojata: **viesti-id tarvitaan joka
 * tapauksessa peruutukseen**. Kun poistat oman treidausajan, poistetun ajan
 * ilmoitus on saatava pois jonosta, eikä sitä voi tehdä ilman id:tä.
 *
 * Yksi avain käyttäjää kohti eikä avain tapahtumaa kohti: koko kartta
 * luetaan ja kirjoitetaan kerran suunnitteluajossa, kun taas erilliset
 * avaimet vaatisivat listauksen tai skannauksen jokaisella kierroksella.
 * Kokoluokka on kymmeniä rivejä, joten kartta on pieni.
 */

export type PlannedEntry = {
  messageId: string
  /** Tapahtuman hetki. Kertoo milloin rivin voi siivota pois. */
  at: number
}

/** Avaimena `MarketEvent.key`, joka sisältää tapahtuman absoluuttisen hetken. */
export type PlannedMap = Record<string, PlannedEntry>

// Kartta ei saa vanhentua alta: jos se katoaisi, suunnittelija jonottaisi
// kaikki tapahtumat uudelleen eikä osaisi perua vanhoja.
const TTL_SECONDS = 5 * 365 * 24 * 60 * 60

function key(user: UserId): string {
  return `push:planned:${user}`
}

export async function getPlanned(user: UserId): Promise<PlannedMap> {
  const cached = await readCached<PlannedMap>(key(user))
  return cached?.data ?? {}
}

export async function savePlanned(user: UserId, planned: PlannedMap): Promise<void> {
  await writeCached(key(user), planned, TTL_SECONDS, 0)
}
