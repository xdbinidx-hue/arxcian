import { kv } from '../kv'
import { visibleTo, type SessionUser } from '@/lib/session'
import { runMutate, type Mutation, type Owned, type StoreBackend } from './ownedStore'

/**
 * Redis-taustainen varasto Personalin listoille.
 *
 * **Miksi CAS eikä uusi tietomuoto.** Versionumero ja ehdollinen kirjoitus
 * eivät muuta tallennettua muotoa lainkaan, joten elävää dataa ei tarvitse
 * migroida. Redis-hash olisi poistanut koko luku-muokkaa-kirjoita -kuvion,
 * mutta hinta olisi ollut kertaluonteinen migraatio neljälle listalle joissa
 * on käyttäjien omaa dataa. Kilpailun todennäköisyys on kahdella käyttäjällä
 * pieni; migraatiobugin hinta ei ole.
 *
 * Kirjoituslogiikka itse on [ownedStore.ts](src/lib/arxcian/personal/ownedStore.ts):ssä.
 */

/**
 * Ehdollinen kirjoitus Lua-skriptinä.
 *
 * Versioavaimen puuttuminen tarkoittaa versiota 0, ei virhettä: avain syntyy
 * vasta ensimmäisestä kirjoituksesta, ja olemassa oleva data on sitä vanhempaa.
 * Siksi käyttöönotto ei vaadi migraatiota — ensimmäinen kirjoitus vanhaan
 * avaimeen luo version siinä sivussa.
 *
 * Data ja versio kirjoitetaan samassa skriptissä, joten ne eivät voi ajautua
 * erilleen.
 */
const CAS_SCRIPT = `
local nykyinen = redis.call('GET', KEYS[2])
if nykyinen == false then nykyinen = '0' end
if nykyinen ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
redis.call('SET', KEYS[2], tostring(tonumber(ARGV[1]) + 1), 'EX', tonumber(ARGV[3]))
return 1
`

/** Sama kirjekuori kuin cache.ts:llä, jotta tallennettu muoto ei muutu. */
type Envelope<T> = { data: T[]; fetchedAt: number }

/**
 * Varasto yhdelle listalle.
 *
 * `key` on cache.ts:n avain ilman etuliitettä ja **sama kuin ennen**, joten
 * tallennettu muoto säilyy sellaisenaan.
 */
export function createOwnedStore<T extends Owned>(key: string, ttlSeconds: number) {
  const dataKey = `arxcian:${key}`
  const versionKey = `arxcian:${key}:v`
  const expiration = String(Math.ceil(ttlSeconds))

  const backend: StoreBackend<T> = {
    async read() {
      try {
        const [envelope, version] = await Promise.all([
          kv().get<Envelope<T>>(dataKey),
          kv().get<string | number>(versionKey),
        ])
        return {
          items: envelope?.data ?? [],
          version: version === null || version === undefined ? '0' : String(version),
        }
      } catch (e) {
        // Redisin vika ei saa kaataa sivua, ks. cache.ts. Kirjoitus epäonnistuu
        // tämän jälkeen hallitusti — parempi kuin heitto käyttäjän toiminnon
        // keskellä.
        console.error(`[ownedStore] luku epäonnistui: ${key}`, e)
        return { items: [], version: '0' }
      }
    },

    async write(expectedVersion, items) {
      const envelope: Envelope<T> = { data: items, fetchedAt: Date.now() }
      try {
        const ok = await kv().eval(CAS_SCRIPT, [dataKey, versionKey], [
          expectedVersion,
          JSON.stringify(envelope),
          expiration,
        ])
        return ok === 1
      } catch (e) {
        console.error(`[ownedStore] kirjoitus epäonnistui: ${key}`, e)
        return false
      }
    },
  }

  return {
    /** Koko lista ilman näkyvyyssuodatusta — vain palvelimen sisäiseen käyttöön. */
    async all(): Promise<T[]> {
      return (await backend.read()).items
    },

    /** Palauttaa vain käyttäjän näkemät tietueet — suodatus aina palvelinpuolella. */
    async visible(user: SessionUser | null): Promise<T[]> {
      return visibleTo((await backend.read()).items, user)
    },

    /** Atominen muutos. Takaisinkutsu saa sen listan jota vasten kirjoitetaan. */
    async mutate(mutation: Mutation<T>): Promise<T[]> {
      return runMutate(backend, mutation)
    },
  }
}
