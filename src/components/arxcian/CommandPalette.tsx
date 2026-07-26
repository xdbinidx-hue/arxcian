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

/** Komentopaletti nopeaan siirtymiseen. Laajenee myöhemmin hakuun ja toimintoihin. */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COMMANDS
    return COMMANDS.filter(c => `${c.label} ${c.hint}`.toLowerCase().includes(q))
  }, [query])

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

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return setOpen(false)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      return setIndex(i => (i + 1) % Math.max(results.length, 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      return setIndex(i => (i - 1 + results.length) % Math.max(results.length, 1))
    }
    if (e.key === 'Enter' && results[index]) {
      e.preventDefault()
      go(results[index].href)
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
        className="w-full max-w-lg overflow-hidden rounded-xl border border-ax-line-strong bg-ax-panel shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-ax-line px-4">
          <IconSearch className="h-4 w-4 shrink-0 text-ax-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Siirry osioon…"
            className="w-full bg-transparent py-3.5 text-sm text-ax-text outline-none placeholder:text-ax-faint"
          />
          <kbd className="shrink-0 rounded border border-ax-line px-1.5 py-0.5 font-mono text-[10px] text-ax-faint">
            esc
          </kbd>
        </div>

        <ul className="max-h-72 overflow-y-auto p-1.5">
          {results.length === 0 && (
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
        </ul>
      </div>
    </div>
  )
}
