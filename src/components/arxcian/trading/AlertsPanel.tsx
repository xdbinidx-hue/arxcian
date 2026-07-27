'use client'

import { useState } from 'react'
import type { Alert, AlertCondition } from '@/lib/arxcian/trading/types'

type Props = {
  initialAlerts: Alert[]
}

export function AlertsPanel({ initialAlerts }: Props) {
  const [alerts, setAlerts] = useState<Alert[]>(initialAlerts)
  const [symbol, setSymbol] = useState('')
  const [condition, setCondition] = useState<AlertCondition>('above')
  const [threshold, setThreshold] = useState('')
  const [busy, setBusy] = useState(false)

  const addAlert = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!symbol.trim() || !threshold) return

    setBusy(true)
    try {
      const res = await fetch('/api/arxcian/trading/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          label: symbol.trim().toUpperCase(),
          condition,
          threshold: Number(threshold),
        }),
      })
      const data = await res.json()
      if (data.alerts) setAlerts(data.alerts)
      setSymbol('')
      setThreshold('')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    const previous = alerts
    setAlerts(alerts.filter(a => a.id !== id))
    try {
      const res = await fetch(`/api/arxcian/trading/alerts?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.alerts) setAlerts(data.alerts)
    } catch {
      setAlerts(previous)
    }
  }

  return (
    <div className="rounded-lg border border-ax-line bg-ax-panel/70">
      <header className="flex items-center justify-between border-b border-ax-line px-4 py-2.5">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ax-dim">Hälytykset</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-ax-faint">viikko</span>
      </header>

      <div className="p-4">
        <form onSubmit={addAlert} className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            placeholder="Symboli, esim. BTC/USD"
            className="w-36 rounded-md border border-ax-line bg-ax-panel-hi px-2.5 py-1.5 text-[12px] text-ax-text placeholder:text-ax-faint focus:outline-none focus:border-ax-line-strong"
          />
          <select
            value={condition}
            onChange={e => setCondition(e.target.value as AlertCondition)}
            className="rounded-md border border-ax-line bg-ax-panel-hi px-2 py-1.5 text-[12px] text-ax-text focus:outline-none"
          >
            <option value="above">yli</option>
            <option value="below">alle</option>
          </select>
          <input
            value={threshold}
            onChange={e => setThreshold(e.target.value)}
            type="number"
            step="any"
            placeholder="hinta"
            className="w-24 rounded-md border border-ax-line bg-ax-panel-hi px-2.5 py-1.5 text-[12px] text-ax-text placeholder:text-ax-faint focus:outline-none focus:border-ax-line-strong"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-ax-accent/15 px-3 py-1.5 text-[12px] font-medium text-ax-accent transition-colors hover:bg-ax-accent/25 disabled:opacity-40"
          >
            Lisää
          </button>
        </form>

        {alerts.length === 0 ? (
          <p className="py-3 text-center text-[13px] text-ax-faint">Ei aktiivisia hälytyksiä.</p>
        ) : (
          <ul className="space-y-1.5">
            {alerts.map(a => (
              <li
                key={a.id}
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-[12px] ${
                  a.triggeredAt ? 'border-ax-accent/40 bg-ax-accent/5' : 'border-ax-line'
                }`}
              >
                <span className="text-ax-text">
                  {a.label} {a.condition === 'above' ? '>' : '<'} {a.threshold}
                  {a.triggeredAt && <span className="ml-2 text-ax-accent">● lauennut</span>}
                </span>
                <button onClick={() => remove(a.id)} className="text-ax-faint hover:text-ax-down">
                  Poista
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
