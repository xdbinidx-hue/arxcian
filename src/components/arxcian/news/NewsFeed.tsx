'use client'

import { useMemo, useState } from 'react'
import { CATEGORIES, CATEGORY_LABELS, type Article, type Category } from '@/lib/arxcian/news/types'
import { ArticleCard } from './ArticleCard'

type Props = {
  articlesByCategory: Record<Category, Article[]>
  initialReadLater: Article[]
}

const READ_LATER_TAB = 'lue-myohemmin' as const
type Tab = Category | typeof READ_LATER_TAB

export function NewsFeed({ articlesByCategory, initialReadLater }: Props) {
  const [tab, setTab] = useState<Tab>(CATEGORIES[0])
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [readLater, setReadLater] = useState<Article[]>(initialReadLater)

  const savedIds = useMemo(() => new Set(readLater.map(a => a.id)), [readLater])

  const toggleSaved = async (article: Article, saved: boolean) => {
    // Optimistinen päivitys — palautetaan jos pyyntö epäonnistuu.
    const previous = readLater
    setReadLater(saved ? [article, ...previous.filter(a => a.id !== article.id)] : previous.filter(a => a.id !== article.id))

    try {
      if (saved) {
        await fetch('/api/arxcian/uutiset/read-later', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ article }),
        })
      } else {
        await fetch(`/api/arxcian/uutiset/read-later?id=${encodeURIComponent(article.id)}`, { method: 'DELETE' })
      }
    } catch {
      setReadLater(previous)
    }
  }

  const currentArticles = tab === READ_LATER_TAB ? readLater : articlesByCategory[tab] ?? []

  const tags = useMemo(() => {
    const set = new Set<string>()
    currentArticles.forEach(a => a.tags.forEach(t => set.add(t)))
    return Array.from(set).slice(0, 12)
  }, [currentArticles])

  const filtered = activeTag ? currentArticles.filter(a => a.tags.includes(activeTag)) : currentArticles

  const selectTab = (t: Tab) => {
    setTab(t)
    setActiveTag(null)
  }

  return (
    <div>
      <div className="ax-rise flex flex-wrap gap-1.5 border-b border-ax-line pb-3">
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => selectTab(c)}
            className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
              tab === c ? 'bg-ax-panel-hi text-ax-accent' : 'text-ax-dim hover:text-ax-text'
            }`}
          >
            {CATEGORY_LABELS[c]}
            {articlesByCategory[c]?.length > 0 && (
              <span className="ml-1.5 text-ax-faint">{articlesByCategory[c].length}</span>
            )}
          </button>
        ))}
        <button
          onClick={() => selectTab(READ_LATER_TAB)}
          className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
            tab === READ_LATER_TAB ? 'bg-ax-panel-hi text-ax-accent' : 'text-ax-dim hover:text-ax-text'
          }`}
        >
          Lue myöhemmin
          {readLater.length > 0 && <span className="ml-1.5 text-ax-faint">{readLater.length}</span>}
        </button>
      </div>

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wide transition-colors ${
                activeTag === tag
                  ? 'border-ax-accent/50 text-ax-accent'
                  : 'border-ax-line text-ax-faint hover:text-ax-dim'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.length === 0 && (
          <p className="col-span-full py-8 text-center text-[13px] text-ax-faint">
            {tab === READ_LATER_TAB ? 'Ei tallennettuja uutisia.' : 'Ei vielä uutisia tässä kategoriassa.'}
          </p>
        )}
        {filtered.map(article => (
          <ArticleCard
            key={article.id}
            article={article}
            saved={savedIds.has(article.id)}
            onToggleSaved={toggleSaved}
          />
        ))}
      </div>
    </div>
  )
}
