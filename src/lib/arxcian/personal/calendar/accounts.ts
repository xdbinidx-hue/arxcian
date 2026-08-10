import type { Credentials } from 'google-auth-library'
import { readCached, writeCached, invalidate } from '../../cache'
import type { CalendarAccount } from './types'
import type { UserId } from '@/lib/session'

/**
 * Liitettyjen Google-tilien hallinta. Yksi käyttäjä voi liittää useita
 * tilejä (henkilökohtainen + työ).
 *
 * Tallennus on jaettu kahteen avaimeen tarkoituksella:
 *
 *   calendar:accounts:<user>            -> CalendarAccount[]  (ei tokeneita)
 *   calendar:tokens:<user>:<accountId>  -> Credentials
 *
 * Yksi taulukko jossa tokenit olisivat mukana ei kelpaa, koska access-token
 * uusiutuu haun yhteydessä jokaiselle tilille rinnakkain: kaksi yhtaikaista
 * luku-muokkaa-kirjoita -kierrosta samaan taulukkoon hukkaisi toisen tilin
 * uuden tokenin. Tilikohtaisella avaimella kirjoitus koskee vain omaa
 * avaintaan eikä kilpailua synny. Samalla indeksi pysyy token-vapaana, joten
 * sen voi turvallisesti serialisoida selaimeen asti.
 *
 * Indeksin luku-muokkaa-kirjoita jää lisäykseen ja poistoon, jotka ovat
 * käyttäjän omia sarjallisia toimintoja — ei rinnakkaisia taustahakuja.
 */

const TTL_SECONDS = 5 * 365 * 24 * 60 * 60

/** Migratoidun, vanhasta yhden tilin mallista siirretyn tilin tunniste. */
export const LEGACY_ACCOUNT_ID = 'legacy'

function indexKey(user: UserId): string {
  return `calendar:accounts:${user}`
}

function tokenKey(user: UserId, accountId: string): string {
  return `calendar:tokens:${user}:${accountId}`
}

export function eventsKey(user: UserId, accountId: string): string {
  return `calendar:events:${user}:${accountId}`
}

/** Vanhan yhden tilin mallin avaimet, vain migraatiota varten. */
function legacyTokenKey(user: UserId): string {
  return `calendar:tokens:${user}`
}

function legacyEventsKey(user: UserId): string {
  return `calendar:events:${user}`
}

/** null = avainta ei ole (tai Redis ei vastannut). Tyhjä taulukko on eri
 *  asia: se tarkoittaa että käyttäjä on tarkoituksella katkaissut kaikki. */
async function readIndex(user: UserId): Promise<CalendarAccount[] | null> {
  const cached = await readCached<CalendarAccount[]>(indexKey(user))
  return cached?.data ?? null
}

async function writeIndex(user: UserId, accounts: CalendarAccount[]): Promise<void> {
  await writeCached(indexKey(user), accounts, TTL_SECONDS, 0)
}

/**
 * Siirtää vanhan yhden tilin liitoksen uuteen malliin. Ajetaan laiskasti
 * ensimmäisellä luvulla, ei erillisenä skriptinä — käyttäjiä on kaksi.
 *
 * Sähköpostia ei tässä vaiheessa tiedetä: vanha valtuutus on myönnetty vain
 * calendar.readonly-scopella, joten userinfo-kutsu ei toimisi. Osoite
 * täytetään ensimmäisen onnistuneen haun yhteydessä primary-kalenterin
 * id:stä (events.ts), joka on Google Calendarissa tilin sähköpostiosoite.
 *
 * Idempotentti: indeksin olemassaolo on ainoa merkkilippu, joten migraatio
 * ei käynnisty toista kertaa.
 */
async function migrateLegacyAccount(user: UserId): Promise<CalendarAccount[] | null> {
  const legacy = await readCached<Credentials>(legacyTokenKey(user))

  // Tärkein suoja koko migraatiossa: cache.ts nielee Redis-virheen ja
  // palauttaa null, joten hetkellinen katko näyttää samalta kuin "ei vanhaa
  // tiliä". Jos silloin kirjoitettaisiin tyhjä indeksi, tila merkittäisiin
  // migratoiduksi ja käyttäjän ainoa liitos orpoutuisi pysyvästi.
  if (!legacy?.data) return null

  const account: CalendarAccount = {
    id: LEGACY_ACCOUNT_ID,
    email: null,
    label: null,
    addedAt: legacy.fetchedAt,
    migratedFrom: 'v1',
  }

  // Järjestys on olennainen: tokenit ja indeksi ensin, vanhan avaimen poisto
  // vasta sen jälkeen. Jos poisto epäonnistuu, indeksi on jo olemassa eikä
  // migraatio käynnisty uudelleen — vanha avain vanhenee itsekseen.
  await writeCached(tokenKey(user, LEGACY_ACCOUNT_ID), legacy.data, TTL_SECONDS, 0)
  await writeIndex(user, [account])
  await invalidate(legacyEventsKey(user))
  await invalidate(legacyTokenKey(user))

  return [account]
}

/** Käyttäjän liitetyt tilit. Ajaa migraation tarvittaessa. */
export async function listAccounts(user: UserId): Promise<CalendarAccount[]> {
  const existing = await readIndex(user)
  if (existing) return existing
  return (await migrateLegacyAccount(user)) ?? []
}

export async function getAccountTokens(user: UserId, accountId: string): Promise<Credentials | null> {
  const cached = await readCached<Credentials>(tokenKey(user, accountId))
  return cached?.data ?? null
}

export async function storeAccountTokens(
  user: UserId,
  accountId: string,
  tokens: Credentials,
): Promise<void> {
  await writeCached(tokenKey(user, accountId), tokens, TTL_SECONDS, 0)
}

/**
 * Lisää tilin tai päivittää olemassa olevan tokenit.
 *
 * Kaksi erikoistapausta:
 *  - sama tili liitetään uudelleen -> päivitetään tokenit, ei uutta riviä
 *  - migratoitu 'legacy' saa vihdoin oikean tunnisteen -> korvataan rivi
 *    väri säilyttäen ja vanhat avaimet siivotaan, muuten sama kalenteri
 *    näkyisi kahtena tilinä
 */
export async function addAccount(
  user: UserId,
  account: { id: string; email: string | null },
  tokens: Credentials,
): Promise<CalendarAccount> {
  const accounts = await listAccounts(user)

  const byId = accounts.find(a => a.id === account.id)
  if (byId) {
    const updated: CalendarAccount = { ...byId, email: account.email ?? byId.email }
    await storeAccountTokens(user, account.id, tokens)
    await writeIndex(user, accounts.map(a => (a.id === account.id ? updated : a)))
    return updated
  }

  const legacy = accounts.find(
    a => a.id === LEGACY_ACCOUNT_ID && (a.email === null || a.email === account.email),
  )
  if (legacy) {
    const replaced: CalendarAccount = {
      id: account.id,
      email: account.email,
      label: legacy.label,
      addedAt: legacy.addedAt,
    }
    await storeAccountTokens(user, account.id, tokens)
    await writeIndex(user, accounts.map(a => (a.id === LEGACY_ACCOUNT_ID ? replaced : a)))
    await invalidate(tokenKey(user, LEGACY_ACCOUNT_ID))
    await invalidate(eventsKey(user, LEGACY_ACCOUNT_ID))
    return replaced
  }

  // Uusi tili loppuun: väri johdetaan järjestyksestä, joten lisäysjärjestys
  // määrää värin ja pysyy samana latauksesta toiseen.
  const added: CalendarAccount = {
    id: account.id,
    email: account.email,
    label: null,
    addedAt: Date.now(),
  }
  await storeAccountTokens(user, account.id, tokens)
  await writeIndex(user, [...accounts, added])
  return added
}

/** Poistaa yhden tilin. Tyhjä indeksi kirjoitetaan tarkoituksella talteen —
 *  jos avain poistettaisiin, migraatio herättäisi vanhan liitoksen henkiin. */
export async function removeAccount(user: UserId, accountId: string): Promise<CalendarAccount[]> {
  const accounts = await listAccounts(user)
  const remaining = accounts.filter(a => a.id !== accountId)

  await writeIndex(user, remaining)
  await invalidate(tokenKey(user, accountId))
  await invalidate(eventsKey(user, accountId))
  return remaining
}

/** Katkaisee kaikki tilit. Vastaa vanhaa "Katkaise"-toimintoa. */
export async function removeAllAccounts(user: UserId): Promise<void> {
  const accounts = await listAccounts(user)

  await writeIndex(user, [])
  for (const account of accounts) {
    await invalidate(tokenKey(user, account.id))
    await invalidate(eventsKey(user, account.id))
  }
}

/** Poistaa vain tokenit ja tapahtumat: tili jää listaan, jotta käyttäjä
 *  näkee kumpi tili pitää liittää uudelleen. */
export async function revokeAccountTokens(user: UserId, accountId: string): Promise<void> {
  await invalidate(tokenKey(user, accountId))
  await invalidate(eventsKey(user, accountId))
}

/** Migraation vaihe 2: täydentää puuttuvan sähköpostin kun se on selvinnyt
 *  primary-kalenterista. Kirjoitetaan vain kerran, ei jokaisella haulla. */
export async function setAccountEmail(user: UserId, accountId: string, email: string): Promise<void> {
  const accounts = await listAccounts(user)
  const target = accounts.find(a => a.id === accountId)
  if (!target || target.email) return

  await writeIndex(user, accounts.map(a => (a.id === accountId ? { ...a, email } : a)))
}
