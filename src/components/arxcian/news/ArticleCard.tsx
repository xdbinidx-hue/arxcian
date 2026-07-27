'use client'

import { useState } from 'react'
import type { Article } from '@/lib/arxcian/news/types'

type Props = {
  article: Article
  /** Onko artikkeli jo lue myöhemmin -listalla */
  saved: boolean
  onToggleSaved: (article: Article, saved: boolean) => void
}

function timeAgo(ms: number | null): string {
  if (!ms) return ''
  const diffMin = Math.round((Date.now() - ms) / 60_000)
  if (diffMin < 1) return 'juuri nyt'
  if (diffMin < 60) return `${diffMin} min sitten`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH} h sitten`
  return `${Math.round(diffH / 24)} vrk sitten`
}

export function ArticleCard({ article, saved, onToggleSaved }: Props) {
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    setBusy(true)
    try {
      onToggleSaved(article, !saved)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="ax-rise rounded-lg border border-ax-line bg-ax-panel/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] text-ax-faint">
          {article.kind === 'video' && <span className="text-ax-accent">▶</span>}
          <span className="uppercase tracking-wider">{article.sourceName}</span>
          {article.publishedAt && <span>· {timeAgo(article.publishedAt)}</span>}
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          title={saved ? 'Poista lue myöhemmin -listalta' : 'Lisää lue myöhemmin -listalle'}
          aria-label={saved ? 'Poista lue myöhemmin -listalta' : 'Lisää lue myöhemmin -listalle'}
          className={`shrink-0 rounded-md border p-1 transition-colors disabled:opacity-40 ${
            saved ? 'border-ax-accent/40 text-ax-accent' : 'border-ax-line text-ax-faint hover:text-ax-text'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5}>
            <path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <a href={article.link} target="_blank" rel="noopener noreferrer" className="mt-2 block">
        <h3 className="text-[14px] font-medium leading-snug text-ax-text hover:text-ax-accent">
          {article.title}
        </h3>
      </a>

      {article.summary && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-ax-dim">{article.summary}</p>
      )}

      {article.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {article.tags.map(tag => (
            <span
              key={tag}
              className="rounded border border-ax-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ax-faint"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </article>
  )
}
