import { readCached } from '@/lib/arxcian/cache'
import { readFetchStatus } from '@/lib/arxcian/fetchStatus'
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

/**
 * Hakujen tila kaikista kategorioista yhtenä rivinä.
 *
 * Uutissivu näytti aiemmin kirjaston kertomatta milloin se haettiin, joten
 * kaatunut lähde näkyi vain lokissa — sama vika kuin hubin KANAVAT-paneelissa.
 * Kategorioita on kuusi, joten tila kootaan yhdeksi riviksi eikä kuudeksi.
 */
async function loadFetchTrouble(): Promise<{
  staleCategories: Category[]
  failedSources: string[]
  lastAttempt: number | null
} | null> {
  const statuses = await Promise.all(
    CATEGORIES.map(async c => [c, await readFetchStatus(cacheKeyFor(c))] as const),
  )

  const staleCategories: Category[] = []
  const failedSources = new Set<string>()
  let lastAttempt: number | null = null

  for (const [category, status] of statuses) {
    if (!status) continue
    lastAttempt = Math.max(lastAttempt ?? 0, status.lastAttempt)
    if (status.lastSuccess === null || status.lastSuccess < status.lastAttempt) {
      staleCategories.push(category)
    }
    status.failed.forEach(name => failedSources.add(name))
  }

  if (staleCategories.length === 0 && failedSources.size === 0) return null
  return { staleCategories, failedSources: Array.from(failedSources), lastAttempt }
}

export default async function UutisetPage() {
  const user = await currentOwner()
  const [articlesByCategory, readLater, radar, trouble] = await Promise.all([
    loadArticlesByCategory(),
    user ? getReadLater(user) : Promise.resolve([]),
    getRadarTileUrl().catch(() => null),
    loadFetchTrouble(),
  ])

  const hasAnyArticles = Object.values(articlesByCategory).some(list => list.length > 0)

  return (
    <div className="mx-auto max-w-6xl">
      <header className="ax-rise pb-6 pt-2">
        <h1 className="text-2xl font-light tracking-tight text-ax-text">Uutiset</h1>
        <p className="mt-1 text-[13px] text-ax-dim">Päivän kirjasto — 5 tärkeintä per aihe klo 8, 12, 16 ja 20</p>

        {trouble ? (
          <p className="mt-3 rounded-md border border-ax-down/30 bg-ax-down/10 px-3 py-2 text-[12px] leading-relaxed text-ax-down">
            {trouble.staleCategories.length > 0
              ? `Vanhentunutta dataa: ${trouble.staleCategories.join(', ')}. `
              : ''}
            {trouble.failedSources.length > 0
              ? `Lähteitä ei tavoitettu: ${trouble.failedSources.join(', ')}. `
              : ''}
            {trouble.lastAttempt
              ? `Viimeisin haku ${new Date(trouble.lastAttempt).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}.`
              : ''}
          </p>
        ) : null}
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
        <p className="mb-4 ax-glass rounded-2xl p-4 text-[13px] text-ax-faint">
          Ei vielä uutisia — ensimmäinen haku ajetaan seuraavassa ajastetussa ajossa (08/12/16/20), tai käynnistä se
          käsin osoitteesta <code className="text-ax-dim">/api/arxcian/cron</code>.
        </p>
      )}

      <NewsFeed articlesByCategory={articlesByCategory} initialReadLater={readLater} />
    </div>
  )
}
