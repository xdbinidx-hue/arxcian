import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { currentUser, type SessionUser } from '@/lib/session'
import { checkRateLimit } from '@/lib/arxcian/rateLimit'
import { MODEL_ASSISTANT } from '@/lib/arxcian/models'
import { READ_TOOLS, requestOrigin, runReadTool } from '@/lib/arxcian/assistant/tools'
import {
  WRITE_TOOLS,
  isWriteTool,
  prepareProposal,
  saveProposal,
  type ProposalTool,
} from '@/lib/arxcian/assistant/proposals'

/**
 * Chat-tyylinen AI-avustaja arxcianin datalla. Kaikki lukutyökalut lukevat vain
 * välimuistista (readCached/getQuotes-polkuja pitkin) — eivät koskaan hae
 * suoraan ulkoisesta lähteestä. Avustajan ei saa antaa kuormittaa Yahoo
 * Financea tai RSS-syötteitä omilla kutsuillaan; se on cronin tehtävä.
 *
 * Kirjoitustyökalut eivät kirjoita mitään: ne tuottavat ehdotuksen, joka
 * tallennetaan palvelimelle ja jonka käyttäjä vahvistaa erikseen reitillä
 * /api/arxcian/assistant/confirm. Ks. lib/arxcian/assistant/proposals.ts.
 *
 * Työkalujen määrittelyt ja suoritus ovat lib/arxcian/assistant/-kirjastoissa,
 * jotta tämä reitti pysyy suoratoiston ja pääsynhallinnan kokoisena.
 */

const MAX_TOKENS = 1024
const RATE_LIMIT = 30
const MAX_TOOL_ROUNDS = 4

/**
 * Ehdotuksia yksi per pyyntö.
 *
 * Käyttäjä vahvistaa ehdotuksen puheella tai yhdellä painalluksella, ja useampi
 * yhtaikainen vahvistuskortti tekisi siitä valinnan jossa yhden voi vahingossa
 * ohittaa. Malli saa toisesta kutsusta selkeän vastauksen ja kertoo loput
 * sanallisesti.
 */
const MAX_PROPOSALS = 1

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
If the available data isn't enough to answer, say so directly instead of making things up.

Most tools only read data. The four writing tools — create_note, create_goal,
complete_habit_today and create_alert — do not change anything on their own:
they put a proposal in front of the user, who has to confirm it separately.
Never say that something has been created, saved, added or completed. Say that
you have proposed it and that it is waiting for the user's confirmation. Call at
most one writing tool per turn, and never call the same one twice.`

/** Anthropicin palvelinpuolen hakutyökalu: sitä ei suoriteta täällä. */
const WEB_SEARCH = {
  type: 'web_search_20260209',
  name: 'web_search',
  max_uses: 3,
} satisfies Anthropic.Messages.ToolUnion

const TOOLS: Anthropic.Messages.ToolUnion[] = [...READ_TOOLS, ...WRITE_TOOLS, WEB_SEARCH]

let client: Anthropic | null = null
function getClient() {
  if (!client) client = new Anthropic()
  return client
}

/** Suoratoiston mediatyyppi. Asiakas pyytää tätä Accept-otsakkeella. */
const NDJSON_TYPE = 'application/x-ndjson'

const encoder = new TextEncoder()

/**
 * Vahvistusta odottava ehdotus selaimelle.
 *
 * Argumentteja ei lähetetä: selain vahvistaa pelkällä tunnisteella, jolloin
 * niitä ei voi muokata ehdotuksen ja suorituksen välissä. `summary` on sama
 * teksti joka näytetään ja luetaan ääneen.
 */
type ProposalEvent = { id: string; tool: ProposalTool; summary: string }

type StreamEvent =
  | { type: 'text'; value: string }
  | { type: 'error'; value: string }
  | { type: 'proposal'; value: ProposalEvent }

/**
 * Yksi NDJSON-tapahtuma. Rivinvaihto erottaa tapahtumat, jotta selain voi
 * jäsentää virtaa palasittain — verkkopala voi katketa keskeltä riviä, ja
 * rivipohjainen muoto tekee vajaan lopun käsittelystä yksiselitteistä.
 *
 * Virhe kulkee tapahtumana eikä statuskoodina, koska ensimmäisen tavun
 * lähdettyä statusrivi on jo matkalla eikä sitä voi enää muuttaa.
 */
function encodeEvent(event: StreamEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`)
}

/** Kirjoitustyökalun vastaus mallille: ehdotettiin, tai miksi ei voitu ehdottaa. */
type ProposeResult = { ok: boolean; message: string }

/** Pyyntökohtainen konteksti, joka kulkee työkalujen suoritukseen asti. */
type ToolContext = {
  user: SessionUser
  /** Kalenterityökalu tarvitsee originin OAuth-asiakkaan rakentamiseen. */
  origin: string
}

async function toolResultFor(
  block: Anthropic.ToolUseBlock,
  ctx: ToolContext,
  propose: (tool: ProposalTool, input: unknown) => Promise<ProposeResult>,
): Promise<Anthropic.ToolResultBlockParam> {
  try {
    if (isWriteTool(block.name)) {
      const result = await propose(block.name, block.input)
      return {
        type: 'tool_result',
        tool_use_id: block.id,
        content: result.message,
        // Virhe merkitään is_erroriksi, jotta malli tietää korjata syötteensä
        // tai kysyä käyttäjältä sen sijaan että kertoisi ehdottaneensa jotain.
        ...(result.ok ? {} : { is_error: true }),
      }
    }

    const result = await runReadTool(block.name, block.input, ctx.user, ctx.origin)
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
async function runAssistant(
  prompt: string,
  ctx: ToolContext,
  handlers: { onText: (chunk: string) => void; onProposal: (event: ProposalEvent) => void },
): Promise<void> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }]
  const { onText } = handlers
  let proposalsMade = 0

  /**
   * Kirjoitustyökalun kutsu: tallentaa ehdotuksen ja kertoo siitä selaimelle.
   * Itse toimea ei suoriteta täällä missään tilanteessa.
   */
  const propose = async (tool: ProposalTool, input: unknown): Promise<ProposeResult> => {
    if (proposalsMade >= MAX_PROPOSALS) {
      return {
        ok: false,
        message:
          'Vain yksi ehdotus kerrallaan. Kerro käyttäjälle sanallisesti mitä muuta voit tehdä, kun hän on vahvistanut tämän.',
      }
    }

    // Paikka varataan ennen ensimmäistä awaitia: saman kierroksen työkalukutsut
    // ajetaan rinnakkain (Promise.all), joten awaitin jälkeen kasvatettu laskuri
    // olisi molemmilla vielä nolla ja raja menisi ohi. Varaus vapautetaan jos
    // ehdotusta ei syntynytkään.
    proposalsMade++

    let prepared
    try {
      prepared = await prepareProposal(tool, input, ctx.user)
      if (!prepared.ok) {
        proposalsMade--
        return { ok: false, message: prepared.error }
      }
      await saveProposal(prepared.proposal)
    } catch (error) {
      proposalsMade--
      throw error
    }

    handlers.onProposal({ id: prepared.proposal.id, tool, summary: prepared.proposal.summary })

    return {
      ok: true,
      message:
        'Ehdotus on esitetty käyttäjälle vahvistettavaksi. Älä kutsu työkalua uudelleen. Kerro lyhyesti mitä ehdotit.',
    }
  }

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
    const results = await Promise.all(toolUses.map(block => toolResultFor(block, ctx, propose)))
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
  // Otsakkeet luetaan tässä, ei työkalun suorituksessa: suoratoistettu vastaus
  // jatkuu ReadableStreamin sisällä pyyntökäsittelijän palattua.
  const ctx: ToolContext = { user, origin: requestOrigin() }

  // Suoratoisto vain pyydettäessä. Deployn jälkeen avoinna oleva välilehti ja
  // asennettu PWA ajavat yhä vanhaa JS:ää, joka kutsuu res.json():ia — moniriviseen
  // NDJSON-virtaan se kaatuu ja käyttäjä näkee vain "Jokin meni pieleen." Vanha
  // asiakas ei lähetä tätä otsaketta, joten se saa entisen kertavastauksen ja
  // korjaantuu itsestään kun sivu seuraavan kerran latautuu.
  const wantsStream = req.headers.get('accept')?.includes(NDJSON_TYPE) ?? false

  if (!wantsStream) {
    let text = ''
    // Ehdotus palautetaan omassa kentässään, jotta vanhan asiakkaan vastaus
    // pysyy muodoltaan entisenä: se lukee vain `text`-kentän eikä osaa
    // vahvistaa mitään, jolloin ehdotus vanhenee itsestään kymmenessä
    // minuutissa eikä mitään kirjoiteta.
    let proposal: ProposalEvent | null = null
    try {
      await runAssistant(question, ctx, {
        onText: chunk => {
          text += chunk
        },
        onProposal: event => {
          proposal = event
        },
      })
    } catch (error) {
      console.error('[api/arxcian/assistant] generointi epäonnistui', error)
      return NextResponse.json({ error: 'Generointi epäonnistui' }, { status: 500 })
    }
    if (!text) {
      console.error('[api/arxcian/assistant] vastauksessa ei tekstiä')
      return NextResponse.json({ error: 'Generointi epäonnistui' }, { status: 502 })
    }
    return NextResponse.json(proposal ? { text, proposal } : { text })
  }

  const stream = new ReadableStream({
    async start(controller) {
      let emitted = 0
      try {
        await runAssistant(question, ctx, {
          onText: chunk => {
            emitted += chunk.length
            controller.enqueue(encodeEvent({ type: 'text', value: chunk }))
          },
          // Ehdotustapahtuma lähtee heti kun ehdotus on tallennettu, eli ennen
          // mallin sanallista selostusta. Selain voi näyttää vahvistuskortin
          // saman tien.
          onProposal: event => {
            controller.enqueue(encodeEvent({ type: 'proposal', value: event }))
          },
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
