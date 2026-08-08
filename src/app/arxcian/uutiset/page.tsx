import { readCached } from '@/lib/arxcian/cache'
import { getRadarTileUrl } from '@/lib/arxcian/radar'
import { cacheKeyFor } from '@/lib/arxcian/news/fetchNews'
import { getReadLater } from '@/lib/arxcian/news/readLater'
import { CATEGORIES, type Article, type Category } from '@/lib/arxcian/news/types'
import { currentOwner } from '@/lib/session'
import { WeatherWidget } from '@/components/arxcian/WeatherWidget'
import { WeatherMap } from '@/components/arxcian/WeatherMap'
import { NewsFeed } from '@/components/arxcian/news/NewsFeed'
import { Panel } from '@/components/arxcian/Panel'

export const metadata = { title: 'Uutiset · arxcian' }
export const dynamic = 'force-dynamic'

async function loadArticlesByCategory(): Promise<Record<Category, Article[]>> {
  const entries = await Promise.all(
    CATEGORIES.map(async c => {
      const cached = await readCached<Article[]>(cacheKeyFor(c))
      return [c, cached?.data ?? []] as const
    }),
  )
  return Object.fromEntries(entries) as Record<Category, Article[]>
}

export default async function UutisetPage() {
  const user = await currentOwner()
  const [articlesByCategory, readLater, radar] = await Promise.all([
    loadArticlesByCategory(),
    user ? getReadLater(user) : Promise.resolve([]),
    getRadarTileUrl().catch(() => null),
  ])

  const hasAnyArticles = Object.values(articlesByCategory).some(list => list.length > 0)

  return (
    <div className="mx-auto max-w-6xl">
      <header className="ax-rise pb-6 pt-2">
        <h1 className="text-2xl font-light tracking-tight text-ax-text">Uutiset</h1>
        <p className="mt-1 text-[13px] text-ax-dim">Kategorioidut koosteet ja AI-tiivistelmät</p>
      </header>

      <div className="mb-4 grid gap-3 lg:grid-cols-[280px_1fr]">
        <WeatherWidget />
        <Panel title="Säätutka" meta="RainViewer" delay={0.06}>
          {radar ? (
            <WeatherMap radarTileUrl={radar.data} />
          ) : (
            <p className="py-6 text-center text-[13px] text-ax-faint">Tutkakuva ei ole juuri nyt saatavilla.</p>
          )}
        </Panel>
      </div>

      {!hasAnyArticles && (
        <p className="mb-4 rounded-2xl border border-ax-line bg-ax-panel/70 p-4 text-[13px] text-ax-faint">
          Ei vielä uutisia — ensimmäinen haku ajetaan seuraavassa ajastetussa ajossa (08/12/16/20), tai käynnistä se
          käsin osoitteesta <code className="text-ax-dim">/api/arxcian/cron</code>.
        </p>
      )}

      <NewsFeed articlesByCategory={articlesByCategory} initialReadLater={readLater} />
    </div>
  )
}
