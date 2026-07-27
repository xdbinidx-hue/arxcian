import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import { readCached, writeCached, invalidate } from '../../cache'
import { authorizedClient, clearTokens, isConfigured } from './oauth'
import type { CalendarEvent, CalendarStatus } from './types'
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

function cacheKey(user: UserId): string {
  return `calendar:events:${user}`
}

/** Peruutettu tai vanhentunut valtuutus — eri asia kuin verkkovirhe. */
function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: number; status?: number; response?: { status?: number; data?: { error?: string } } }
  if (e.code === 401 || e.status === 401 || e.response?.status === 401) return true
  const inner = e.response?.data?.error
  return inner === 'invalid_grant' || inner === 'unauthorized_client'
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
): CalendarEvent | null {
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
    id: raw.id ?? `${start}-${raw.summary ?? ''}`,
    title: raw.summary?.trim() || '(nimetön)',
    start,
    end,
    allDay,
    location: raw.location?.trim() || null,
    calendarName,
    htmlLink: raw.htmlLink ?? null,
  }
}

async function fetchFromGoogle(auth: OAuth2Client): Promise<CalendarEvent[]> {
  const calendar = google.calendar({ version: 'v3', auth })

  const now = new Date()
  const timeMin = new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK, 1).toISOString()
  const timeMax = new Date(now.getFullYear(), now.getMonth() + MONTHS_FORWARD, 1).toISOString()

  // Haetaan kaikki kalenterit jotka käyttäjä on valinnut näkyviin Googlessa,
  // jotta näkymä vastaa sitä mitä hän itse näkee.
  const list = await calendar.calendarList.list({ maxResults: 50 })
  const calendars = (list.data.items ?? [])
    .filter(c => c.id && c.selected !== false)
    .slice(0, MAX_CALENDARS)

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
          .map(item => toEvent(item, name))
          .filter((e): e is CalendarEvent => e !== null)
      } catch (error) {
        // Yksittäisen kalenterin virhe ei saa kaataa koko hakua, mutta
        // valtuutusvirhe on nostettava ylös.
        if (isAuthError(error)) throw error
        console.error(`[calendar] kalenterin haku epäonnistui: ${cal.summary}`, error)
        return []
      }
    }),
  )

  return perCalendar.flat().sort((a, b) => a.start - b.start)
}

/**
 * Kalenterin tila ja tapahtumat. Verkkovirheessä palautetaan vanhentunut
 * data (sama periaate kuin muualla), mutta valtuutusvirheessä tokenit
 * poistetaan ja tila palautuu "ei yhdistetty" — muuten peruutettu lupa
 * näyttäisi vanhoja tapahtumia loputtomiin.
 */
export async function getCalendarStatus(user: UserId, origin: string): Promise<CalendarStatus> {
  if (!isConfigured()) return { state: 'not-configured' }

  const authed = await authorizedClient(user, origin)
  if (!authed) return { state: 'disconnected' }

  const cached = await readCached<CalendarEvent[]>(cacheKey(user))
  if (cached && (Date.now() - cached.fetchedAt) / 1000 < TTL_SECONDS) {
    return { state: 'connected', events: cached.data, fetchedAt: cached.fetchedAt }
  }

  try {
    const events = await fetchFromGoogle(authed.auth)
    await authed.persistIfRefreshed()
    await writeCached(cacheKey(user), events, TTL_SECONDS, STALE_FOR_SECONDS)
    return { state: 'connected', events, fetchedAt: Date.now() }
  } catch (error) {
    if (isAuthError(error)) {
      await clearTokens(user)
      await invalidate(cacheKey(user))
      return { state: 'disconnected' }
    }
    if (cached) {
      console.error('[calendar] haku epäonnistui, käytetään vanhentunutta dataa', error)
      return { state: 'connected', events: cached.data, fetchedAt: cached.fetchedAt }
    }
    const message = error instanceof Error ? error.message : String(error)
    return { state: 'error', message }
  }
}

/** Seuraavat tapahtumat hub-etusivun paneeliin. */
export function upcomingEvents(events: CalendarEvent[], limit = 5): CalendarEvent[] {
  const now = Date.now()
  return events.filter(e => e.end >= now).slice(0, limit)
}
