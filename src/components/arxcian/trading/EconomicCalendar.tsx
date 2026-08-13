'use client'

import { useEffect, useState } from 'react'
import type { CalendarEvent } from '@/lib/arxcian/trading/types'
import { countdown } from '@/lib/arxcian/time'
import { Panel } from '@/components/arxcian/Panel'

type Props = {
  /** Jo suodatetut punaiset tapahtumat hälytysikkunassa, aikajärjestyksessä. */
  events: CalendarEvent[]
  /**
   * Palvelimen kello renderöintihetkellä. Propsina eikä `Date.now()`illa,
   * jotta ensimmäinen selainrenderöinti on identtinen palvelimen kanssa —
   * muuten lähtölaskenta rikkoisi hydraation. Selain jatkaa omalla kellollaan
   * vasta ensimmäisestä tikistä.
   */
  now: number
  /** Milloin kalenteri viimeksi haettiin lähteestä, tai null jos ei kertaakaan. */
  fetchedAt: number | null
}

const TIME_ZONE = 'Europe/Helsinki'

/**
 * Tätä lähempänä oleva tapahtuma näytetään korostettuna ja lähtölaskentana.
 *
 * Vakio on täällä eikä calendar.ts:ssä tarkoituksella: se on esityksen raja,
 * ja calendar.ts vetäisi importtina `@vercel/kv`:n selainniputukseen.
 * Suodatusraja (`RELEASED_WINDOW_MS`) taas kuuluu palvelinpuolelle.
 */
const IMMINENT_MS = 60 * 60 * 1000

// Kaikki muotoilu on sidottu Helsinkiin eikä selaimen vyöhykkeeseen: sama
// teksti palvelimella ja selaimessa, eikä hydraatio eroa. Kellonajat ovat
// muutenkin merkityksellisiä vain Suomen ajassa.
const timeFormat = new Intl.DateTimeFormat('fi-FI', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
})

const weekdayFormat = new Intl.DateTimeFormat('fi-FI', { timeZone: TIME_ZONE, weekday: 'short' })

// sv-SE antaa muodon 2026-08-12, joten kahden hetken päivän voi vertailla
// merkkijonoina ilman omaa vuorokausirajan laskentaa.
const dayFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Milloin-sarakkeen teksti: mitä lähempänä, sitä tarkempi. */
function whenText(time: number, now: number): string {
  const diff = time - now
  if (diff < 0) return `julkaistu ${countdown(-diff)} sitten`
  if (diff <= IMMINENT_MS) return countdown(diff)
  if (dayFormat.format(time) === dayFormat.format(now)) return `tänään ${timeFormat.format(time)}`
  return `${weekdayFormat.format(time)} ${timeFormat.format(time)}`
}

/**
 * Talouskalenterin punaiset tapahtumat.
 *
 * Hälytys on tässä näkymä eikä ilmoitus: sovelluksella ei ole push-kanavaa,
 * joten "pysyn ajan tasalla" tarkoittaa sitä että seuraava korkean vaikutuksen
 * julkaisu ja siihen jäljellä oleva aika ovat Trading-sivun ensimmäinen asia.
 * Lähtölaskenta lasketaan selaimessa välimuistin datasta, joten se on ajan
 * tasalla vaikka lähteestä haetaan vain neljästi vuorokaudessa.
 */
export function EconomicCalendar({ events, now: serverNow, fetchedAt }: Props) {
  const [now, setNow] = useState(serverNow)

  // Minuutin tarkkuus riittää, joten puolen minuutin tikki on tiheämpi kuin
  // näkyvä muutos — riittävän tarkka ilman että komponentti renderöi turhaan.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const stale = fetchedAt !== null && Date.now() - fetchedAt > 24 * 60 * 60 * 1000

  return (
    <Panel
      title="Talouskalenteri"
      meta="korkea vaikutus · kuluva viikko"
      empty={
        fetchedAt === null
          ? 'Kalenteria ei ole vielä haettu.'
          : 'Ei korkean vaikutuksen tapahtumia jäljellä tällä viikolla.'
      }
    >
      {events.length > 0 ? (
        <>
          <ul className="space-y-1.5">
            {events.map(event => {
              const diff = event.time - now
              const released = diff < 0
              const imminent = !released && diff <= IMMINENT_MS

              return (
                <li
                  key={`${event.time}-${event.currency}-${event.title}`}
                  className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
                    imminent
                      ? 'border-ax-down/50 bg-ax-down/[0.07]'
                      : released
                        ? 'border-ax-line opacity-60'
                        : 'border-ax-line'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      released ? 'bg-ax-faint' : imminent ? 'ax-pulse bg-ax-down' : 'bg-ax-down/60'
                    }`}
                  />

                  <span
                    className={`w-32 shrink-0 font-mono text-[10px] uppercase tracking-wider ${
                      imminent ? 'text-ax-down' : 'text-ax-faint'
                    }`}
                  >
                    {whenText(event.time, now)}
                  </span>

                  <span className="w-9 shrink-0 font-mono text-[10px] tracking-wider text-ax-accent">
                    {event.currency}
                  </span>

                  <span className="min-w-0 flex-1 truncate text-[12px] text-ax-text">{event.title}</span>

                  {(event.forecast || event.previous) && (
                    <span className="hidden shrink-0 font-mono text-[10px] text-ax-faint sm:block">
                      {event.forecast && `enn. ${event.forecast}`}
                      {event.forecast && event.previous && ' · '}
                      {event.previous && `ed. ${event.previous}`}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>

          {/* Syötteessä ei ole toteutunutta lukua lainkaan, joten julkaisun
              jälkeen se on haettava lähteestä itse. Sanotaan se suoraan sen
              sijaan että jätettäisiin käyttäjä ihmettelemään puuttuvaa saraketta. */}
          <p className="mt-3 text-[10px] leading-relaxed text-ax-faint">
            Syöte antaa vain ennusteen ja edellisen —{' '}
            <a
              href="https://www.forexfactory.com/calendar"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ax-dim underline decoration-ax-line underline-offset-2 hover:text-ax-accent"
            >
              toteutunut luku ForexFactorystä
            </a>
            .{stale && ' Kalenteri on yli vuorokauden vanha.'}
          </p>
        </>
      ) : null}
    </Panel>
  )
}
