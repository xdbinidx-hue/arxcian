import Anthropic from '@anthropic-ai/sdk'
import { MODEL_NEWS_SUMMARY } from '@/lib/arxcian/models'
import type { RawItem } from './types'

/**
 * Montako tuoreinta ehdokasta malli arvioi yhdellä hakukerralla. Rajaa
 * kehotteen koon: viisi lähdettä tuottaa helposti toistasataa riviä, eikä
 * vanhimpien joukosta enää löydy "tärkeintä tänään" -uutista.
 */
export const CANDIDATE_LIMIT = 40

/** Ehdokkaan kuvaus katkaistaan tähän — riittää tärkeyden arviointiin. */
const DESCRIPTION_CHARS = 300

export type Curated = {
  /** Ehdokkaan indeksi siinä taulukossa joka annettiin curateArticles-kutsulle. */
  index: number
  summary: string
  tags: string[]
}

let client: Anthropic | null = null
function getClient() {
  if (!client) client = new Anthropic()
  return client
}

function systemPrompt(limit: number): string {
  return `Valitset ja tiivistät englanninkielisiä uutisartikkeleita suomeksi arxcian-uutiskoosteeseen.

Saat numeroidun listan ehdokkaita. Valitse niistä ${limit} tärkeintä:
- Painota laajaa vaikutusta ja merkittävyyttä: mitä lukija haluaa tietää tänään.
- Ohita rutiinipäivitykset, mielipidekirjoitukset, listajutut, arvostelut ja mainokset.
- Älä valitse kahta juttua samasta tapahtumasta — valitse niistä kattavin.

Jokaisesta valitsemastasi:
- index: ehdokkaan numero listalta
- summary: 1-2 lauseen tiivistelmä suomeksi. Kerro mitä tapahtui, älä toista otsikkoa.
- tags: 2-4 lyhyttä pienaakkosista tägiä suomeksi (esim. "tekoäly", "markkinat", "konflikti").

Palauta täsmälleen ${limit} kohtaa tärkeysjärjestyksessä, tärkein ensin.`
}

const SCHEMA = {
  type: 'object' as const,
  properties: {
    items: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          index: { type: 'integer' as const },
          summary: { type: 'string' as const },
          tags: { type: 'array' as const, items: { type: 'string' as const } },
        },
        required: ['index', 'summary', 'tags'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
}

function buildUserPrompt(items: RawItem[], limit: number): string {
  const numbered = items
    .map((item, i) => {
      const description = item.description.slice(0, DESCRIPTION_CHARS) || '(ei kuvausta)'
      return `${i + 1}. OTSIKKO: ${item.title}\n   LÄHDE: ${item.sourceName}\n   KUVAUS: ${description}`
    })
    .join('\n\n')
  return `Valitse ja tiivistä ${limit} tärkeintä näistä ${items.length} ehdokkaasta:\n\n${numbered}`
}

/**
 * Malli voi palauttaa saman numeron kahdesti tai numeron listan ulkopuolelta,
 * jolloin väärä artikkeli saisi väärän tiivistelmän. Siivotaan siksi ennen
 * kuin tulosta käytetään: vain kelvolliset ja uniikit indeksit läpi.
 */
function sanitize(raw: Curated[], candidateCount: number, limit: number): Curated[] {
  const seen = new Set<number>()
  const clean: Curated[] = []

  for (const item of raw) {
    const index = Math.trunc(item.index) - 1 // kehotteessa numerointi alkaa ykkösestä
    if (!Number.isFinite(index) || index < 0 || index >= candidateCount) continue
    if (seen.has(index)) continue
    seen.add(index)
    clean.push({ index, summary: item.summary ?? '', tags: Array.isArray(item.tags) ? item.tags : [] })
    if (clean.length === limit) break
  }

  return clean
}

/** Varasuunnitelma: ilman mallia otetaan tuoreimmat, ilman tiivistelmää. */
function newestWithoutSummary(candidateCount: number, limit: number): Curated[] {
  return Array.from({ length: Math.min(limit, candidateCount) }, (_, index) => ({
    index,
    summary: '',
    tags: [],
  }))
}

/**
 * Valitsee ehdokkaista tärkeimmät ja tiivistää ne samalla kutsulla.
 *
 * Yhdistäminen on tarkoituksellista: tiivistys tehdään vain valituille, joten
 * kutsuja on yksi per kategoria per haku eikä kymmeniä. Kutsujan on annettava
 * ehdokkaat tuoreimmasta vanhimpaan — varasuunnitelma nojaa siihen.
 */
export async function curateArticles(candidates: RawItem[], limit: number): Promise<Curated[]> {
  if (candidates.length === 0) return []

  // Ehdokkaita voi olla vähemmän kuin poimittavia. Silloin valittavaa ei ole,
  // mutta tiivistelmä halutaan silti koko joukolle.
  const take = Math.min(limit, candidates.length)

  try {
    const response = await getClient().messages.create({
      model: MODEL_NEWS_SUMMARY,
      max_tokens: 4096,
      system: systemPrompt(take),
      messages: [{ role: 'user', content: buildUserPrompt(candidates, take) }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    })

    const block = response.content.find(b => b.type === 'text')
    if (!block || block.type !== 'text') throw new Error('Ei tekstivastausta tiivistäjältä')

    const parsed = JSON.parse(block.text) as { items: Curated[] }
    const clean = sanitize(parsed.items ?? [], candidates.length, take)
    if (clean.length === 0) throw new Error('Malli ei palauttanut yhtään kelvollista indeksiä')

    return clean
  } catch (error) {
    console.error(`[summarize] valinta epäonnistui (${candidates.length} ehdokasta)`, error)
    // Tyhjä tiivistelmä on parempi kuin tyhjä kategoria: kutsuja käyttää
    // silloin lähteen omaa kuvausta.
    return newestWithoutSummary(candidates.length, take)
  }
}
