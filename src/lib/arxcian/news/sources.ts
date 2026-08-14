import type { Category, Source } from './types'

/**
 * RSS-lähteet kategorioittain. Kaikki testattu toimiviksi käsin ennen
 * lisäystä — osa alkuperäisistä ehdokkaista (Investopedia, Harvard Health
 * Blog, Medical News Today, History Today) oli poissa käytöstä tai esti
 * botit, ja korvattiin toimivilla vaihtoehdoilla.
 *
 * Aihepiirit rajattiin 12.8.2026 kuuteen: maailma, konfliktit, bisnes,
 * sijoittaminen, teknologia, AI. Terveys ja historia poistettiin.
 * Konfliktit-kategorian ehdokkaista hylättiin ReliefWeb (kuvaus on
 * dokumenttimetadataa, ei artikkelitekstiä), Crisis Group (otsikot ovat
 * tietokantarivejä muotoa "Bahrain 29 July 2026 #1") ja GDACS (391
 * konealertia per haku — kohinaa ja turhaa tiivistyskulua).
 *
 * Uuden lähteen lisäys: lisää rivi tähän, ei muualle.
 */
export const SOURCES: Record<Category, Source[]> = {
  maailma: [
    { id: 'bbc-world', name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', format: 'rss2' },
    { id: 'guardian-world', name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', format: 'rss2' },
    { id: 'npr-world', name: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml', format: 'rss2' },
  ],
  konfliktit: [
    { id: 'un-news-peace', name: 'UN News', url: 'https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml', format: 'rss2' },
    { id: 'guardian-middleeast', name: 'The Guardian', url: 'https://www.theguardian.com/world/middleeast/rss', format: 'rss2' },
    { id: 'guardian-disasters', name: 'The Guardian', url: 'https://www.theguardian.com/world/natural-disasters/rss', format: 'rss2' },
  ],
  bisnes: [
    { id: 'cnbc-business', name: 'CNBC', url: 'https://www.cnbc.com/id/10001147/device/rss/rss.html', format: 'rss2' },
    { id: 'bbc-business', name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', format: 'rss2' },
    { id: 'cnbc-tech-business', name: 'CNBC Tech', url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html', format: 'rss2' },
    { id: 'cnbc-wealth', name: 'CNBC Wealth', url: 'https://www.cnbc.com/id/10001054/device/rss/rss.html', format: 'rss2' },
    { id: 'cnbc-realestate', name: 'CNBC Real Estate', url: 'https://www.cnbc.com/id/10000115/device/rss/rss.html', format: 'rss2' },
  ],
  sijoittaminen: [
    { id: 'marketwatch-top-inv', name: 'MarketWatch', url: 'https://www.marketwatch.com/rss/topstories', format: 'rss2' },
    { id: 'yahoo-finance', name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex', format: 'rss2' },
    { id: 'motley-fool', name: 'The Motley Fool', url: 'https://www.fool.com/feeds/index.aspx', format: 'rss2' },
  ],
  teknologia: [
    { id: 'theverge', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', format: 'atom' },
    { id: 'arstechnica', name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', format: 'rss2' },
    { id: 'techcrunch', name: 'TechCrunch', url: 'https://techcrunch.com/feed/', format: 'rss2' },
  ],
  ai: [
    { id: 'mit-tech-review-ai', name: 'MIT Technology Review', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', format: 'rss2' },
    { id: 'venturebeat-ai', name: 'VentureBeat', url: 'https://venturebeat.com/category/ai/feed/', format: 'rss2' },
    { id: 'theverge-ai', name: 'The Verge', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', format: 'atom' },
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
