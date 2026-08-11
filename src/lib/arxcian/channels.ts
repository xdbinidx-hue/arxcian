import { XMLParser } from 'fast-xml-parser'
import { fetchAndCache } from './cache'

/**
 * Seurattujen YouTube-kanavien uusimmat videot hubin KANAVAT-paneeliin.
 *
 * Sama julkinen RSS-syöte kuin trading/ict.ts käyttää — ei API-avainta eikä
 * kiintiötä. ICT on tarkoituksella yhä omassa tiedostossaan: Trading-osio
 * näyttää siitä koko videolistan, kun taas tämä hakee yhden tuoreimman per
 * kanava. Sama syöte kahdessa käyttötarkoituksessa, eri muoto.
 *
 * Kanava-ID:t on ratkaistu kanavasivuilta ja syötteet varmistettu käsin
 * toimiviksi 11.8.2026. ID on pysyvä vaikka kanava vaihtaisi nimeä tai
 * @-tunnusta, joten se on oikea asia kovakoodata — @-tunnus ei olisi.
 */

export type ChannelVideo = {
  /** Kanavan näyttönimi, ei videon julkaisijakenttä */
  channel: string
  id: string
  title: string
  link: string
  thumbnail: string
  publishedAt: number | null
}

type Channel = { name: string; channelId: string }

const CHANNELS: readonly Channel[] = [
  { name: 'Joe Rogan', channelId: 'UCzQUP1qoWDoEbmsQxvdjxgQ' },
  { name: 'Alex Hormozi', channelId: 'UCrvchO1h6lWZAuGaa1LqX9Q' },
  { name: 'ICT Trading', channelId: 'UCtjxa77NqamhVC8atV85Rog' },
  { name: 'Dan Martell', channelId: 'UCA-mWX9CvCTVFWRMb9bKc9w' },
  { name: 'Iman Gadzhi', channelId: 'UC-l4IawN1e_eHns1NmkoKTg' },
]

export const CHANNELS_CACHE_KEY = 'hub:channels'

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

function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const inner = (value as { __text?: unknown }).__text
    if (typeof inner === 'string') return inner
  }
  return ''
}

/** Uusin video yhdeltä kanavalta, tai null jos syöte ei vastaa. */
async function fetchLatest(channel: Channel): Promise<ChannelVideo | null> {
  const res = await fetch(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.channelId}`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; arxcian/1.0)' } },
  )
  if (!res.ok) throw new Error(`${channel.name}: HTTP ${res.status}`)

  const doc = parser.parse(await res.text())
  const rawEntries = doc?.feed?.entry
  const entries: unknown[] = Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : []
  const first = entries[0] as Record<string, unknown> | undefined
  if (!first) return null

  const link = first.link as { '@_href'?: string } | undefined
  const mediaGroup = first['media:group'] as Record<string, unknown> | undefined
  const published = Date.parse(text(first.published))

  return {
    channel: channel.name,
    id: text(first['yt:videoId']),
    title: text(first.title),
    link: link?.['@_href'] ?? '',
    thumbnail: attr(mediaGroup?.['media:thumbnail'], 'url'),
    publishedAt: Number.isNaN(published) ? null : published,
  }
}

/**
 * Kaikkien kanavien tuoreimmat, uusin ensin.
 *
 * Yksi kaatuva kanava ei vie muita mukanaan: YouTube palauttaa ajoittain 404:n
 * yksittäiselle syötteelle, eikä koko paneelin pidä kadota sen takia.
 * Promise.allSettled eikä Promise.all juuri tästä syystä.
 */
async function fetchChannels(): Promise<ChannelVideo[]> {
  const settled = await Promise.allSettled(CHANNELS.map(fetchLatest))

  const videos: ChannelVideo[] = []
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      if (result.value) videos.push(result.value)
    } else {
      console.error(`[channels] ${CHANNELS[i].name} epäonnistui`, result.reason)
    }
  })

  return videos.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
}

export async function getChannelVideos() {
  return fetchAndCache({ key: CHANNELS_CACHE_KEY, ttl: TTL_SECONDS }, fetchChannels)
}
