/**
 * Aikajana ilmoitettavista markkinatapahtumista: istuntojen avaukset ja
 * sulkeutumiset sekä käyttäjän omat treidausajat samassa muodossa.
 *
 * **Miksi yksi yhteinen tyyppi.** Ilmoituksen antaja ei saa tietää eroa
 * istunnon avauksen ja oman killzone-ajan välillä, muuten kaksi
 * ilmoituspolkua ajautuisi erilleen: toinen dedupetaan, toinen ei, toinen
 * soittaa äänen, toinen unohtaa. Erot kuuluvat tähän moduuliin ja loppuvat
 * tähän.
 *
 * Moduuli on puhdas ja selainturvallinen — ei verkkoa, ei välimuistia. Sama
 * laskenta ajetaan sekä palvelimella (näkymän ensimmäinen renderöinti) että
 * selaimessa (minuuttitikitys), joten epäpuhtaus näkyisi hydraatiovirheenä.
 */

import { addDays, isoWeekday, localDay, wallClockToInstant } from '../zoneTime'
import { SESSIONS, sessionWindows } from './sessions'
import type { NotifySettings, TradingTime } from './types'

export type MarketEventKind = 'session-open' | 'session-close' | 'trading-time'

export type MarketEvent = {
  /**
   * Vakaa tunniste, joka sisältää tapahtuman absoluuttisen hetken. Sama
   * tapahtuma saa saman avaimen joka laskennalla riippumatta siitä milloin
   * laskenta ajetaan, mutta eri päivien avaukset saavat eri avaimen — juuri
   * se mitä kaksoisilmoituksen esto tarvitsee.
   */
  key: string
  kind: MarketEventKind
  /** SessionId tai treidausajan id. */
  sourceId: string
  title: string
  body: string
  /** Hetki jolloin tapahtuma tapahtuu. */
  at: number
  /** Hetki jolloin ilmoitus annetaan: `at` miinus ennakko. */
  notifyAt: number
}

// Helsinkiin sidottu, ei selaimen vyöhykkeeseen: sama teksti palvelimella ja
// selaimessa, ja Albin katsoo kelloa Suomen ajassa vaikka istunto on Tokion.
const helsinkiClock = new Intl.DateTimeFormat('fi-FI', {
  timeZone: 'Europe/Helsinki',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Kuinka pitkälle taaksepäin ja eteenpäin aikajana lasketaan.
 *
 * Taaksepäin riittää vähän: mennyttä tapahtumaa tarvitaan vain sen
 * toteamiseen että se on jo mennyt. Eteenpäin viisi vuorokautta, koska
 * perjantai-illasta katsottuna seuraava avaus on vasta maanantaina.
 */
const PAST_MS = 6 * 60 * 60 * 1000
const FUTURE_MS = 5 * 24 * 60 * 60 * 1000

function lead(minutes: number, text: string): string {
  return minutes > 0 ? `${text} ${minutes} min kuluttua` : text
}

function sessionEvents(now: number, settings: NotifySettings): MarketEvent[] {
  const events: MarketEvent[] = []
  const leadMs = Math.max(0, settings.leadMinutes) * 60_000

  for (const session of SESSIONS) {
    if (!settings.sessions.includes(session.id)) continue

    for (const window of sessionWindows(session, now)) {
      const range = `${helsinkiClock.format(window.open)}–${helsinkiClock.format(window.close)}`

      if (settings.sessionOpen) {
        events.push({
          key: `session-open:${session.id}:${window.open}`,
          kind: 'session-open',
          sourceId: session.id,
          title: lead(settings.leadMinutes, `${session.label} avautuu`),
          body: `Forex-istunto ${range} Suomen aikaa`,
          at: window.open,
          notifyAt: window.open - leadMs,
        })
      }

      if (settings.sessionClose) {
        events.push({
          key: `session-close:${session.id}:${window.close}`,
          kind: 'session-close',
          sourceId: session.id,
          title: lead(settings.leadMinutes, `${session.label} sulkeutuu`),
          body: `Forex-istunto ${range} Suomen aikaa`,
          at: window.close,
          notifyAt: window.close - leadMs,
        })
      }
    }
  }

  return events
}

/**
 * Yhden treidausajan esiintymät ikkunassa.
 *
 * Päiväväli on sama kuin istunnoilla eikä laskettu ennakosta: ennakko voi olla
 * pitkäkin (esim. 60 min ennen Tokion avausta), jolloin ilmoitushetki putoaa
 * edelliselle paikalliselle päivälle. Yhden päivän marginaali molempiin
 * suuntiin kattaa sen ilman erikoistapausta.
 */
export function tradingTimeOccurrences(time: TradingTime, now: number): number[] {
  if (!time.enabled || time.days.length === 0) return []

  const today = localDay(time.zone, now)
  const result: number[] = []

  for (let offset = -1; offset <= 6; offset++) {
    const day = addDays(today, offset)
    if (!time.days.includes(isoWeekday(day))) continue
    result.push(wallClockToInstant(time.zone, day, time.minutes))
  }

  return result.sort((a, b) => a - b)
}

function tradingTimeEvents(now: number, times: TradingTime[]): MarketEvent[] {
  const events: MarketEvent[] = []

  for (const time of times) {
    const leadMs = Math.max(0, time.leadMinutes) * 60_000

    for (const at of tradingTimeOccurrences(time, now)) {
      events.push({
        key: `trading-time:${time.id}:${at}`,
        kind: 'trading-time',
        sourceId: time.id,
        title: lead(time.leadMinutes, time.label),
        body: `Oma treidausaika · ${helsinkiClock.format(at)} Suomen aikaa`,
        at,
        notifyAt: at - leadMs,
      })
    }
  }

  return events
}

/**
 * Kaikki ilmoitettavat tapahtumat ikkunassa, ilmoitushetken mukaan
 * järjestettynä.
 *
 * Suodatus tehdään `notifyAt`in eikä `at`in mukaan: 60 minuutin ennakolla
 * ilmoitettava tapahtuma on ajankohtainen tuntia aiemmin, ja `at`in mukaan
 * rajattu ikkuna pudottaisi sen juuri silloin kun se pitäisi antaa.
 */
export function marketEvents(
  now: number,
  settings: NotifySettings,
  times: TradingTime[],
): MarketEvent[] {
  const from = now - PAST_MS
  const to = now + FUTURE_MS

  return [...sessionEvents(now, settings), ...tradingTimeEvents(now, times)]
    .filter(e => e.notifyAt >= from && e.notifyAt <= to)
    .sort((a, b) => a.notifyAt - b.notifyAt)
}

/** Seuraavat tulevat tapahtumat, esim. hubin paneelin "seuraavaksi"-rivi. */
export function upcomingEvents(events: MarketEvent[], now: number, count = 3): MarketEvent[] {
  return events.filter(e => e.at > now).slice(0, count)
}
