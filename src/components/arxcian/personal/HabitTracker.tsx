'use client'

import { useState } from 'react'
import { calculateStreak } from '@/lib/arxcian/personal/streak'
import type { Habit } from '@/lib/arxcian/personal/types'
import type { Owner } from '@/lib/session'

type Props = {
  initialHabits: Habit[]
  currentUser: Owner
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function HabitTracker({ initialHabits, currentUser }: Props) {
  const [habits, setHabits] = useState<Habit[]>(initialHabits)
  const [title, setTitle] = useState('')
  const [shared, setShared] = useState(false)
  const [busy, setBusy] = useState(false)

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/arxcian/personal/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), owner: shared ? 'shared' : currentUser }),
      })
      const data = await res.json()
      if (data.habits) setHabits(data.habits)
      setTitle('')
    } finally {
      setBusy(false)
    }
  }

  const toggleToday = async (id: string) => {
    const today = todayISO()
    setHabits(
      habits.map(h =>
        h.id === id
          ? {
              ...h,
              completedDates: h.completedDates.includes(today)
                ? h.completedDates.filter(d => d !== today)
                : [...h.completedDates, today],
            }
          : h,
      ),
    )
    const res = await fetch('/api/arxcian/personal/habits', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const data = await res.json()
    if (data.habits) setHabits(data.habits)
  }

  const remove = async (id: string) => {
    const previous = habits
    setHabits(habits.filter(h => h.id !== id))
    const res = await fetch(`/api/arxcian/personal/habits?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.habits) setHabits(data.habits)
    else setHabits(previous)
  }

  const today = todayISO()

  return (
    <div className="rounded-lg border border-ax-line bg-ax-panel/70">
      <header className="border-b border-ax-line px-4 py-2.5">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ax-dim">Rutiinit</h2>
      </header>

      <div className="p-4">
        <form onSubmit={add} className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Uusi päivittäinen rutiini…"
            className="min-w-[180px] flex-1 rounded-md border border-ax-line bg-ax-panel-hi px-2.5 py-1.5 text-[12px] text-ax-text placeholder:text-ax-faint focus:outline-none focus:border-ax-line-strong"
          />
          <label className="flex items-center gap-1.5 text-[11px] text-ax-dim">
            <input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} />
            Jaettu
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-ax-accent/15 px-3 py-1.5 text-[12px] font-medium text-ax-accent transition-colors hover:bg-ax-accent/25 disabled:opacity-40"
          >
            Lisää
          </button>
        </form>

        {habits.length === 0 ? (
          <p className="py-3 text-center text-[13px] text-ax-faint">Ei vielä rutiineja.</p>
        ) : (
          <ul className="space-y-1.5">
            {habits.map(h => {
              const doneToday = h.completedDates.includes(today)
              const streak = calculateStreak(h.completedDates)
              return (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-ax-line px-3 py-2 text-[12px]"
                >
                  <button onClick={() => toggleToday(h.id)} className="flex flex-1 items-center gap-2 text-left">
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        doneToday ? 'border-ax-accent bg-ax-accent/20 text-ax-accent' : 'border-ax-line'
                      }`}
                    >
                      {doneToday && '✓'}
                    </span>
                    <span className="text-ax-text">{h.title}</span>
                    {h.owner === 'shared' && (
                      <span className="rounded border border-ax-line px-1 text-[9px] text-ax-faint">jaettu</span>
                    )}
                  </button>
                  {streak > 0 && (
                    <span className="font-mono text-[11px] text-ax-warn">🔥{streak}</span>
                  )}
                  <button onClick={() => remove(h.id)} className="text-ax-faint hover:text-ax-down">
                    Poista
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
