import { cache } from 'react'
import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import { readCached, writeCached } from '../../cache'
import { authorizedClient, isConfigured } from './oauth'
import { eventsKey, listAccounts, revokeAccountTokens, setAccountEmail } from './accounts'
import {
  CALENDAR_DISCONNECTED,
  type CalendarAccount,
  type CalendarAccountState,
  type CalendarAccountStatus,
  type CalendarEvent,
  type CalendarStatus,
  type StoredEvent,
} from './types'
import type { UserId } from '@/lib/session'

const TTL_SECONDS = 10 * 60
// Vanhentunutta dataa kelpuutetaan pitkään: verkkovirhe ei saa tyhjentää
// kalenterinäkymää. Valtuutusvirhe käsitellään erikseen alempana.
const STALE_FOR_SECONDS = 24 * 60 * 60

// Vuosinäkymä tarvitsee koko vuoden, joten haetaan kuukausi taakse ja
// 13 kuukautta eteen. Yksi haku kattaa kaikki näkymät.
const MONTHS_BACK = 1
const MONTHS_FORWARD = 13
const MAX_CALENDARS = 10

// Tilikohtainen aikakatkaisu: useamman tilin myötä yksi jumittava tili
// jumittaisi koko sivulatauksen, koska haut tehdään rinnakkain mutta
// odotetaan kaikkia.
const FETCH_TIMEOUT_MS = 12_000

/** Peruutettu tai vanhentunut valtuutus — eri asia kuin verkkovirhe. */
function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: number; status?: number; response?: { status?: number; data?: { error?: string } } }
  if (e.code === 401 || e.status === 401 || e.response?.status === 401) return true
  const inner = e.response?.data?.error
  return inner === 'invalid_grant' || inner === 'unauthorized_client'
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Kalenterihaku aikakatkaistiin (${label}, ${ms} ms)`)), ms)
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

function toEvent(
  raw: {
    id?: string | null
    summary?: string | null
    location?: string | null
    htmlLink?: string | null
    start?: { date?: string | null; dateTime?: string | null } | null
    end?: { date?: string | null; dateTime?: string | null } | null
  },
  calendarName: string | null,
  accountId: string,
): StoredEvent | null {
  const startRaw = raw.start?.dateTime ?? raw.start?.date
  const endRaw = raw.end?.dateTime ?? raw.end?.date
  if (!startRaw) return null

  const allDay = !raw.start?.dateTime
  const start = new Date(startRaw).getTime()
  // Koko päivän tapahtuman loppu on Googlella eksklusiivinen (seuraava
  // keskiyö) — vähennetään minuutti, jotta tapahtuma ei näytä valuvan
  // seuraavalle päivälle näkymissä.
  const end = endRaw ? new Date(endRaw).getTime() - (allDay ? 60_000 : 0) : start

  if (Number.isNaN(start) || Number.isNaN(end)) return null

  return {
    // Tilitunniste etuliitteeksi: sama kokous kahdessa tilissä saa Googlelta
    // saman id:n, jolloin Reactin key-avaimet törmäisivät yhdistetyssä listassa.
    id: `${accountId}:${raw.id ?? `${start}-${raw.summary ?? ''}`}`,
    title: raw.summary?.trim() || '(nimetön)',
    start,
    end,
    allDay,
    location: raw.location?.trim() || null,
    calendarName,
    htmlLink: raw.htmlLink ?? null,
    accountId,
  }
}

async function fetchFromGoogle(
  auth: OAuth2Client,
  accountId: string,
): Promise<{ events: StoredEvent[]; primaryEmail: string | null }> {
  const calendar = google.calendar({ version: 'v3', auth })

  const now = new Date()
  const timeMin = new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK, 1).toISOString()
  const timeMax = new Date(now.getFullYear(), now.getMonth() + MONTHS_FORWARD, 1).toISOString()

  // Haetaan kaikki kalenterit jotka käyttäjä on valinnut näkyviin Googlessa,
  // jotta näkymä vastaa sitä mitä hän itse näkee.
  const list = await calendar.calendarList.list({ maxResults: 50 })
  const items = list.data.items ?? []

  // Primary-kalenterin id on Google Calendarissa tilin sähköpostiosoite.
  // Tämä on ainoa tapa saada osoite migratoidulle tilille, jonka vanha
  // valtuutus kattaa vain calendar.readonlyn.
  const primaryEmail = items.find(c => c.primary)?.id ?? null

  const calendars = items.filter(c => c.id && c.selected !== false).slice(0, MAX_CALENDARS)

  const perCalendar = await Promise.all(
    calendars.map(async cal => {
      try {
        const res = await calendar.events.list({
          calendarId: cal.id!,
          timeMin,
          timeMax,
          // Purkaa toistuvat tapahtumat yksittäisiksi palvelinpuolella —
          // siksi RRULE-jäsennintä ei tarvita lainkaan.
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 2500,
        })
        const name = cal.primary ? null : (cal.summary ?? null)
        return (res.data.items ?? [])
          .map(item => toEvent(item, name, accountId))
          .filter((e): e is StoredEvent => e !== null)
      } catch (error) {
        // Yksittäisen kalenterin virhe ei saa kaataa koko hakua, mutta
        // valtuutusvirhe on nostettava ylös.
        if (isAuthError(error)) throw error
        console.error(`[calendar] kalenterin haku epäonnistui: ${cal.summary}`, error)
        return []
      }
    }),
  )

  return { events: perCalendar.flat(), primaryEmail }
}

type AccountResult = {
  account: CalendarAccount
  events: StoredEvent[]
  state: CalendarAccountState
  fetchedAt: number | null
  stale: boolean
  message: string | null
}

/**
 * Yhden tilin tapahtumat. Ei koskaan heitä: hylätty lupaus kaataisi
 * Promise.allin ja veisi mukanaan myös toimivien tilien tapahtumat.
 *
 * Valtuutusvirheessä poistetaan vain tämän tilin tokenit ja tapahtumat.
 * Tili jää listaan `reauth`-tilaan, jotta käyttäjä näkee kumpi tili pitää
 * liittää uudelleen — yhden tilin aikana tieto oli itsestään selvä, kahden
 * kanssa ei ole.
 */
async function loadAccount(user: UserId, account: CalendarAccount, origin: string): Promise<AccountResult> {
  const base = { account, events: [] as StoredEvent[], fetchedAt: null, stale: false, message: null }

  const authed = await authorizedClient(user, account.id, origin)
  if (!authed) return { ...base, state: 'reauth' }

  const cached = await readCached<StoredEvent[]>(eventsKey(user, account.id))
  if (cached && (Date.now() - cached.fetchedAt) / 1000 < TTL_SECONDS) {
    return { ...base, events: cached.data, state: 'ok', fetchedAt: cached.fetchedAt }
  }

  try {
    const { events, primaryEmail } = await withTimeout(
      fetchFromGoogle(authed.auth, account.id),
      FETCH_TIMEOUT_MS,
      account.email ?? account.id,
    )
    await authed.persistIfRefreshed()
    await writeCached(eventsKey(user, account.id), events, TTL_SECONDS, STALE_FOR_SECONDS)

    // Migraation vaihe 2: täydennetään puuttuva osoite kun se on selvinnyt.
    if (!account.email && primaryEmail) {
      await setAccountEmail(user, account.id, primaryEmail)
      return { ...base, account: { ...account, email: primaryEmail }, events, state: 'ok', fetchedAt: Date.now() }
    }

    return { ...base, events, state: 'ok', fetchedAt: Date.now() }
  } catch (error) {
    if (isAuthError(error)) {
      await revokeAccountTokens(user, account.id)
      return { ...base, state: 'reauth' }
    }
    if (cached) {
      console.error(`[calendar] haku epäonnistui, käytetään vanhentunutta dataa: ${account.id}`, error)
      return { ...base, events: cached.data, state: 'ok', fetchedAt: cached.fetchedAt, stale: true }
    }
    const message = error instanceof Error ? error.message : String(error)
    return { ...base, state: 'error', message }
  }
}

/**
 * Kalenterin tila ja kaikkien liitettyjen tilien tapahtumat yhdistettynä.
 *
 * Ylätason tila johdetaan niin että yhden tilin sovellus käyttäytyy
 * täsmälleen kuten ennen: ainoan tilin peruutettu lupa -> 'disconnected'
 * -> paneeli tarjoaa "Yhdistä Google-kalenteri".
 */
async function loadCalendarStatus(user: UserId, origin: string): Promise<CalendarStatus> {
  if (!isConfigured()) return { state: 'not-configured' }

  const accounts = await listAccounts(user)
  if (accounts.length === 0) return CALENDAR_DISCONNECTED

  const results = await Promise.all(accounts.map(a => loadAccount(user, a, origin)))

  // Tilikohtaiset näyttökentät leimataan vasta tässä, ei hakuvaiheessa:
  // muuten värin tai nimen muutos näkyisi vasta välimuistin vanhennuttua.
  // Väri johdetaan tilin järjestysnumerosta listassa, ei tallennetusta
  // arvosta: ensimmäinen liitetty tili on aina sininen, toinen keltainen.
  const events: CalendarEvent[] = results
    .flatMap((r, i) =>
      r.events.map(e => ({
        ...e,
        accountEmail: r.account.email,
        accountColorIndex: i,
      })),
    )
    .sort((a, b) => a.start - b.start)

  const statuses: CalendarAccountStatus[] = results.map((r, i) => ({
    ...r.account,
    colorIndex: i,
    state: r.state,
    fetchedAt: r.fetchedAt,
    stale: r.stale,
    message: r.message,
    eventCount: r.events.length,
  }))

  if (!results.some(r => r.state === 'ok')) {
    return { state: 'disconnected', accounts: statuses }
  }

  // Vanhin haku voittaa, jotta paneelin kellonaika on rehellinen silloinkin
  // kun yksi tili palvelee vanhentunutta dataa.
  const times = results.map(r => r.fetchedAt).filter((t): t is number => t !== null)

  return {
    state: 'connected',
    events,
    fetchedAt: times.length > 0 ? Math.min(...times) : Date.now(),
    accounts: statuses,
  }
}

/**
 * Hub-etusivu kutsuu tätä kahdesti samalla renderöinnillä (DailyFocus ja
 * UpcomingEvents). Reactin cache muistaa tuloksen pyynnön ajaksi, joten
 * Redis-luvut ja mahdollinen Google-haku tehdään kerran eikä kahdesti —
 * useamman tilin myötä ero olisi moninkertainen.
 */
export const getCalendarStatus = cache(loadCalendarStatus)

/** Seuraavat tapahtumat hub-etusivun paneeliin. */
export function upcomingEvents(events: CalendarEvent[], limit = 5): CalendarEvent[] {
  const now = Date.now()
  return events.filter(e => e.end >= now).slice(0, limit)
}
