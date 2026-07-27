import Anthropic from '@anthropic-ai/sdk'
import type { RawItem } from './types'

const MODEL = 'claude-haiku-4-5'

// Yksi kutsu tiivistää enintään tämän verran artikkeleita kerralla, jotta
// yksittäinen pyyntö ei kasva liian isoksi kun uutta sisältöä on paljon
// (esim. ensimmäinen ajo, jolloin mikään ei ole vielä välimuistissa).
const BATCH_SIZE = 12

export type Summarized = {
  summary: string
  tags: string[]
}

let client: Anthropic | null = null
function getClient() {
  if (!client) client = new Anthropic()
  return client
}

const SYSTEM_PROMPT = `Tiivistät englanninkielisiä uutisartikkeleita suomeksi arxcian-uutiskoosteeseen.

Jokaisesta artikkelista (otsikko + lähteen oma kuvaus):
- Kirjoita 1-2 lauseen tiivistelmä suomeksi. Kerro mitä tapahtui, älä toista otsikkoa.
- Anna 2-4 lyhyttä pienaakkosista tägiä suomeksi (esim. "tekoäly", "markkinat", "terveys").

Vastaa täsmälleen annetun JSON-skeeman mukaisesti, items-taulukon pituus ja järjestys täsmälleen syötteen mukainen.`

const SCHEMA = {
  type: 'object' as const,
  properties: {
    items: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          summary: { type: 'string' as const },
          tags: { type: 'array' as const, items: { type: 'string' as const } },
        },
        required: ['summary', 'tags'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
}

function buildUserPrompt(items: RawItem[]): string {
  const numbered = items
    .map((item, i) => `${i + 1}. OTSIKKO: ${item.title}\n   KUVAUS: ${item.description || '(ei kuvausta)'}`)
    .join('\n\n')
  return `Tiivistä nämä ${items.length} artikkelia:\n\n${numbered}`
}

async function summarizeBatch(items: RawItem[]): Promise<Summarized[]> {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(items) }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  })

  const block = response.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('Ei tekstivastausta tiivistäjältä')

  const parsed = JSON.parse(block.text) as { items: Summarized[] }
  if (parsed.items.length !== items.length) {
    throw new Error(`Tiivistäjä palautti ${parsed.items.length} riviä, odotettiin ${items.length}`)
  }
  return parsed.items
}

/** Tiivistää artikkelit erissä. Yhden artikkelin epäonnistuminen ei kaada koko työtä. */
export async function summarizeArticles(items: RawItem[]): Promise<Summarized[]> {
  const results: Summarized[] = []

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    try {
      results.push(...(await summarizeBatch(batch)))
    } catch (error) {
      console.error(`[summarize] erä epäonnistui (${batch.length} artikkelia)`, error)
      // Varmistetaan silti oikea pituus: tyhjä tiivistelmä on parempi kuin
      // koko työn kaatuminen yhden erän takia.
      results.push(...batch.map(() => ({ summary: '', tags: [] as string[] })))
    }
  }

  return results
}
