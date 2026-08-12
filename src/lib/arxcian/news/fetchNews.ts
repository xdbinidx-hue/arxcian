import { fetchFeed } from './rss'
import { sourcesFor } from './sources'
import { curateArticles, CANDIDATE_LIMIT } from './summarize'
import { readCached, writeCached } from '../cache'
import { isoDateHelsinki } from '../time'
import type { Article, Category, RawItem } from './types'

/** Montako uutista poimitaan yhdellä hakukerralla. Neljä ajoa/vrk = 20 per aihe. */
export const PER_RUN = 5

/**
 * Kuinka monen päivän kirjasto säilytetään: tämä päivä ja edellinen.
 *
 * Edellinen päivä on mukana kahdesta syystä. Aamulla ennen kello kahdeksan
 * hakua tämän päivän kirjasto on tyhjä, jolloin sivu näyttäisi muuten
 * tyhjää. Lisäksi vertailu vanhoihin linkkeihin estää saman jutun
 * poimimisen uudelleen keskiyön yli, kun se roikkuu syötteessä vielä
 * seuraavana aamuna.
 */
const KEEP_DAYS = 2

/** Yläraja jos jokin ajaa haun poikkeuksellisen monta kertaa vuorokaudessa. */
const MAX_ARTICLES = 60

// Kirjaston on kestettävä yli vuorokauden vaihteen, muuten eilinen katoaisi
// juuri ennen kuin tämän päivän ensimmäinen haku ehtii täyttää tilalle.
const TTL_SECONDS = 50 * 60 * 60

export function cacheKeyFor(category: Category): string {
  return `news:${category}`
}

/** Yksi artikkeli tunnistetaan linkillä — samaa uutista ei tiivistetä kahdesti. */
function articleId(link: string): string {
  return link
}

/** Päivät jotka kirjastossa säilytetään, tuoreimmasta vanhimpaan. */
function keptDays(): Set<string> {
  const days = new Set<string>()
  for (let i = 0; i < KEEP_DAYS; i++) {
    days.add(isoDateHelsinki(new Date(Date.now() - i * 24 * 60 * 60 * 1000)))
  }
  return days
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
 * Päivittää yhden kategorian päivän kirjaston.
 *
 * Hakee kaikki lähteet, karsii jo kirjastossa olevat, antaa tuoreimmat
 * ehdokkaat mallille joka poimii niistä PER_RUN tärkeintä ja tiivistää ne,
 * ja lisää poiminnat vanhojen jatkoksi. Kirjastoon jäävät vain viimeisten
 * KEEP_DAYS-päivän poiminnat, joten aiemman ajon uutiset eivät katoa vaikka
 * niitä ei ehtisi lukea heti. Yhden lähteen kaatuminen ei estä päivitystä.
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
  const candidates = raw
    .filter(item => {
      const id = articleId(item.link)
      if (existingIds.has(id) || seen.has(id)) return false
      seen.add(id)
      return true
    })
    // curateArticles olettaa ehdokkaat tuoreimmasta vanhimpaan, ja tuoreimmista
    // myös löytyy se mitä "tärkein tänään" tarkoittaa.
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    .slice(0, CANDIDATE_LIMIT)

  const curated = await curateArticles(candidates, PER_RUN)
  const newArticles: Article[] = curated.map(pick => {
    const item = candidates[pick.index]
    return {
      id: articleId(item.link),
      category,
      sourceId: item.sourceId,
      sourceName: item.sourceName,
      title: item.title,
      link: item.link,
      summary: pick.summary || item.description.slice(0, 200),
      tags: pick.tags,
      publishedAt: item.publishedAt,
      summarizedAt: Date.now(),
      kind: item.sourceId === 'mark-moss-youtube' ? 'video' : 'article',
    }
  })

  // Kirjastopäivä on hakuhetki (summarizedAt), ei julkaisuhetki: uutinen
  // kuuluu siihen päivään jolloin se nostettiin luettavaksi.
  const days = keptDays()
  const merged = [...newArticles, ...existingArticles]
    .filter(a => days.has(isoDateHelsinki(new Date(a.summarizedAt))))
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    .slice(0, MAX_ARTICLES)

  await writeCached(cacheKeyFor(category), merged, TTL_SECONDS)

  return { total: merged.length, new: newArticles.length }
}
