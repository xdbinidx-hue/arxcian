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
import type { CalendarEvent, NotifySettings, TradingTime } from './types'

export type MarketEventKind =
  | 'session-open'
  | 'session-close'
  | 'trading-time'
  | 'calendar-release'

export type MarketEvent = {
  /**
   * Vakaa tunniste, joka sisältää tapahtuman absoluuttisen hetken. Sama
   * tapahtuma saa saman avaimen joka laskennalla riippumatta siitä milloin
   * laskenta ajetaan, mutta eri päivien avaukset saavat eri avaimen — juuri
   * se mitä kaksoisilmoituksen esto tarvitsee.
   */
  key: string
  kind: MarketEventKind
  /** SessionId, treidausajan id tai kalenteritapahtuman valuutta. */
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

/**
 * Ennakko talouskalenterin julkaisuille, kiinteänä eikä asetuksena.
 *
 * Julkaisu on hetki eikä ikkuna: CPI tulee kello 15.30 ja markkina liikkuu
 * sekunneissa, joten ainoa mielekäs kysymys on "ehdinkö koneelle". Vartti
 * riittää siihen. Istuntojen `leadMinutes` on eri asia — siinä säädetään
 * kuinka aikaisin haluaa valmistautua vaihtoon, ja saman säätimen käyttäminen
 * molempiin sitoisi kaksi eri tarvetta yhteen lukuun.
 */
const CALENDAR_LEAD_MINUTES = 15

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
 * Talouskalenterin punaiset julkaisut ilmoitettavina tapahtumina.
 *
 * **Vain valitut valuutat.** Rajaus on ennen kaikkea ajallinen: AUD:n ja JPY:n
 * julkaisut osuvat Suomen yöhön, joten rajaamaton lista herättäisi useita
 * kertoja viikossa. Tyhjä lista tarkoittaa "ei yhtään" eikä "kaikki" — muuten
 * valuuttojen poistaminen yksi kerrallaan kääntyisi viimeisellä poistolla
 * päinvastaiseksi.
 *
 * **Vain tulevat.** Istuntotapahtumissa mennyt hetki on hyödyllinen (aikajana
 * näyttää missä ollaan), mutta jo julkaistu luku ei ole ilmoitus vaan uutinen
 * — ja ForexFactoryn syötteessä ei ole `actual`-kenttää, joten emme edes
 * tiedä mikä luvuksi tuli. Ilmoitus menneestä julkaisusta kertoisi vain että
 * jokin tapahtui, ei mitä.
 *
 * Avain sisältää tapahtuman hetken kuten muillakin, joten sama julkaisu saa
 * saman avaimen joka laskennalla. Otsikko normalisoidaan, koska se päätyy
 * sekä planned-kartan avaimeksi että ilmoituksen tagiksi.
 */
function calendarEvents(
  now: number,
  settings: NotifySettings,
  calendar: CalendarEvent[],
): MarketEvent[] {
  if (!settings.calendarHigh || settings.calendarCurrencies.length === 0) return []

  const leadMs = CALENDAR_LEAD_MINUTES * 60_000
  const valuutat = new Set(settings.calendarCurrencies)

  return calendar
    .filter(e => e.impact === 'High' && e.time > now && valuutat.has(e.currency))
    .map(e => ({
      key: `calendar-release:${e.currency}-${slug(e.title)}:${e.time}`,
      kind: 'calendar-release' as const,
      sourceId: e.currency,
      title: lead(CALENDAR_LEAD_MINUTES, `${e.currency} ${e.title}`),
      body: julkaisunKuvaus(e),
      at: e.time,
      notifyAt: e.time - leadMs,
    }))
}

/** Otsikko avaimeen kelpaavaksi: pieni kirjain, vain kirjaimet ja numerot. */
function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Ennuste ja edellinen jos lähde antaa ne.
 *
 * Kumpikin voi olla tyhjä — syöte ei lupaa niitä — ja tyhjä kenttä
 * näytettäisiin muuten muodossa "ennuste  · edellinen ", mikä näyttää
 * rikkinäiseltä eikä puuttuvalta.
 *
 * **Jonotetussa pushissa luku jäätyy jonotushetkeen.** Runko lähtee QStashiin
 * jopa 48 h etukäteen, ja ForexFactory päivittää ennusteita neljästi
 * vuorokaudessa. Vaihtoehto olisi laittaa ennuste avaimeen, jolloin jokainen
 * ennusteen muutos peruisi ja jonottaisi viestin uudelleen — avaimen vakaus
 * on tärkeämpi kuin rungon tuoreus. Sovelluksen sisäinen banneri laskee
 * tekstin tikityksessä eikä kärsi tästä.
 */
function julkaisunKuvaus(event: CalendarEvent): string {
  const osat = ['Talouskalenteri · korkea vaikutus']
  if (event.forecast) osat.push(`ennuste ${event.forecast}`)
  if (event.previous) osat.push(`edellinen ${event.previous}`)
  return osat.join(' · ')
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
  calendar: CalendarEvent[] = [],
): MarketEvent[] {
  const from = now - PAST_MS
  const to = now + FUTURE_MS

  // Kalenteri annetaan parametrina eikä haeta täältä: tämä moduuli on puhdas
  // ja ajetaan myös selaimessa minuuttitikityksessä. Haku tekisi siitä
  // verkkoriippuvaisen ja rikkoisi palvelimen ja selaimen saman tuloksen.
  return [
    ...sessionEvents(now, settings),
    ...tradingTimeEvents(now, times),
    ...calendarEvents(now, settings, calendar),
  ]
    .filter(e => e.notifyAt >= from && e.notifyAt <= to)
    .sort((a, b) => a.notifyAt - b.notifyAt)
}

/** Seuraavat tulevat tapahtumat, esim. hubin paneelin "seuraavaksi"-rivi. */
export function upcomingEvents(events: MarketEvent[], now: number, count = 3): MarketEvent[] {
  return events.filter(e => e.at > now).slice(0, count)
}
