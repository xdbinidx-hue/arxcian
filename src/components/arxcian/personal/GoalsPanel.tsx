'use client'

import { useState } from 'react'
import { StoreError, useStoreError } from './storeError'
import { GOAL_AREAS, GOAL_AREA_LABELS, type Goal, type GoalArea } from '@/lib/arxcian/personal/types'
import type { Owner } from '@/lib/session'

type Props = {
  initialGoals: Goal[]
  currentUser: Owner
}

export function GoalsPanel({ initialGoals, currentUser }: Props) {
  const [goals, setGoals] = useState<Goal[]>(initialGoals)
  const { virhe, setVirhe, laheta } = useStoreError()
  const [title, setTitle] = useState('')
  const [area, setArea] = useState<GoalArea>('henkilokohtainen')
  const [shared, setShared] = useState(false)
  const [busy, setBusy] = useState(false)

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      const lista = await laheta<Goal>('/api/arxcian/personal/goals', 'goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area, title: title.trim(), owner: shared ? 'shared' : currentUser }),
      })
      // Kenttä tyhjennetään vain onnistuessa — muuten epäonnistunut tallennus
      // veisi kirjoitetun tekstin mukanaan.
      if (lista) {
        setGoals(lista)
        setTitle('')
      }
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (id: string) => {
    // Optimistinen tila peruutetaan epäonnistuessa: muuten ruksi jäisi
    // valheellisesti päälle sivun päivitykseen asti.
    const previous = goals
    setGoals(goals.map(g => (g.id === id ? { ...g, done: !g.done } : g)))
    const lista = await laheta<Goal>('/api/arxcian/personal/goals', 'goals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setGoals(lista ?? previous)
  }

  const remove = async (id: string) => {
    const previous = goals
    setGoals(goals.filter(g => g.id !== id))
    const lista = await laheta<Goal>(
      `/api/arxcian/personal/goals?id=${encodeURIComponent(id)}`,
      'goals',
      { method: 'DELETE' },
    )
    setGoals(lista ?? previous)
  }

  return (
    <div className="ax-glass rounded-2xl">
      <header className="border-b border-ax-line px-4 py-2.5">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ax-dim">Tavoitteet</h2>
      </header>

      <div className="p-4">
        <StoreError virhe={virhe} onSulje={() => setVirhe(null)} />
        <form onSubmit={add} className="mb-4 flex flex-wrap items-center gap-2">
          <select
            value={area}
            onChange={e => setArea(e.target.value as GoalArea)}
            className="rounded-md border border-ax-line bg-ax-panel-hi px-2 py-1.5 text-[12px] text-ax-text focus:outline-none"
          >
            {GOAL_AREAS.map(a => (
              <option key={a} value={a}>
                {GOAL_AREA_LABELS[a]}
              </option>
            ))}
          </select>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Uusi tavoite…"
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

        {GOAL_AREAS.map(a => {
          const items = goals.filter(g => g.area === a)
          if (items.length === 0) return null
          return (
            <div key={a} className="mb-4 last:mb-0">
              <h3 className="mb-1.5 text-[10px] uppercase tracking-wider text-ax-faint">{GOAL_AREA_LABELS[a]}</h3>
              <ul className="space-y-1">
                {items.map(g => (
                  <li
                    key={g.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-ax-line px-3 py-2 text-[12px]"
                  >
                    <label className="flex flex-1 items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={g.done} onChange={() => toggle(g.id)} />
                      <span className={g.done ? 'text-ax-faint line-through' : 'text-ax-text'}>{g.title}</span>
                      {g.owner === 'shared' && (
                        <span className="rounded border border-ax-line px-1 text-[9px] text-ax-faint">jaettu</span>
                      )}
                    </label>
                    <button onClick={() => remove(g.id)} className="text-ax-faint hover:text-ax-down">
                      Poista
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}

        {goals.length === 0 && <p className="py-3 text-center text-[13px] text-ax-faint">Ei vielä tavoitteita.</p>}
      </div>
    </div>
  )
}
