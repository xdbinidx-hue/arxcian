import { kv } from '@vercel/kv'

/**
 * Puhesynteesin merkkilaskuri (kustannusvahti).
 *
 * ElevenLabs laskuttaa lähetetyistä merkeistä, eikä sovellus muuten näe
 * kulutusta mistään: pyyntörajoitin (lib/arxcian/rateLimit.ts) laskee pyyntöjä,
 * mutta yksi pyyntö voi olla kolme sanaa tai kolme kappaletta. Tämä laskuri
 * kertoo mitä oikeasti kului.
 *
 * Laskuri on **kumulatiivinen eikä nollaudu**, kun taas ElevenLabsin oma
 * kiintiö on kuukausittainen. Tarkoitus onkin eri: tämä kertoo paljonko
 * arxcian on käyttänyt yhteensä, laskutuskauden tilanne katsotaan ElevenLabsin
 * omasta näkymästä.
 *
 * Kasvatus on atominen INCRBY, joten rinnakkaiset synteesit eivät hukkaa
 * toistensa lisäyksiä — luku-muokkaa-kirjoita -malli (kuten audit.ts:ssä)
 * hukkaisi ne, ja puhepaloja haetaan tarkoituksella rinnakkain.
 */

export const TTS_CHARS_KEY = 'assistant:tts:chars'

/**
 * Kasvattaa laskuria. **Ei koskaan heitä**: mittari on sivuvaikutus, ei
 * synteesin ehto — Redis-katko ei saa estää ääntä, vain sen kirjanpidon.
 */
export async function addChars(chars: number): Promise<void> {
  if (!Number.isFinite(chars) || chars <= 0) return
  try {
    await kv.incrby(TTS_CHARS_KEY, Math.round(chars))
  } catch (e) {
    console.error('[tts-usage] merkkilaskurin kasvatus epäonnistui', e)
  }
}

/**
 * Kulutetut merkit yhteensä. Redisin ollessa poissa palautetaan 0 — lukemaa ei
 * käytetä mihinkään päätökseen, joten epäonnistuminen ei saa kaataa kutsujaa.
 */
export async function readChars(): Promise<number> {
  try {
    const value = await kv.get<number | string | null>(TTS_CHARS_KEY)
    const parsed = typeof value === 'number' ? value : Number(value ?? 0)
    return Number.isFinite(parsed) ? parsed : 0
  } catch (e) {
    console.error('[tts-usage] merkkilaskurin luku epäonnistui', e)
    return 0
  }
}
