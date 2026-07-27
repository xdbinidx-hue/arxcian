import { XMLParser } from 'fast-xml-parser'
import { fetchAndCache } from '../cache'
import type { IctVideo } from './types'

// Virallinen ICT-kanava (The Inner Circle Trader, @innercircletrader).
// Kanava-ID varmistettu käsin kanavan sivulta 2026-07-27.
const ICT_CHANNEL_ID = 'UCtjxa77NqamhVC8atV85Rog'
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${ICT_CHANNEL_ID}`

const CACHE_KEY = 'trading:ict-videos'
const TTL_SECONDS = 60 * 60

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '__text',
  trimValues: true,
})

function attr(node: unknown, key: string): string {
  if (node && typeof node === 'object') {
    const v = (node as Record<string, unknown>)[`@_${key}`]
    if (typeof v === 'string') return v
  }
  return ''
}

async function fetchIctVideos(): Promise<IctVideo[]> {
  const res = await fetch(FEED_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; arxcian/1.0)' },
  })
  if (!res.ok) throw new Error(`ICT-kanava: HTTP ${res.status}`)

  const doc = parser.parse(await res.text())
  const rawEntries = doc?.feed?.entry
  const entries: unknown[] = Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : []

  return entries.map(raw => {
    const entry = raw as Record<string, unknown>
    const link = entry.link as { '@_href'?: string } | undefined
    const mediaGroup = entry['media:group'] as Record<string, unknown> | undefined
    const thumbnail = mediaGroup?.['media:thumbnail']

    const publishedRaw = entry.published
    const publishedText = typeof publishedRaw === 'string' ? publishedRaw : ''
    const publishedAt = publishedText ? Date.parse(publishedText) : null

    return {
      id: String((entry['yt:videoId'] as { __text?: string } | string) ?? ''),
      title: String((entry.title as { __text?: string } | string) ?? ''),
      link: link?.['@_href'] ?? '',
      thumbnail: attr(thumbnail, 'url'),
      publishedAt: Number.isNaN(publishedAt) ? null : publishedAt,
    }
  })
}

export async function getIctVideos() {
  return fetchAndCache({ key: CACHE_KEY, ttl: TTL_SECONDS }, fetchIctVideos)
}
