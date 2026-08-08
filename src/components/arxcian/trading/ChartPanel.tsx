'use client'

import { useState } from 'react'
import { WATCHLIST } from '@/lib/arxcian/trading/symbols'
import { TradingViewChart } from './TradingViewChart'

export function ChartPanel() {
  const [selected, setSelected] = useState(WATCHLIST[5].tvSymbol) // XAUUSD oletuksena

  return (
    <div className="rounded-2xl border border-ax-line bg-ax-panel/70">
      <header className="flex items-center justify-between border-b border-ax-line px-4 py-2.5">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ax-dim">Kaavio</h2>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="rounded-md border border-ax-line bg-ax-panel-hi px-2 py-1 text-[11px] text-ax-text focus:outline-none"
        >
          {WATCHLIST.map(s => (
            <option key={s.tvSymbol} value={s.tvSymbol}>
              {s.label}
            </option>
          ))}
        </select>
      </header>
      <div className="h-96 p-2">
        <TradingViewChart symbol={selected} />
      </div>
    </div>
  )
}
