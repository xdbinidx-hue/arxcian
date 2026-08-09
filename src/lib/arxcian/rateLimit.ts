import { kv } from '@vercel/kv'

const DEFAULT_WINDOW_SECONDS = 60 * 60

/**
 * Yksinkertainen tuntikohtainen pyyntörajoitus KV:n atomisella incr-
 * toiminnolla. Avain sisältää nykyisen tunnin numeron, jolloin laskuri
 * vaihtuu automaattisesti tunnin vaihtuessa eikä liu'u edellisestä
 * kutsusta. TTL asetetaan vain ensimmäisellä kutsulla (kun incr palauttaa
 * 1) — muuten jokainen kutsu venyttäisi vanhenemisaikaa eikä laskuri
 * koskaan nollautuisi.
 *
 * Redis-virheet eivät saa estää käyttöä: samaa periaatetta noudattaa
 * lib/arxcian/cache.ts, jossa Redisin poissaolo ohittaa välimuistin sen
 * sijaan että kaataisi sivun.
 */
export async function checkRateLimit(
  prefix: string,
  userId: string,
  limit: number,
  windowSeconds = DEFAULT_WINDOW_SECONDS,
): Promise<boolean> {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000))
  const key = `ratelimit:${prefix}:${userId}:${bucket}`

  try {
    const count = await kv.incr(key)
    if (count === 1) await kv.expire(key, windowSeconds)
    return count <= limit
  } catch (e) {
    console.error(`[ratelimit] tarkistus epäonnistui: ${prefix}`, e)
    return true
  }
}
