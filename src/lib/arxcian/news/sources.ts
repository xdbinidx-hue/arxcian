import type { Category, Source } from './types'

/**
 * RSS-lähteet kategorioittain. Kaikki testattu toimiviksi käsin ennen
 * lisäystä (2026-07-25) — osa alkuperäisistä ehdokkaista (Investopedia,
 * Harvard Health Blog, Medical News Today, History Today) oli poissa
 * käytöstä tai esti botit, ja korvattiin toimivilla vaihtoehdoilla.
 *
 * Uuden lähteen lisäys: lisää rivi tähän, ei muualle.
 */
export const SOURCES: Record<Category, Source[]> = {
  bisnes: [
    { id: 'cnbc-business', name: 'CNBC', url: 'https://www.cnbc.com/id/10001147/device/rss/rss.html', format: 'rss2' },
    { id: 'marketwatch-top', name: 'MarketWatch', url: 'https://www.marketwatch.com/rss/topstories', format: 'rss2' },
    { id: 'bbc-business', name: 'BBC Business', url: 'http://feeds.bbci.co.uk/news/business/rss.xml', format: 'rss2' },
  ],
  ai: [
    { id: 'mit-tech-review-ai', name: 'MIT Technology Review', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', format: 'rss2' },
    { id: 'venturebeat-ai', name: 'VentureBeat', url: 'https://venturebeat.com/category/ai/feed/', format: 'rss2' },
    { id: 'theverge-ai', name: 'The Verge', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', format: 'atom' },
  ],
  sijoittaminen: [
    { id: 'marketwatch-top-inv', name: 'MarketWatch', url: 'https://www.marketwatch.com/rss/topstories', format: 'rss2' },
    { id: 'yahoo-finance', name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex', format: 'rss2' },
    { id: 'motley-fool', name: 'The Motley Fool', url: 'https://www.fool.com/feeds/index.aspx', format: 'rss2' },
  ],
  terveys: [
    { id: 'npr-health', name: 'NPR Health', url: 'https://feeds.npr.org/1128/rss.xml', format: 'rss2' },
    { id: 'stat-news', name: 'STAT News', url: 'https://www.statnews.com/feed/', format: 'rss2' },
    { id: 'sciencedaily-health', name: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/health_medicine.xml', format: 'rss2' },
  ],
  teknologia: [
    { id: 'theverge', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', format: 'atom' },
    { id: 'arstechnica', name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', format: 'rss2' },
    { id: 'techcrunch', name: 'TechCrunch', url: 'https://techcrunch.com/feed/', format: 'rss2' },
  ],
  historia: [
    { id: 'smithsonian-history', name: 'Smithsonian', url: 'https://www.smithsonianmag.com/rss/history/', format: 'rss2' },
    { id: 'history-extra', name: 'HistoryExtra', url: 'https://www.historyextra.com/feed/', format: 'rss2' },
    { id: 'world-history-encyclopedia', name: 'World History Encyclopedia', url: 'https://www.worldhistory.org/rss/news/', format: 'rss2' },
  ],
}

/** Mark Moss on oma lähteensä, mutta näkyy Sijoittaminen-kategoriassa video-tägillä. */
export const MARK_MOSS_SOURCE: Source = {
  id: 'mark-moss-youtube',
  name: 'Mark Moss',
  url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC9ZM3N0ybRtp44-WLqsW3iQ',
  format: 'atom',
  kind: 'video',
}

export const MARK_MOSS_CATEGORY: Category = 'sijoittaminen'

export function sourcesFor(category: Category): Source[] {
  const base = SOURCES[category]
  return category === MARK_MOSS_CATEGORY ? [...base, MARK_MOSS_SOURCE] : base
}
