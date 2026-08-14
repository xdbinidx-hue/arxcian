import { readCached, writeCached } from '../cache'
import { canView, visibleTo, type Owner, type SessionUser } from '@/lib/session'
import { DEFAULT_NOTIFY_SETTINGS, type NotifySettings, type TradingTime } from './types'

/**
 * Ilmoitusasetusten ja omien treidausaikojen tallennus.
 *
 * Tämä on ainoa moduuli tässä ominaisuudessa joka koskee KV:tä; laskenta on
 * puhtaassa [marketEvents.ts](./marketEvents.ts):ssä. Jako on sama kuin
 * muualla arxcianissa ja tässä erityisen tarpeellinen, koska ajastin ajaa
 * laskennan selaimessa.
 *
 * **Asetukset eivät ole selaimen localStoragessa.** Albin ja Arbnor voivat
 * käyttää samaa laitetta, ja selaimeen tallennettu asetus tarkoittaisi että
 * toisen killzone-ajat hälyttäisivät toiselle. Sama syy miksi service worker
 * ei välimuistita HTML:ää.
 */

const SETTINGS_TTL = 5 * 365 * 24 * 60 * 60 // "pysyvä" — asetus ei saa vanhentua alta
const TIMES_KEY = 'trading:times'
const TIMES_TTL = SETTINGS_TTL
const MAX_TIMES = 50

function settingsKey(user: SessionUser): string {
  return `trading:notify:${user}`
}

export async function getNotifySettings(user: SessionUser): Promise<NotifySettings> {
  const cached = await readCached<Partial<NotifySettings>>(settingsKey(user))
  // Levitys oletusten päälle eikä sellaisenaan: uusi kenttä saa oletusarvonsa
  // myös käyttäjälle joka on tallentanut asetukset ennen kentän lisäämistä.
  return { ...DEFAULT_NOTIFY_SETTINGS, ...(cached?.data ?? {}) }
}

export async function saveNotifySettings(
  user: SessionUser,
  patch: Partial<NotifySettings>,
): Promise<NotifySettings> {
  const current = await getNotifySettings(user)
  const updated: NotifySettings = {
    ...current,
    ...patch,
    // Ennakko rajataan tässä eikä käyttöliittymässä: rajapinta on avoin myös
    // suoralle kutsulle, ja negatiivinen ennakko siirtäisi ilmoituksen
    // tapahtuman jälkeen ilman että sitä huomaisi mistään.
    leadMinutes: Math.min(120, Math.max(0, Math.round(patch.leadMinutes ?? current.leadMinutes))),
  }
  await writeCached(settingsKey(user), updated, SETTINGS_TTL, 0)
  return updated
}

async function getAllTimes(): Promise<TradingTime[]> {
  const cached = await readCached<TradingTime[]>(TIMES_KEY)
  return cached?.data ?? []
}

async function saveAllTimes(times: TradingTime[]): Promise<void> {
  await writeCached(TIMES_KEY, times, TIMES_TTL, 0)
}

/** Vain käyttäjän näkemät ajat — suodatus aina palvelinpuolella. */
export async function getTradingTimes(user: SessionUser | null): Promise<TradingTime[]> {
  return visibleTo(await getAllTimes(), user)
}

export async function addTradingTime(
  input: {
    owner: Owner
    label: string
    zone: string
    minutes: number
    days: number[]
    leadMinutes: number
  },
  user: SessionUser,
): Promise<TradingTime[]> {
  const time: TradingTime = {
    id: crypto.randomUUID(),
    owner: input.owner,
    label: input.label.slice(0, 60),
    zone: input.zone,
    minutes: Math.min(24 * 60 - 1, Math.max(0, Math.round(input.minutes))),
    // Uniikit ja järjestyksessä: sama päivä kahdesti tuottaisi kaksi ilmoitusta
    // samasta hetkestä, ja niillä olisi sama dedupe-avain — toinen katoaisi
    // hiljaa, mikä olisi oikea lopputulos väärästä syystä.
    days: Array.from(new Set(input.days.filter(d => d >= 1 && d <= 7))).sort(),
    leadMinutes: Math.min(120, Math.max(0, Math.round(input.leadMinutes))),
    enabled: true,
    createdAt: Date.now(),
    createdBy: user,
  }

  const all = [time, ...(await getAllTimes())].slice(0, MAX_TIMES)
  await saveAllTimes(all)
  return visibleTo(all, user)
}

// Muutokset tarkistavat omistajuuden: pelkkä id ei riitä, muuten kirjautunut
// käyttäjä voisi arvata toisen käyttäjän tietueen tunnisteen ja muokata sitä.
export async function toggleTradingTime(
  id: string,
  user: SessionUser,
): Promise<TradingTime[]> {
  const all = await getAllTimes()
  const target = all.find(t => t.id === id)
  if (!target || !canView(target.owner, user)) return visibleTo(all, user)

  const updated = all.map(t => (t.id === id ? { ...t, enabled: !t.enabled } : t))
  await saveAllTimes(updated)
  return visibleTo(updated, user)
}

export async function removeTradingTime(id: string, user: SessionUser): Promise<TradingTime[]> {
  const all = await getAllTimes()
  const target = all.find(t => t.id === id)
  if (!target || !canView(target.owner, user)) return visibleTo(all, user)

  const updated = all.filter(t => t.id !== id)
  await saveAllTimes(updated)
  return visibleTo(updated, user)
}
