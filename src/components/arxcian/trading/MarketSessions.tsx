'use client'

import { useEffect, useState } from 'react'
import { sessionStates, activeOverlap } from '@/lib/arxcian/trading/sessions'
import { countdown } from '@/lib/arxcian/time'
import { Panel } from '@/components/arxcian/Panel'

type Props = {
  /**
   * Palvelimen kello renderöintihetkellä. Sama syy kuin talouskalenterissa:
   * ilman tätä ensimmäinen selainrenderöinti laskisi eri hetkestä kuin
   * palvelin ja hydraatio hajoaisi.
   */
  now: number
}

// Helsinkiin sidottu, ei selaimen vyöhykkeeseen — sama teksti palvelimella ja
// selaimessa. Suomalainen kellonaika käyttää pistettä, jonka fi-FI antaa itse.
const clockFormat = new Intl.DateTimeFormat('fi-FI', {
  timeZone: 'Europe/Helsinki',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Forex-istuntojen tila: mikä on auki, mikä avautuu seuraavaksi ja milloin.
 *
 * Istunnot lasketaan selaimessa joka minuutti eikä haeta mistään: aukioloajat
 * ovat sääntöjä, joten tässä paneelissa ei ole ulkoista lähdettä joka voisi
 * kaatua. Sama syy miksi tällä ei ole cron-työtä eikä välimuistiavainta.
 */
export function MarketSessions({ now: serverNow }: Props) {
  const [now, setNow] = useState(serverNow)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const states = sessionStates(now)
  const overlap = activeOverlap(states)

  return (
    <Panel title="Istunnot" meta="forex">
      <ul className="space-y-1.5">
        {states.map(session => (
          <li
            key={session.id}
            className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
              session.open ? 'border-ax-up/40 bg-ax-up/[0.06]' : 'border-ax-line'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                session.open ? 'ax-pulse bg-ax-up' : 'bg-ax-faint'
              }`}
            />

            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-ax-text">{session.label}</div>
              {/* Paikka näytetään vain kun se kertoo jotain mitä nimi ei kerro:
                  "Aasia · Tokio" selittää mitä aika edustaa, "Lontoo · Lontoo"
                  olisi pelkkää toistoa. */}
              <div className="truncate font-mono text-[10px] text-ax-faint">
                {session.place !== session.label && `${session.place} · `}
                {clockFormat.format(session.opensAt)}–{clockFormat.format(session.closesAt)}
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div
                className={`font-mono text-[10px] uppercase tracking-wider ${
                  session.open ? 'text-ax-up' : 'text-ax-faint'
                }`}
              >
                {session.open ? 'auki' : 'kiinni'}
              </div>
              <div className="font-mono text-[10px] text-ax-dim">
                {session.open ? 'sulkeutuu' : 'avautuu'} {countdown(session.changesAt - now)}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Päällekkäisyys on koko syy katsoa istuntoaikoja, joten se sanotaan
          erikseen eikä jätetä kahden vihreän pallon pääteltäväksi. */}
      {overlap.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ax-accent">
          <span aria-hidden="true" className="ax-pulse h-1.5 w-1.5 rounded-full bg-ax-accent" />
          {overlap.map(s => s.label).join(' + ')} päällekkäin
        </p>
      )}

      {/* Watchlistilla on osakkeita, joten ero on kerrottava: NYSE avaa 16.30
          Suomen aikaa, forex-istunto 15.00. Ilman tätä rivi näyttäisi
          lupaavan väärää asiaa. */}
      <p className="mt-3 text-[10px] leading-relaxed text-ax-faint">
        Forex-istunnot, eivät pörssien aukioloja — NYSE avaa 16.30, Lontoon pörssi 10.00 Suomen
        aikaa. Viikonloppuisin kaikki ovat kiinni.
      </p>
    </Panel>
  )
}
