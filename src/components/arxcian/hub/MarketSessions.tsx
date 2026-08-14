'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { sessionStates, activeOverlap } from '@/lib/arxcian/trading/sessions'
import { countdown } from '@/lib/arxcian/time'
import { Panel } from '@/components/arxcian/Panel'

type Props = {
  /**
   * Palvelimen kello renderöintihetkellä. Ilman tätä ensimmäinen
   * selainrenderöinti laskisi eri hetkestä kuin palvelin ja hydraatio hajoaisi.
   */
  now: number
  delay?: number
}

const clockFormat = new Intl.DateTimeFormat('fi-FI', {
  timeZone: 'Europe/Helsinki',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Hubin tiivis istuntonäkymä: mitkä markkinat ovat auki juuri nyt.
 *
 * Erillinen komponentti Trading-osion [MarketSessions](../trading/MarketSessions.tsx):sta
 * eikä sama tiiviimmällä propsilla: hubin paneeli on kapeassa sarakkeessa
 * muiden HUD-paneelien seassa, ja sen tehtävä on vastata yhteen kysymykseen
 * yhdellä silmäyksellä. Trading-osion versio kertoo lisäksi aukioloajat ja
 * varauman pörssien avausajoista, mikä tässä leveydessä olisi kolme riviä
 * tekstiä yhden tiedon ympärillä.
 *
 * Laskenta on molemmissa sama [sessions.ts](@/lib/arxcian/trading/sessions),
 * joten ero on vain esitys.
 */
export function MarketSessions({ now: serverNow, delay }: Props) {
  const [now, setNow] = useState(serverNow)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const states = sessionStates(now)
  const overlap = activeOverlap(states)
  const openCount = states.filter(s => s.open).length

  return (
    <Panel
      title="Istunnot"
      meta={openCount > 0 ? `${openCount} auki` : 'kaikki kiinni'}
      delay={delay}
    >
      <div className="divide-y divide-ax-line/10">
        {states.map(session => (
          <div key={session.id} className="flex items-center gap-3 py-2">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                session.open ? 'ax-pulse bg-ax-up' : 'bg-ax-faint'
              }`}
            />
            <span className="flex-1 truncate text-[11px] uppercase tracking-wider text-ax-dim">
              {session.label}
            </span>
            <span
              className={`font-mono text-[11px] tabular-nums ${
                session.open ? 'text-ax-up' : 'text-ax-faint'
              }`}
            >
              {clockFormat.format(session.opensAt)}
            </span>
            <span className="w-[68px] text-right font-mono text-[10px] tabular-nums text-ax-dim">
              {session.open ? '–' : '+'}
              {countdown(session.changesAt - now)}
            </span>
          </div>
        ))}
      </div>

      {overlap.length > 0 && (
        <p className="mt-2.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ax-accent">
          <span aria-hidden="true" className="ax-pulse h-1.5 w-1.5 rounded-full bg-ax-accent" />
          {overlap.map(s => s.label).join(' + ')} päällekkäin
        </p>
      )}

      <Link
        href="/arxcian/trading"
        className="mt-3 inline-block text-[11px] text-ax-faint transition-colors hover:text-ax-accent"
      >
        Istunnot ja ilmoitukset →
      </Link>
    </Panel>
  )
}
