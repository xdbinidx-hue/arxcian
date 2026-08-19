'use client'

import { useState } from 'react'
import type { InboxEntry } from '@/lib/arxcian/watch/types'

/**
 * Inboxin rivit ja niiden kuittaus.
 *
 * Asiakaskomponentti vain siksi, että rivin voi merkitä luetuksi ilman koko
 * sivun uudelleenlatausta. Poisto menee silti palvelimelle, joka tarkistaa
 * omistajuuden — selaimen tila ei ole totuus.
 */
export function WatchInboxList({ items }: { items: InboxEntry[] }) {
  const [rows, setRows] = useState(items)
  const [busy, setBusy] = useState<string | null>(null)

  async function dismiss(id: string) {
    setBusy(id)
    try {
      const res = await fetch(`/api/arxcian/watch/inbox?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      // Rivi poistetaan näkyvistä vain jos palvelin todella poisti sen.
      if (res.ok) setRows(prev => prev.filter(r => r.id !== id))
    } finally {
      setBusy(null)
    }
  }

  if (rows.length === 0) {
    return <p className="py-4 text-center text-[12px] text-ax-faint">Kaikki kuitattu.</p>
  }

  return (
    <ul>
      {rows.map(item => (
        <li key={item.id} className="ax-glass-divide flex items-center gap-2 border-b py-2 last:border-none">
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 transition-opacity hover:opacity-80"
          >
            <span className="block truncate text-[11px] text-ax-text">{item.source}</span>
            <span className="block truncate text-[9px] text-ax-faint">{item.title}</span>
          </a>

          <button
            type="button"
            onClick={() => dismiss(item.id)}
            disabled={busy === item.id}
            aria-label={`Kuittaa: ${item.title}`}
            className="shrink-0 rounded-md border border-ax-line/30 px-1.5 py-0.5 text-[9px] text-ax-faint transition-colors hover:text-ax-text disabled:opacity-40"
          >
            {busy === item.id ? '…' : '✓'}
          </button>
        </li>
      ))}
    </ul>
  )
}
