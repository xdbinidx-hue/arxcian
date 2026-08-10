'use client'

import { useEffect, useState } from 'react'

/**
 * Kello HUDin vasemmassa yläkulmassa.
 *
 * Client-komponentti nimenomaan siksi, että kello käy: palvelimella
 * renderöity kellonaika olisi väärä heti ensimmäisen sekunnin jälkeen, ja
 * hydraatio vertaisi kahta eri aikaa keskenään. Ensimmäinen renderöinti
 * jättää ajan tyhjäksi ja täyttää sen vasta selaimessa, jolloin palvelimen
 * ja selaimen tuottama HTML täsmää.
 *
 * Aikavyöhyke on kiinnitetty Helsinkiin kuten muuallakin hubissa — muuten
 * ulkomailta katsottuna päivän vaihtuminen ei täsmäisi muun sisällön kanssa.
 */

const TZ = 'Europe/Helsinki'

export function HudClock() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const time = now
    ? now.toLocaleTimeString('fi-FI', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: TZ,
      })
    : '--:--'

  const date = now
    ? now
        .toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          timeZone: TZ,
        })
        .toUpperCase()
    : ''

  const weekday = now
    ? now.toLocaleDateString('en-US', { weekday: 'long', timeZone: TZ }).toUpperCase()
    : ''

  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-3xl font-light tabular-nums tracking-tight text-ax-text">{time}</div>
        <div className="mt-1 font-mono text-[11px] tracking-[0.12em] text-ax-dim">{date}</div>
        <div className="font-mono text-[10px] tracking-widest text-ax-faint">{weekday}</div>
      </div>

      <div
        aria-hidden="true"
        className="mt-1 h-12 w-20 rounded-xl opacity-70"
        style={{
          background:
            'radial-gradient(circle, rgb(var(--ax-accent) / 0.3), transparent 50%)',
        }}
      />
    </div>
  )
}
