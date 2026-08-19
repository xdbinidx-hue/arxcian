import { XMLParser } from 'fast-xml-parser'
import { fetchAndCache } from '../cache'
import { fetchYoutubeFeed } from '../youtube'
import type { IctVideo } from './types'

// Virallinen ICT-kanava (The Inner Circle Trader, @innercircletrader).
// Kanava-ID varmistettu käsin kanavan sivulta 2026-07-27.
const ICT_CHANNEL_ID = 'UCtjxa77NqamhVC8atV85Rog'
const CACHE_KEY = 'trading:ict-videos'
const TTL_SECONDS = 60 * 60

/**
 * Cron saa odottaa kolme yritystä viiveineen, sivulataus ei.
 *
 * `IctFeed` on palvelinkomponentti ilman Suspense-kääreä, eli se blokkaa koko
 * Trading-sivun renderöinnin. TTL on tunti ja cron ajaa neljästi vuorokaudessa,
 * joten sivulataus osuu usein verkkopolulle — 30 s katto tarkoittaisi 30 s
 * valkoista sivua. Cron-polulla (`force`) katto saa olla väljä, koska siellä
 * uudelleenyritysten on ehdittävä loppuun.
 */
const TIMEOUT_CRON_MS = 30_000
const TIMEOUT_PAGE_MS = 15_000

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
  // Otsakkeet ja uudelleenyritys ovat lib/arxcian/youtube.ts:ssä, yhteisenä
  // kaikille YouTube-kutsujille. Uudelleenyritys on se mikä tässä merkitsee:
  // YouTube rajoittaa Vercelin konesali-IP:tä ajoittain (ks. youtube.ts).
  const doc = parser.parse(await fetchYoutubeFeed(ICT_CHANNEL_ID, 'ICT-kanava'))
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

/** `force` on cronia varten — ilman sitä ajastettu haku lukee vain välimuistin. */
export async function getIctVideos(force = false) {
  return fetchAndCache(
    {
      key: CACHE_KEY,
      ttl: TTL_SECONDS,
      timeout: force ? TIMEOUT_CRON_MS : TIMEOUT_PAGE_MS,
      force,
    },
    fetchIctVideos,
  )
}
