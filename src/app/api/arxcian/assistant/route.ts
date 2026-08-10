import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { currentUser } from '@/lib/session'
import { checkRateLimit } from '@/lib/arxcian/rateLimit'
import { MODEL_ASSISTANT } from '@/lib/arxcian/models'
import { latestAcrossCategories } from '@/lib/arxcian/news/digest'
import { CATEGORIES, type Category } from '@/lib/arxcian/news/types'
import { watchlistSnapshot } from '@/lib/arxcian/trading/snapshot'
import { readCachedSentiment } from '@/lib/arxcian/trading/sentiment'
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

// Käyttäjän oma valinta: assistentti vastaa englanniksi, koska ääni (ks.
// lib/arxcian/tts.ts) on brittienglantia. Muu sovellus pysyy suomeksi
// CLAUDE.md:n mukaisesti — tämä on tietoinen, rajattu poikkeus.
//
// Kielivaatimus on erikseen ja perusteluineen, koska pelkkä "Answer in English"
// ei riittänyt: suomenkielinen kysymys ja suomenkieliset lähdeartikkelit
// saivat mallin vastaamaan suomeksi, jolloin brittiääni luki suomea.
//
// Muotovaatimus on samoin oma kappaleensa: vastaus sekä luetaan ääneen että
// näytetään sellaisenaan ilman markdown-renderöijää, joten korostusmerkinnät
// näkyvät tähtinä ruudulla ja kuuluvat ääneen luettuina.
const SYSTEM_PROMPT = `You are arxcian's assistant. Answer concisely.

Always answer in English, even when the question or the source articles are in
Finnish. The answer is read aloud by a British English voice, so any other
language is mispronounced. Translate Finnish headlines into English instead of
quoting them as they are.

Write plain prose meant to be spoken aloud: no markdown, no asterisks, no
bullet characters, no headings, no emojis. Separate items with sentences.

ALWAYS use tools to fetch data — never guess numbers, news, or quotes from memory.
Use web search when a question covers something the other tools don't — general
knowledge or current events outside arxcian's own news digest and data.
If the available data isn't enough to answer, say so directly instead of making things up.`

const TOOLS = [
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
  {
    type: 'web_search_20260209',
    name: 'web_search',
    max_uses: 3,
  },
] satisfies Anthropic.Messages.ToolUnion[]

let client: Anthropic | null = null
function getClient() {
  if (!client) client = new Anthropic()
  return client
}

/** Suoratoiston mediatyyppi. Asiakas pyytää tätä Accept-otsakkeella. */
const NDJSON_TYPE = 'application/x-ndjson'

const encoder = new TextEncoder()

/**
 * Yksi NDJSON-tapahtuma. Rivinvaihto erottaa tapahtumat, jotta selain voi
 * jäsentää virtaa palasittain — verkkopala voi katketa keskeltä riviä, ja
 * rivipohjainen muoto tekee vajaan lopun käsittelystä yksiselitteistä.
 *
 * Virhe kulkee tapahtumana eikä statuskoodina, koska ensimmäisen tavun
 * lähdettyä statusrivi on jo matkalla eikä sitä voi enää muuttaa.
 */
function encodeEvent(event: { type: 'text' | 'error'; value: string }): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`)
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
      const cached = await readCachedSentiment()
      if (!cached) return { error: 'Sentimenttidataa ei ole vielä välimuistissa.' }
      return { ...cached.data, fetchedAt: cached.fetchedAt, source: cached.source }
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

/**
 * Työkalusilmukka, joka suoratoistaa tekstin sitä mukaa kun malli tuottaa sen.
 *
 * Mitattuna vastauksen generointi kesti yli 13 sekuntia, eikä siitä näkynyt
 * mitään ennen kuin viimeinenkin token oli valmis — koettu viive oli siis koko
 * generoinnin mittainen. Jokainen kierros ajetaan nyt streamina ja tekstipalat
 * lähtevät selaimeen heti. Työkalukierrokset eivät tuota tekstiä, joten
 * käytännössä virtaa viimeinen kierros; poikkeuksena malli joka selostaa
 * tekemistään ennen työkalukutsua, ja sekin on käyttäjälle hyödyllistä.
 *
 * Enintään MAX_TOOL_ROUNDS kierrosta. Jos malli haluaisi yhä kutsua työkaluja
 * kierrosten loputtua, viimeinen kutsu tehdään ilman tools-parametria — malli
 * joutuu tällöin vastaamaan sillä datalla joka on jo kerätty, sen sijaan että
 * kierre jatkuisi loputtomiin.
 */
async function runAssistant(prompt: string, onText: (chunk: string) => void): Promise<void> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }]

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = getClient().messages.stream({
      model: MODEL_ASSISTANT,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    })
    stream.on('text', onText)
    const response = await stream.finalMessage()

    if (response.stop_reason === 'pause_turn') {
      // web_search on server-side työkalu: sen sisäinen hakusilmukka rajoittuu
      // oletuksena kymmeneen kierrokseen palvelimella. Jos raja tulee vastaan,
      // jatketaan lähettämällä assistant-viesti takaisin sellaisenaan — palvelin
      // jatkaa hausta siitä mihin jäi.
      messages.push({ role: 'assistant', content: response.content })
      continue
    }

    if (response.stop_reason !== 'tool_use') return

    messages.push({ role: 'assistant', content: response.content })
    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )
    const results = await Promise.all(toolUses.map(toolResultFor))
    messages.push({ role: 'user', content: results })
  }

  const final = getClient().messages.stream({
    model: MODEL_ASSISTANT,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages,
  })
  final.on('text', onText)
  await final.finalMessage()
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

  const question = prompt

  // Suoratoisto vain pyydettäessä. Deployn jälkeen avoinna oleva välilehti ja
  // asennettu PWA ajavat yhä vanhaa JS:ää, joka kutsuu res.json():ia — moniriviseen
  // NDJSON-virtaan se kaatuu ja käyttäjä näkee vain "Jokin meni pieleen." Vanha
  // asiakas ei lähetä tätä otsaketta, joten se saa entisen kertavastauksen ja
  // korjaantuu itsestään kun sivu seuraavan kerran latautuu.
  const wantsStream = req.headers.get('accept')?.includes(NDJSON_TYPE) ?? false

  if (!wantsStream) {
    let text = ''
    try {
      await runAssistant(question, chunk => {
        text += chunk
      })
    } catch (error) {
      console.error('[api/arxcian/assistant] generointi epäonnistui', error)
      return NextResponse.json({ error: 'Generointi epäonnistui' }, { status: 500 })
    }
    if (!text) {
      console.error('[api/arxcian/assistant] vastauksessa ei tekstiä')
      return NextResponse.json({ error: 'Generointi epäonnistui' }, { status: 502 })
    }
    return NextResponse.json({ text })
  }

  const stream = new ReadableStream({
    async start(controller) {
      let emitted = 0
      try {
        await runAssistant(question, chunk => {
          emitted += chunk.length
          controller.enqueue(encodeEvent({ type: 'text', value: chunk }))
        })
        if (emitted === 0) {
          console.error('[api/arxcian/assistant] vastauksessa ei tekstiä')
          controller.enqueue(encodeEvent({ type: 'error', value: 'Generointi epäonnistui' }))
        }
      } catch (error) {
        // Tarkempi syy vain palvelimen lokiin: Anthropicin virhevastaus voi
        // sisältää organisaatio- tai avaintietoja, eikä sellaista palauteta
        // selaimeen.
        console.error('[api/arxcian/assistant] generointi epäonnistui', error)
        controller.enqueue(encodeEvent({ type: 'error', value: 'Generointi epäonnistui' }))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': `${NDJSON_TYPE}; charset=utf-8`,
      'Cache-Control': 'no-store',
      // Ilman tätä välityspalvelin voi puskuroida koko vastauksen, jolloin
      // suoratoisto käyttäytyisi täsmälleen kuten vanha kertavastaus.
      'X-Accel-Buffering': 'no',
    },
  })
}
