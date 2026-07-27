import Link from 'next/link'
import { readCached } from '@/lib/arxcian/cache'
import { cacheKeyFor } from '@/lib/arxcian/news/fetchNews'
import { CATEGORIES, CATEGORY_LABELS, type Article } from '@/lib/arxcian/news/types'
import { timeAgo } from '@/lib/arxcian/time'
import { Panel } from '@/components/arxcian/Panel'

const MAX_SHOWN = 5

/**
 * Uusimmat otsikot kaikista kategorioista yhdessä listassa. Luetaan
 * välimuistista kuten Uutiset-sivukin — hub ei koskaan odota RSS-hakua.
 */
export async function NewsDigest({ delay }: { delay?: number }) {
  const lists = await Promise.all(
    CATEGORIES.map(async c => (await readCached<Article[]>(cacheKeyFor(c)))?.data ?? []),
  )

  const latest = lists
    .flat()
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    .slice(0, MAX_SHOWN)

  return (
    <Panel
      title="Päivän uutiskooste"
      meta={latest.length > 0 ? timeAgo(latest[0].publishedAt) : 'RSS'}
      delay={delay}
      empty="Ei vielä uutisia — ensimmäinen haku ajetaan seuraavassa ajastetussa ajossa."
    >
      {latest.length > 0 ? (
        <>
          <ul className="space-y-2.5">
            {latest.map(article => (
              <li key={article.id}>
                <a
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-[13px] leading-snug text-ax-text transition-colors hover:text-ax-accent"
                >
                  {article.kind === 'video' && <span className="mr-1 text-ax-accent">▶</span>}
                  {article.title}
                </a>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-ax-faint">
                  {CATEGORY_LABELS[article.category]} · {article.sourceName}
                  {article.publishedAt && ` · ${timeAgo(article.publishedAt)}`}
                </p>
              </li>
            ))}
          </ul>
          <Link
            href="/arxcian/uutiset"
            className="mt-3 inline-block text-[11px] text-ax-faint transition-colors hover:text-ax-accent"
          >
            Kaikki uutiset →
          </Link>
        </>
      ) : null}
    </Panel>
  )
}
