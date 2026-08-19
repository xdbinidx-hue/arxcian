import { kv } from './kv'

/**
 * Hakuyrityksen tila — erillään haetusta datasta.
 *
 * **Miksi tämä on oma avaimensa.** [cache.ts](cache.ts):n kirjekuori
 * kirjoitetaan vain onnistuneesta hausta, joten epäonnistunut yritys ei jätä
 * siitä mitään jälkeä: `fetchedAt` jää osoittamaan viime viikon onnistumiseen
 * ja sivu näyttää samalta kuin jos kaikki olisi kunnossa. Juuri se oli vika —
 * hub näytti vanhaa dataa kertomatta siitä.
 *
 * Tila kirjoitetaan **jokaisella** ajolla, myös kaatuneella, joten
 * käyttöliittymä voi sanoa "haettu viimeksi eilen 20:22, viimeisin yritys
 * 08:18 epäonnistui" eikä joudu arvaamaan iästä.
 *
 * **Miksei pelkkä ikäraja riittäisi.** Ajoja on neljä vuorokaudessa mutta yön
 * yli väli on laillisesti 12 h (20:00 → 08:00). Ikään perustuva raja joko
 * hälyttäisi joka aamu turhaan tai olisi niin väljä ettei se huomaisi
 * kokonaan menetettyä päivää. Tila on mitattu tieto, ei päätelmä.
 */
export type FetchStatus = {
  /** Unix ms: milloin hakua viimeksi yritettiin, onnistui tai ei */
  lastAttempt: number
  /** Unix ms: milloin haku viimeksi onnistui, tai null jos ei koskaan */
  lastSuccess: number | null
  /** Lähteiden nimet jotka kaatuivat viimeisimmällä yrityksellä */
  failed: string[]
  /** Montako lähdettä saatiin viimeisimmällä yrityksellä */
  ok: number
}

const PREFIX = 'arxcian:status:'

function fullKey(key: string) {
  return `${PREFIX}${key}`
}

/** Tila säilyy selvästi pidempään kuin haettu data, jotta katkos näkyy vielä sen jälkeenkin. */
const TTL_SECONDS = 30 * 24 * 60 * 60

/**
 * Kirjoittaa hakuyrityksen tilan. Redis-virhe ei saa kaataa itse hakua —
 * diagnostiikka on tärkeää mutta ei tärkeämpää kuin data.
 */
export async function writeFetchStatus(key: string, status: FetchStatus): Promise<void> {
  try {
    await kv().set(fullKey(key), status, { ex: TTL_SECONDS })
  } catch (e) {
    console.error(`[status] kirjoitus epäonnistui: ${key}`, e)
  }
}

/** Lukee hakuyrityksen tilan, tai null jos sitä ei ole. */
export async function readFetchStatus(key: string): Promise<FetchStatus | null> {
  try {
    return await kv().get<FetchStatus>(fullKey(key))
  } catch (e) {
    console.error(`[status] luku epäonnistui: ${key}`, e)
    return null
  }
}
