import { XMLParser } from 'fast-xml-parser'
import type { RawItem, Source } from './types'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  cdataPropName: '__cdata',
  textNodeName: '__text',
  trimValues: true,
})

/** Poistaa HTML-tagit ja purkaa entiteetit — riittää syötteen teaser-tekstille. */
function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** fast-xml-parser palauttaa CDATA-sisällön {__cdata: "..."} -muodossa, tekstin suoraan stringinä. */
function textOf(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (typeof obj.__cdata === 'string') return obj.__cdata
    if (typeof obj.__text === 'string') return obj.__text
    // media:group/media:title jne. voivat olla sisäkkäisiä
    if (typeof obj['#text'] === 'string') return obj['#text']
  }
  return ''
}

function parseDate(input: string): number | null {
  if (!input) return null
  const ms = Date.parse(input)
  return Number.isNaN(ms) ? null : ms
}

function parseRss2(xml: string, source: Source): RawItem[] {
  const doc = parser.parse(xml)
  const rawItems = doc?.rss?.channel?.item
  const items: unknown[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : []

  return items.map(raw => {
    const item = raw as Record<string, unknown>
    const description = textOf(item.description) || textOf(item['content:encoded'])
    return {
      sourceId: source.id,
      sourceName: source.name,
      title: stripHtml(textOf(item.title)),
      link: typeof item.link === 'string' ? item.link : textOf(item.link),
      description: stripHtml(description).slice(0, 1200),
      publishedAt: parseDate(textOf(item.pubDate) || textOf(item['dc:date'])),
    }
  })
}

function parseAtom(xml: string, source: Source): RawItem[] {
  const doc = parser.parse(xml)
  const rawEntries = doc?.feed?.entry
  const entries: unknown[] = Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : []

  return entries.map(raw => {
    const entry = raw as Record<string, unknown>
    const link = entry.link as { '@_href'?: string } | { '@_href'?: string }[] | undefined
    const href = Array.isArray(link) ? link[0]?.['@_href'] : link?.['@_href']
    const mediaGroup = entry['media:group'] as Record<string, unknown> | undefined
    const description = mediaGroup ? textOf(mediaGroup['media:description']) : textOf(entry.summary)

    return {
      sourceId: source.id,
      sourceName: source.name,
      title: stripHtml(textOf(entry.title)),
      link: href ?? '',
      description: stripHtml(description).slice(0, 1200),
      publishedAt: parseDate(textOf(entry.published) || textOf(entry.updated)),
    }
  })
}

/** Hakee ja jäsentää yhden lähteen. Ei välimuistita — kutsuja hoitaa sen. */
export async function fetchFeed(source: Source, timeoutMs = 12_000): Promise<RawItem[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(source.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; arxcian/1.0)' },
    })
    if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`)
    const xml = await res.text()
    const items = source.format === 'atom' ? parseAtom(xml, source) : parseRss2(xml, source)
    return items.filter(i => i.link && i.title)
  } finally {
    clearTimeout(timer)
  }
}
