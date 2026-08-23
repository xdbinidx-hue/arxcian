import { kv } from '../kv'
import { visibleTo, type SessionUser } from '@/lib/session'
import { runMutate, type Mutation, type Owned, type StoreBackend, type WriteOutcome } from './ownedStore'

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
 * Ehdollinen kirjoitus Lua-skriptinä. Varmistettu oikeaa Upstash-instanssia
 * vasten 23.8.2026: puuttuva versio kelpaa nollaksi, vanhentunut versio
 * hylätään, TTL asettuu.
 *
 * Versioavaimen puuttuminen tarkoittaa versiota 0, ei virhettä: avain syntyy
 * vasta ensimmäisestä kirjoituksesta, ja olemassa oleva data on sitä vanhempaa.
 * Siksi käyttöönotto ei vaadi migraatiota.
 *
 * Data ja versio kirjoitetaan samassa skriptissä samalla `EX`:llä, joten ne
 * eivät voi ajautua erilleen.
 *
 * Paluuarvo `-1` tarkoittaa kelvotonta versioarvoa. Se on eri asia kuin
 * törmäys: törmäystä yritetään uudelleen, mutta ei-numeerinen versioavain ei
 * korjaannu yrittämällä, ja hiljainen uudelleenyritys jättäisi listan
 * pysyvästi kirjoitussuojatuksi ilman selitystä.
 */
const CAS_SCRIPT = `
local nykyinen = redis.call('GET', KEYS[2])
if nykyinen == false then nykyinen = '0' end
if nykyinen ~= ARGV[1] then return 0 end
local seuraava = tonumber(ARGV[1])
if seuraava == nil then return -1 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
redis.call('SET', KEYS[2], tostring(seuraava + 1), 'EX', tonumber(ARGV[3]))
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

  /** Pelkkä data, yksi kierros. Renderöinti ei tarvitse versiota. */
  async function readItems(): Promise<T[]> {
    return (await kv().get<Envelope<T>>(dataKey))?.data ?? []
  }

  const backend: StoreBackend<T> = {
    /**
     * **Heittää jos luku epäonnistuu.** Tyhjä lista ei saa tarkoittaa "Redis
     * ei vastannut": jos verkkopiikin jälkeen kirjoitettaisiin tyhjää listaa
     * vasten, ensimmäinen kirjoitus versioavaimen syntyä ennen korvaisi koko
     * olemassa olevan listan yhdellä rivillä.
     */
    async read() {
      const [envelope, version] = await Promise.all([
        kv().get<Envelope<T>>(dataKey),
        kv().get<string | number>(versionKey),
      ])
      return {
        items: envelope?.data ?? [],
        version: version === null || version === undefined ? '0' : String(version),
      }
    },

    async write(expectedVersion, items): Promise<WriteOutcome> {
      const envelope: Envelope<T> = { data: items, fetchedAt: Date.now() }
      try {
        const tulos = await kv().eval(CAS_SCRIPT, [dataKey, versionKey], [
          expectedVersion,
          JSON.stringify(envelope),
          expiration,
        ])
        if (tulos === 1) return 'ok'
        if (tulos === 0) return 'conflict'
        console.error(`[ownedStore] kelvoton versioarvo avaimessa ${versionKey}`)
        return 'error'
      } catch (e) {
        console.error(`[ownedStore] kirjoitus epäonnistui: ${key}`, e)
        return 'error'
      }
    },
  }

  return {
    /**
     * Palauttaa vain käyttäjän näkemät tietueet — suodatus aina palvelinpuolella.
     *
     * Lukupolku on tarkoituksella salliva: Redisin katkos ei saa kaataa
     * sivunlatausta (ks. cache.ts). Kirjoituspolku on päinvastainen — siellä
     * sama vaikeneminen hukkaisi dataa.
     */
    async visible(user: SessionUser | null): Promise<T[]> {
      try {
        return visibleTo(await readItems(), user)
      } catch (e) {
        console.error(`[ownedStore] luku epäonnistui: ${key}`, e)
        return []
      }
    },

    /** Atominen muutos. Heittää `StoreWriteError`in jos kirjoitus ei mene läpi. */
    async mutate(mutation: Mutation<T>): Promise<T[]> {
      return runMutate(key, backend, mutation)
    },
  }
}
