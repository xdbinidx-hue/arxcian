import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { currentUser } from '@/lib/session'
import { checkRateLimit } from '@/lib/arxcian/rateLimit'
import { MODEL_ASSISTANT } from '@/lib/arxcian/models'
import { latestAcrossCategories } from '@/lib/arxcian/news/digest'
import { CATEGORIES, type Category } from '@/lib/arxcian/news/types'
import { watchlistSnapshot } from '@/lib/arxcian/trading/snapshot'
import { getSentiment } from '@/lib/arxcian/trading/sentiment'
import { getAlerts } from '@/lib/arxcian/trading/alerts'

/**
 * Chat-tyylinen AI-avustaja arxcianin datalla. Kaikki työkalut lukevat vain
 * välimuistista (readCached/getQuotes-polkuja pitkin) — eivät koskaan hae
 * suoraan ulkoisesta lähteestä. Avustajan ei saa antaa kuormittaa Yahoo
 * Financea tai RSS-syötteitä omilla kutsuillaan; se on cronin tehtävä.
 */

const MAX_TOKENS = 1024
const RATE_LIMIT = 30
const MAX_TOOL_ROUNDS = 4

const SYSTEM_PROMPT = `Olet arxcianin avustaja. Vastaa suomeksi, ytimekkäästi.

Käytä AINA työkaluja datan hakuun — älä koskaan arvaa lukuja, uutisia tai kursseja muistista.
Jos saatavilla oleva data ei riitä kysymykseen vastaamiseen, sano se suoraan sen sijaan että keksit.`

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_latest_news',
    description:
      'Hakee uusimmat uutisartikkelit arxcianin uutiskoosteesta. Voi rajata yhteen kategoriaan tai hakea kaikista kategorioista sekoitettuna.',
    input_schema: {
      type: 'object',
      properties: {
        n: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'Kuinka monta artikkelia palautetaan.',
        },
        category: {
          type: 'string',
          enum: [...CATEGORIES],
          description: 'Rajaa hakemaan vain tämä kategoria. Jätä pois hakeaksesi kaikista kategorioista.',
        },
      },
      required: ['n'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_watchlist',
    description: 'Hakee koko watchlistin nykyhinnoin, muutoksin ja prosenttimuutoksin.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_sentiment',
    description: 'Hakee markkinoiden Fear & Greed -sentimenttimittarin nykyarvon.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_alerts',
    description: 'Hakee kaikki asetetut hintahälytykset ja niiden tilan (lauennut/ei).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
]

let client: Anthropic | null = null
function getClient() {
  if (!client) client = new Anthropic()
  return client
}

/** Poimii get_latest_news-työkalun syötteestä kelvolliset arvot, muu jää varaan. */
function newsInput(input: unknown): { n: number; category: Category | undefined } {
  const raw = (input ?? {}) as { n?: unknown; category?: unknown }
  const parsed = Math.round(Number(raw.n))
  const n = Math.min(20, Math.max(1, Number.isFinite(parsed) ? parsed : 5))
  const category =
    typeof raw.category === 'string' && (CATEGORIES as readonly string[]).includes(raw.category)
      ? (raw.category as Category)
      : undefined
  return { n, category }
}

async function runTool(name: string, input: unknown): Promise<unknown> {
  switch (name) {
    case 'get_latest_news': {
      const { n, category } = newsInput(input)
      return latestAcrossCategories(n, category)
    }
    case 'get_watchlist':
      return watchlistSnapshot()
    case 'get_sentiment': {
      const fetched = await getSentiment()
      return { ...fetched.data, fetchedAt: fetched.fetchedAt, source: fetched.source }
    }
    case 'get_alerts':
      return getAlerts()
    default:
      throw new Error(`Tuntematon työkalu: ${name}`)
  }
}

async function toolResultFor(block: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam> {
  try {
    const result = await runTool(block.name, block.input)
    return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) }
  } catch (error) {
    console.error(`[api/arxcian/assistant] työkalu epäonnistui: ${block.name}`, error)
    return {
      type: 'tool_result',
      tool_use_id: block.id,
      content: 'Työkalun suoritus epäonnistui.',
      is_error: true,
    }
  }
}

function textOf(response: Anthropic.Message): string | null {
  const block = response.content.find(b => b.type === 'text')
  return block && block.type === 'text' ? block.text : null
}

/**
 * Työkalusilmukka: enintään MAX_TOOL_ROUNDS kierrosta työkalukutsuja. Jos
 * malli haluaisi yhä kutsua työkaluja kierrosten loputtua, viimeinen kutsu
 * tehdään ilman tools-parametria — malli joutuu tällöin vastaamaan sillä
 * datalla joka on jo kerätty, sen sijaan että kierre jatkuisi loputtomiin.
 */
async function runAssistant(prompt: string): Promise<string | null> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }]

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await getClient().messages.create({
      model: MODEL_ASSISTANT,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    })

    if (response.stop_reason !== 'tool_use') return textOf(response)

    messages.push({ role: 'assistant', content: response.content })
    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )
    const results = await Promise.all(toolUses.map(toolResultFor))
    messages.push({ role: 'user', content: results })
  }

  const final = await getClient().messages.create({
    model: MODEL_ASSISTANT,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages,
  })
  return textOf(final)
}

export async function POST(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  if (!(await checkRateLimit('assistant', user, RATE_LIMIT))) {
    return NextResponse.json(
      { error: 'Liikaa pyyntöjä, yritä myöhemmin uudelleen' },
      { status: 429 },
    )
  }

  let prompt: unknown
  try {
    ;({ prompt } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Virheellinen pyyntö' }, { status: 400 })
  }

  if (typeof prompt !== 'string' || !prompt.trim()) {
    return NextResponse.json({ error: 'prompt vaaditaan' }, { status: 400 })
  }

  try {
    const text = await runAssistant(prompt)
    if (text === null) {
      console.error('[api/arxcian/assistant] vastauksessa ei tekstilohkoa')
      return NextResponse.json({ error: 'Generointi epäonnistui' }, { status: 502 })
    }
    return NextResponse.json({ text })
  } catch (error) {
    // Tarkempi syy vain palvelimen lokiin: Anthropicin virhevastaus voi
    // sisältää organisaatio- tai avaintietoja, eikä sellaista palauteta
    // selaimeen.
    console.error('[api/arxcian/assistant] generointi epäonnistui', error)
    return NextResponse.json({ error: 'Generointi epäonnistui' }, { status: 500 })
  }
}
