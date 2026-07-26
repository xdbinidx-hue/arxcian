import { kv } from '@vercel/kv'

/**
 * Geneerinen hae-ja-välimuistita -apuri arxcianin ulkoisille datalähteille.
 *
 * Periaatteet:
 * - Sivulataus ei koskaan odota ulkoista lähdettä jos välimuistissa on
 *   tuoretta dataa. Cron pitää välimuistin lämpimänä.
 * - Jos lähde kaatuu, palautetaan mieluummin vanhentunutta dataa kuin
 *   virhe. RSS-syötteet ja markkinadata-API:t ovat epäluotettavia.
 * - Jos Redis on poissa, haku tehdään suoraan lähteestä. Välimuistin
 *   ongelma ei saa kaataa sivua.
 */

const PREFIX = 'arxcian:'

/** Vastaus ja tieto siitä mistä se tuli. */
export type Fetched<T> = {
  data: T
  /** Unix ms jolloin data haettiin lähteestä */
  fetchedAt: number
  source: 'network' | 'cache' | 'stale'
}

type Envelope<T> = {
  data: T
  fetchedAt: number
}

export type CacheOptions = {
  /** Avain ilman etuliitettä, esim. 'news:bisnes' */
  key: string
  /** Sekunteina: kuinka kauan data on tuoretta */
  ttl: number
  /** Sekunteina: kuinka kauan vanhentunutta dataa kelpuutetaan haun kaatuessa. Oletus 24 h. */
  staleFor?: number
  /** Hakee lähteestä vaikka välimuisti olisi tuore. Cron käyttää tätä. */
  force?: boolean
  /** Millisekunteina: haun aikakatkaisu. Oletus 15 s. */
  timeout?: number
}

const DEFAULT_STALE_FOR = 24 * 60 * 60
const DEFAULT_TIMEOUT = 15_000

function fullKey(key: string) {
  return `${PREFIX}${key}`
}

/** Redis-virheet eivät saa kaataa kutsujaa. */
async function readEnvelope<T>(key: string): Promise<Envelope<T> | null> {
  try {
    return await kv.get<Envelope<T>>(fullKey(key))
  } catch (e) {
    console.error(`[cache] luku epäonnistui: ${key}`, e)
    return null
  }
}

async function writeEnvelope<T>(key: string, envelope: Envelope<T>, expiration: number) {
  try {
    await kv.set(fullKey(key), envelope, { ex: expiration })
  } catch (e) {
    console.error(`[cache] kirjoitus epäonnistui: ${key}`, e)
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, key: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Haku aikakatkaistiin (${key}, ${ms} ms)`)), ms)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * Palauttaa välimuistin tuoreen datan tai hakee sen lähteestä.
 * Haun kaatuessa palautetaan vanhentunut data jos sellaista on.
 */
export async function fetchAndCache<T>(
  options: CacheOptions,
  fetcher: () => Promise<T>,
): Promise<Fetched<T>> {
  const { key, ttl, staleFor = DEFAULT_STALE_FOR, force = false, timeout = DEFAULT_TIMEOUT } = options

  const cachedEnvelope = await readEnvelope<T>(key)
  const age = cachedEnvelope ? (Date.now() - cachedEnvelope.fetchedAt) / 1000 : Infinity

  if (!force && cachedEnvelope && age < ttl) {
    return { data: cachedEnvelope.data, fetchedAt: cachedEnvelope.fetchedAt, source: 'cache' }
  }

  try {
    const data = await withTimeout(fetcher(), timeout, key)
    const envelope: Envelope<T> = { data, fetchedAt: Date.now() }
    await writeEnvelope(key, envelope, Math.ceil(ttl + staleFor))
    return { data, fetchedAt: envelope.fetchedAt, source: 'network' }
  } catch (error) {
    if (cachedEnvelope) {
      console.error(`[cache] haku epäonnistui, käytetään vanhentunutta dataa: ${key}`, error)
      return { data: cachedEnvelope.data, fetchedAt: cachedEnvelope.fetchedAt, source: 'stale' }
    }
    throw error
  }
}

/** Lukee välimuistista hakematta lähteestä. Sivut käyttävät tätä kun cron pitää datan tuoreena. */
export async function readCached<T>(key: string): Promise<Fetched<T> | null> {
  const envelope = await readEnvelope<T>(key)
  if (!envelope) return null
  return { data: envelope.data, fetchedAt: envelope.fetchedAt, source: 'cache' }
}

/** Kirjoittaa välimuistiin ilman hakua. */
export async function writeCached<T>(
  key: string,
  data: T,
  ttl: number,
  staleFor = DEFAULT_STALE_FOR,
): Promise<void> {
  await writeEnvelope(key, { data, fetchedAt: Date.now() }, Math.ceil(ttl + staleFor))
}

/** Poistaa avaimen välimuistista. */
export async function invalidate(key: string): Promise<void> {
  try {
    await kv.del(fullKey(key))
  } catch (e) {
    console.error(`[cache] poisto epäonnistui: ${key}`, e)
  }
}
