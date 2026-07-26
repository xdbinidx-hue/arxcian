'use client'

import { useEffect, useState } from 'react'

/**
 * Vierivä tilanauha. Näyttää toistaiseksi vain kellon ja osioiden
 * tilan — oikeat markkinaluvut tulevat Vaiheessa 2.
 */

const ITEMS = [
  { label: 'UUTISET', value: 'ei dataa' },
  { label: 'MARKKINAT', value: 'ei dataa' },
  { label: 'KALENTERI', value: 'ei dataa' },
  { label: 'HÄLYTYKSET', value: 'ei dataa' },
]

function Clock() {
  // Renderöidään vasta selaimessa, jottei palvelimen ja selaimen
  // kellonaika eroa toisistaan hydraatiossa.
  const [now, setNow] = useState<string | null>(null)

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString('fi-FI', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      )
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return <span className="font-mono tabular-nums text-ax-dim">{now ?? '--:--:--'}</span>
}

function Row() {
  return (
    <div className="flex shrink-0 items-center gap-7 pr-7">
      {ITEMS.map(item => (
        <span key={item.label} className="flex items-center gap-2 whitespace-nowrap">
          <span className="text-[10px] uppercase tracking-[0.16em] text-ax-faint">{item.label}</span>
          <span className="font-mono text-[11px] text-ax-dim">{item.value}</span>
        </span>
      ))}
    </div>
  )
}

export function Ticker() {
  return (
    <div className="flex min-w-0 items-center gap-4">
      <Clock />
      <div className="relative hidden min-w-0 flex-1 overflow-hidden sm:block">
        <div className="ax-ticker-track flex w-max">
          {/* Kaksi identtistä riviä, jotta vieritys jatkuu saumattomasti */}
          <Row />
          <Row />
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-ax-bg via-ax-bg/90 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-ax-bg via-ax-bg/90 to-transparent" />
      </div>
    </div>
  )
}
