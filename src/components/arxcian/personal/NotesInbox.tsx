'use client'

import { useState } from 'react'
import type { Note } from '@/lib/arxcian/personal/types'
import type { Owner } from '@/lib/session'

type Props = {
  initialNotes: Note[]
  currentUser: Owner
}

function timeAgo(ms: number): string {
  const diffMin = Math.round((Date.now() - ms) / 60_000)
  if (diffMin < 1) return 'juuri nyt'
  if (diffMin < 60) return `${diffMin} min sitten`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH} h sitten`
  return `${Math.round(diffH / 24)} vrk sitten`
}

const REVIEW_PROMPTS = {
  viikko: [
    'Mikä meni hyvin tällä viikolla?',
    'Mikä ei mennyt suunnitelmien mukaan?',
    'Mitä opin?',
    'Mitkä ovat ensi viikon 1-3 tärkeintä asiaa?',
  ],
  kuukausi: [
    'Suurimmat onnistumiset tässä kuussa?',
    'Missä tavoitteissa edistyttiin, missä ei?',
    'Mitä muutan ensi kuussa?',
  ],
}

export function NotesInbox({ initialNotes, currentUser }: Props) {
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [text, setText] = useState('')
  const [shared, setShared] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reviewMode, setReviewMode] = useState<'viikko' | 'kuukausi' | null>(null)
  const [reviewAnswers, setReviewAnswers] = useState<string[]>([])

  const postNote = async (noteText: string, owner: Owner) => {
    const res = await fetch('/api/arxcian/personal/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: noteText, owner }),
    })
    const data = await res.json()
    if (data.notes) setNotes(data.notes)
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    try {
      await postNote(text.trim(), shared ? 'shared' : currentUser)
      setText('')
    } finally {
      setBusy(false)
    }
  }

  const startReview = (mode: 'viikko' | 'kuukausi') => {
    setReviewMode(mode)
    setReviewAnswers(REVIEW_PROMPTS[mode].map(() => ''))
  }

  const submitReview = async () => {
    if (!reviewMode) return
    const prompts = REVIEW_PROMPTS[reviewMode]
    const body = prompts.map((q, i) => `${q}\n${reviewAnswers[i] || '(ei vastausta)'}`).join('\n\n')
    setBusy(true)
    try {
      await postNote(`/${reviewMode}katsaus\n\n${body}`, currentUser)
      setReviewMode(null)
      setReviewAnswers([])
    } finally {
      setBusy(false)
    }
  }

  const promote = async (id: string) => {
    const res = await fetch('/api/arxcian/personal/notes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const data = await res.json()
    if (data.notes) setNotes(data.notes)
  }

  const remove = async (id: string) => {
    const previous = notes
    setNotes(notes.filter(n => n.id !== id))
    const res = await fetch(`/api/arxcian/personal/notes?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.notes) setNotes(data.notes)
    else setNotes(previous)
  }

  return (
    <div className="ax-glass rounded-2xl">
      <header className="flex items-center justify-between border-b border-ax-line px-4 py-2.5">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ax-dim">Muistiinpanot</h2>
        <div className="flex gap-1.5">
          <button
            onClick={() => startReview('viikko')}
            className="rounded border border-ax-line px-2 py-0.5 text-[10px] text-ax-faint hover:text-ax-text"
          >
            Viikkokatsaus
          </button>
          <button
            onClick={() => startReview('kuukausi')}
            className="rounded border border-ax-line px-2 py-0.5 text-[10px] text-ax-faint hover:text-ax-text"
          >
            Kuukausikatsaus
          </button>
        </div>
      </header>

      <div className="p-4">
        {reviewMode ? (
          <div className="mb-4 rounded-md border border-ax-line-strong p-3">
            <p className="mb-2 text-[11px] uppercase tracking-wider text-ax-accent">
              {reviewMode === 'viikko' ? 'Viikkokatsaus' : 'Kuukausikatsaus'}
            </p>
            {REVIEW_PROMPTS[reviewMode].map((q, i) => (
              <div key={q} className="mb-2">
                <label className="mb-1 block text-[11px] text-ax-dim">{q}</label>
                <textarea
                  value={reviewAnswers[i] ?? ''}
                  onChange={e => setReviewAnswers(a => a.map((v, idx) => (idx === i ? e.target.value : v)))}
                  rows={2}
                  className="w-full resize-none rounded-md border border-ax-line bg-ax-panel-hi px-2.5 py-1.5 text-[12px] text-ax-text placeholder:text-ax-faint focus:outline-none"
                />
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <button onClick={() => setReviewMode(null)} className="text-[12px] text-ax-faint hover:text-ax-text">
                Peruuta
              </button>
              <button
                onClick={submitReview}
                disabled={busy}
                className="rounded-md bg-ax-accent/15 px-3 py-1.5 text-[12px] font-medium text-ax-accent hover:bg-ax-accent/25 disabled:opacity-40"
              >
                Tallenna
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={add} className="mb-4 flex items-center gap-2">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Nopea muistiinpano… (esim. /business uusi asiakas)"
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
        )}

        {notes.length === 0 ? (
          <p className="py-3 text-center text-[13px] text-ax-faint">Ei vielä muistiinpanoja.</p>
        ) : (
          <ul className="space-y-1.5">
            {notes.map(n => (
              <li key={n.id} className="rounded-md border border-ax-line px-3 py-2 text-[12px]">
                <div className="flex items-start justify-between gap-2">
                  <p className="whitespace-pre-wrap text-ax-text">{n.text}</p>
                  <div className="flex shrink-0 gap-2">
                    {!n.promotedToGoalId && (
                      <button onClick={() => promote(n.id)} title="Ylennä tavoitteeksi" className="text-ax-faint hover:text-ax-accent">
                        ↗
                      </button>
                    )}
                    <button onClick={() => remove(n.id)} className="text-ax-faint hover:text-ax-down">
                      Poista
                    </button>
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {n.tags.map(tag => (
                    <span key={tag} className="rounded border border-ax-line px-1.5 py-0.5 text-[9px] text-ax-faint">
                      {tag}
                    </span>
                  ))}
                  {n.promotedToGoalId && (
                    <span className="rounded border border-ax-accent/30 px-1.5 py-0.5 text-[9px] text-ax-accent">
                      ylennetty tavoitteeksi
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-ax-faint">{timeAgo(n.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
