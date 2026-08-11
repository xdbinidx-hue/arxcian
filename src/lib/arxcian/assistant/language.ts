import type { SessionUser } from '@/lib/session'
import { readCached, writeCached } from '../cache'
import { DEFAULT_LANGUAGE, isLanguage, type AssistantLanguage } from './types'

/**
 * Avustajan kieli käyttäjäkohtaisena asetuksena.
 *
 * Asetus on palvelimella eikä selaimessa, koska sitä tarvitaan kolmessa eri
 * paikassa jotka eivät jaa selaimen tilaa: mallin system promptissa, äänen
 * valinnassa (ElevenLabsilla on eri ääni per kieli) ja tervehdyksen tekstissä.
 * Selaimen lähettämä kieli tarkoittaisi että jokainen näistä joutuisi luottamaan
 * kutsujaan — ja PWA voi olla auki vanhalla JS:llä.
 *
 * Tyyppi ja oletus ovat types.ts:ssä, jotta selain voi tuoda ne ilman että
 * kv-asiakas päätyy niputukseen.
 */

/**
 * Vuosi. Kyse ei ole tuoreudesta vaan siivouksesta: asetus pysyy voimassa
 * kunnes käyttäjä vaihtaa sen, ja `readCached` palauttaa arvon ikään
 * katsomatta. Vanheneminen huolehtii vain siitä ettei käyttämätön avain jää
 * Redisiin ikuisesti.
 */
const TTL_SECONDS = 365 * 24 * 60 * 60

function key(user: SessionUser): string {
  return `assistant:lang:${user}`
}

/**
 * Käyttäjän nykyinen kieli. **Ei koskaan heitä**: Redis-katko palauttaa
 * oletuksen, jolloin avustaja vastaa englanniksi sen sijaan että koko vastaus
 * kaatuisi välimuistin vikaan.
 */
export async function getLanguage(user: SessionUser): Promise<AssistantLanguage> {
  const cached = await readCached<AssistantLanguage>(key(user))
  return cached && isLanguage(cached.data) ? cached.data : DEFAULT_LANGUAGE
}

/**
 * Vaihtaa kielen. `writeCached` nielee Redis-virheet, joten epäonnistunut
 * kirjoitus jättää vanhan kielen voimaan — käyttäjä huomaa sen heti seuraavasta
 * vastauksesta ja voi pyytää uudelleen. Sama kirjoitus ei voi mennä puoliksi
 * läpi, koska arvo on yksi kenttä.
 */
export async function setLanguage(user: SessionUser, language: AssistantLanguage): Promise<void> {
  await writeCached(key(user), language, TTL_SECONDS, 0)
}
