import { fetchFeed } from './rss'
import { sourcesFor } from './sources'
import { summarizeArticles } from './summarize'
import { readCached, writeCached } from '../cache'
import type { Article, Category, RawItem } from './types'

const TTL_SECONDS = 5 * 60 * 60 // hieman yli neljä tuntia, kattaa ajastuksen välin
const MAX_ARTICLES = 60

export function cacheKeyFor(category: Category): string {
  return `news:${category}`
}

/** Yksi artikkeli tunnistetaan linkillä — samaa uutista ei tiivistetä kahdesti. */
function articleId(link: string): string {
  return link
}

/** Hakee kaikki kategorian lähteet rinnakkain. Yhden lähteen kaatuminen ei vie muita mukanaan. */
async function fetchCategoryRaw(category: Category): Promise<RawItem[]> {
  const sources = sourcesFor(category)
  const results = await Promise.allSettled(sources.map(s => fetchFeed(s)))

  const items: RawItem[] = []
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      items.push(...result.value)
    } else {
      console.error(`[news] lähde epäonnistui: ${sources[i].name}`, result.reason)
    }
  })
  return items
}

/**
 * Päivittää yhden kategorian: hakee kaikki lähteet, tiivistää vain uudet
 * artikkelit (linkin perusteella), yhdistää vanhaan listaan ja kirjoittaa
 * välimuistiin. Yhden lähteen kaatuminen ei estä muiden päivitystä.
 */
export async function refreshCategory(category: Category): Promise<{ total: number; new: number }> {
  const [raw, existing] = await Promise.all([
    fetchCategoryRaw(category),
    readCached<Article[]>(cacheKeyFor(category)),
  ])

  const existingArticles = existing?.data ?? []
  const existingIds = new Set(existingArticles.map(a => a.id))

  // Sama linkki voi tulla useasta lähteestä tai samasta feedistä kahdesti — poimitaan yksi per linkki.
  const seen = new Set<string>()
  const newRaw = raw.filter(item => {
    const id = articleId(item.link)
    if (existingIds.has(id) || seen.has(id)) return false
    seen.add(id)
    return true
  })

  let newArticles: Article[] = []
  if (newRaw.length > 0) {
    const summaries = await summarizeArticles(newRaw)
    newArticles = newRaw.map((item, i) => ({
      id: articleId(item.link),
      category,
      sourceId: item.sourceId,
      sourceName: item.sourceName,
      title: item.title,
      link: item.link,
      summary: summaries[i]?.summary || item.description.slice(0, 200),
      tags: summaries[i]?.tags ?? [],
      publishedAt: item.publishedAt,
      summarizedAt: Date.now(),
      kind: item.sourceId === 'mark-moss-youtube' ? 'video' : 'article',
    }))
  }

  const merged = [...newArticles, ...existingArticles]
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    .slice(0, MAX_ARTICLES)

  await writeCached(cacheKeyFor(category), merged, TTL_SECONDS)

  return { total: merged.length, new: newArticles.length }
}
