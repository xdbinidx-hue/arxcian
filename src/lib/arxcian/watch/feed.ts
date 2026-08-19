import { XMLParser } from 'fast-xml-parser'
import { fetchYoutubeFeed } from '../youtube'
import type { WatchItem, WatchSource } from './types'

/**
 * Yksi normalisoitu syötteenhakija: YouTube-Atom ja RSS2 samaan muotoon.
 *
 * **Rakentuu [youtube.ts](../youtube.ts):n päälle eikä korvaa sitä.** Se on
 * jo ainoa paikka jossa YouTuben otsakkeet, uudelleenyritys ja aikakatkaisu
 * elävät (19.8.2026); tämä lisää vain RSS2-normalisoinnin. Toinen kopio
 * YouTube-hausta olisi juuri se ongelma joka äsken poistettiin.
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  cdataPropName: '__cdata',
  textNodeName: '__text',
  trimValues: true,
})

/** Muu kuin YouTube-syöte. Oma aikakatkaisu, koska mikään ei rajaa sitä ylempänä. */
const RSS_TIMEOUT_MS = 12_000

function textOf(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (typeof o.__cdata === 'string') return o.__cdata
    if (typeof o.__text === 'string') return o.__text
    if (typeof o['#text'] === 'string') return o['#text']
  }
  return ''
}

function parseDate(input: string): number | null {
  if (!input) return null
  const ms = Date.parse(input)
  return Number.isNaN(ms) ? null : ms
}

function entriesOf(node: unknown): unknown[] {
  return Array.isArray(node) ? node : node ? [node] : []
}

function fromYoutube(xml: string, source: WatchSource): WatchItem[] {
  const doc = parser.parse(xml)
  return entriesOf(doc?.feed?.entry).map(raw => {
    const e = raw as Record<string, unknown>
    const link = e.link as { '@_href'?: string } | undefined
    return {
      // videoId on pysyvä. Linkki voisi muuttua parametreiltaan ja tekisi
      // samasta videosta uuden joka kierroksella.
      id: textOf(e['yt:videoId']),
      lista: source.lista,
      source: source.nimi,
      title: textOf(e.title),
      link: link?.['@_href'] ?? '',
      publishedAt: parseDate(textOf(e.published)),
      owner: source.owner,
    }
  })
}

function fromRss(xml: string, source: WatchSource): WatchItem[] {
  const doc = parser.parse(xml)

  // RSS2 ja Atom samassa haarassa: lähdelistassa on vain "rss", eikä Albinin
  // kuulu tietää kumpaa muotoa syöte sattuu käyttämään.
  const rssItems = entriesOf(doc?.rss?.channel?.item)
  if (rssItems.length > 0) {
    return rssItems.map(raw => {
      const it = raw as Record<string, unknown>
      const link = typeof it.link === 'string' ? it.link : textOf(it.link)
      return {
        id: link,
        lista: source.lista,
        source: source.nimi,
        title: textOf(it.title),
        link,
        publishedAt: parseDate(textOf(it.pubDate) || textOf(it['dc:date'])),
        owner: source.owner,
      }
    })
  }

  return entriesOf(doc?.feed?.entry).map(raw => {
    const e = raw as Record<string, unknown>
    const l = e.link as { '@_href'?: string } | { '@_href'?: string }[] | undefined
    const href = Array.isArray(l) ? l[0]?.['@_href'] : l?.['@_href']
    return {
      id: href ?? textOf(e.id),
      lista: source.lista,
      source: source.nimi,
      title: textOf(e.title),
      link: href ?? '',
      publishedAt: parseDate(textOf(e.published) || textOf(e.updated)),
      owner: source.owner,
    }
  })
}

/**
 * Hakee ja normalisoi yhden lähteen. Heittää jos haku kaatuu — kutsuja
 * päättää mitä yhden lähteen kaatuminen tarkoittaa.
 */
export async function fetchWatchFeed(source: WatchSource): Promise<WatchItem[]> {
  if (source.tyyppi === 'youtube') {
    const xml = await fetchYoutubeFeed(source.tunniste, source.nimi)
    return fromYoutube(xml, source).filter(i => i.id && i.title)
  }

  const res = await fetch(source.tunniste, {
    signal: AbortSignal.timeout(RSS_TIMEOUT_MS),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; arxcian/1.0)' },
  })
  if (!res.ok) throw new Error(`${source.nimi}: HTTP ${res.status}`)

  return fromRss(await res.text(), source).filter(i => i.id && i.title)
}
