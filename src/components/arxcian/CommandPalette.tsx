'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HUB_HREF, SECTIONS } from '@/lib/arxcian/nav'
import { SectionIcon, IconHub, IconSearch } from './icons'

type Command = {
  id: string
  label: string
  hint: string
  href: string
  icon: 'hub' | (typeof SECTIONS)[number]['id']
}

const COMMANDS: Command[] = [
  { id: 'hub', label: 'Hub', hint: 'Etusivu', href: HUB_HREF, icon: 'hub' },
  ...SECTIONS.map(s => ({
    id: s.id,
    label: s.label,
    hint: s.description,
    href: s.href,
    icon: s.id,
  })),
]

/** Paletin näkymä: haku, kysymys lähdössä, vastaus odottaa, tai virhe. */
type Mode = 'search' | 'asking' | 'answered' | 'error'

/** Komentopaletti nopeaan siirtymiseen — ja kun mikään komento ei osu, kysymys AI-avustajalle samassa ikkunassa. */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState<Mode>('search')
  const [answer, setAnswer] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COMMANDS
    return COMMANDS.filter(c => `${c.label} ${c.hint}`.toLowerCase().includes(q))
  }, [query])

  // Kysymysrivi näkyy vain kun haku ei osunut mihinkään komentoon ja käyttäjä
  // on kirjoittanut jotain — tyhjällä haulla results on aina koko COMMANDS.
  const askVisible = mode === 'search' && results.length === 0 && query.trim() !== ''
  const selectableCount = results.length > 0 ? results.length : askVisible ? 1 : 0

  // ⌘K / Ctrl+K avaa ja sulkee
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
      inputRef.current?.focus()
    } else {
      // Paletti voi sulkeutua monesta reitistä (go(), taustaklikkaus, Escape)
      // — nollataan kysymystila täällä yhdessä paikassa sen sijaan että
      // jokainen sulkukohta joutuisi muistamaan sen itse.
      setMode('search')
      setAnswer(null)
      setErrorMessage(null)
    }
  }, [open])

  useEffect(() => {
    setIndex(0)
  }, [query])

  if (!open) return null

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  const askAssistant = async (prompt: string) => {
    setMode('asking')
    setQuery('')
    try {
      const res = await fetch('/api/arxcian/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const data = await res.json()
      if (res.ok) {
        setAnswer(data.text)
        setMode('answered')
      } else {
        setErrorMessage(data.error ?? 'Jokin meni pieleen.')
        setMode('error')
      }
    } catch {
      // Verkkovirhe tms. ennen kuin vastaus edes saapui — ilman tätä käyttäjä
      // jäisi 'asking'-tilaan loputtomiin, koska Escape ei tee siinä mitään.
      setErrorMessage('Jokin meni pieleen.')
      setMode('error')
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (mode === 'asking') return // odotetaan vastausta
      if (mode === 'answered' || mode === 'error') {
        setMode('search')
        setAnswer(null)
        setErrorMessage(null)
        inputRef.current?.focus()
        return
      }
      return setOpen(false)
    }

    // Nuolet ja Enter koskevat vain haku/tulos-listaa.
    if (mode !== 'search') return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      return setIndex(i => (i + 1) % Math.max(selectableCount, 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      return setIndex(i => (i - 1 + selectableCount) % Math.max(selectableCount, 1))
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (results[index]) return go(results[index].href)
      if (askVisible && index === 0) askAssistant(query.trim())
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-[14vh] backdrop-blur-sm"
      onMouseDown={e => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Komentopaletti"
        className="w-full max-w-lg overflow-hidden ax-glass rounded-xl shadow-2xl"
      >
        <div className="flex items-center gap-3 ax-glass-divide border-b px-4">
          <IconSearch className="h-4 w-4 shrink-0 text-ax-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={mode === 'asking'}
            placeholder="Siirry osioon…"
            className="w-full bg-transparent py-3.5 text-sm text-ax-text outline-none placeholder:text-ax-faint disabled:opacity-50"
          />
          <kbd className="shrink-0 rounded border border-ax-line px-1.5 py-0.5 font-mono text-[10px] text-ax-faint">
            esc
          </kbd>
        </div>

        {mode === 'search' && (
          <ul className="max-h-72 overflow-y-auto p-1.5">
            {results.length === 0 && !askVisible && (
              <li className="px-3 py-6 text-center text-[13px] text-ax-faint">Ei osumia.</li>
            )}
            {results.map((c, i) => (
              <li key={c.id}>
                <button
                  onClick={() => go(c.href)}
                  onMouseEnter={() => setIndex(i)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${
                    i === index ? 'bg-ax-panel-hi text-ax-text' : 'text-ax-dim'
                  }`}
                >
                  {c.icon === 'hub' ? (
                    <IconHub className="h-4 w-4 shrink-0 text-ax-accent" />
                  ) : (
                    <SectionIcon id={c.icon} className="h-4 w-4 shrink-0 text-ax-accent" />
                  )}
                  <span className="text-sm">{c.label}</span>
                  <span className="ml-auto truncate text-[11px] text-ax-faint">{c.hint}</span>
                </button>
              </li>
            ))}
            {askVisible && (
              <li>
                <button
                  onClick={() => askAssistant(query.trim())}
                  onMouseEnter={() => setIndex(0)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${
                    index === 0 ? 'bg-ax-panel-hi text-ax-text' : 'text-ax-dim'
                  }`}
                >
                  <IconSearch className="h-4 w-4 shrink-0 text-ax-accent" />
                  <span className="text-sm">Kysy assistentilta: {query}</span>
                </button>
              </li>
            )}
          </ul>
        )}

        {mode === 'asking' && (
          <div className="px-3 py-6 text-center text-[13px] text-ax-faint">Kysytään assistentilta…</div>
        )}

        {mode === 'answered' && (
          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap p-4 text-[13px] leading-relaxed text-ax-text">
            {answer}
          </div>
        )}

        {mode === 'error' && (
          <div className="px-3 py-6 text-center text-[13px] text-ax-down">{errorMessage}</div>
        )}
      </div>
    </div>
  )
}
