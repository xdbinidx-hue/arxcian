import type Anthropic from '@anthropic-ai/sdk'
import type { Owner, SessionUser } from '@/lib/session'
import { readCached, writeCached, invalidate } from '../cache'
import { addNote } from '../personal/notes'
import { addGoal } from '../personal/goals'
import { getHabits, toggleHabitToday } from '../personal/habits'
import { GOAL_AREAS, GOAL_AREA_LABELS, type GoalArea } from '../personal/types'
import { addAlert } from '../trading/alerts'
import { WATCHLIST } from '../trading/symbols'
import type { AlertCondition } from '../trading/types'
import { todayISOHelsinki } from '../time'

/**
 * Avustajan kirjoitustoimet ehdotuksina.
 *
 * **Malli ei suorita mitään.** Kirjoitustyökalun kutsu tuottaa vain ehdotuksen,
 * joka tallennetaan tänne palvelimelle ja jonka käyttäjä vahvistaa erillisellä
 * pyynnöllä. Malli voi ymmärtää puheen väärin ja tuottaa väärän tietueen, joten
 * jokainen kirjoitus käy ihmisen läpi.
 *
 * Ehdotus tallennetaan palvelimelle eikä lähetetä argumentteineen selaimeen,
 * koska silloin selain palauttaisi vahvistuksessa `{tool, args}` ja argumentteja
 * voisi muokata ehdotuksen ja suorituksen välissä. Nyt vahvistus viittaa
 * pelkkään tunnisteeseen, ja argumentit tulevat siitä mitä malli ehdotti ja
 * mitä käyttäjälle näytettiin.
 *
 * Argumentit validoidaan jo ehdotusta luotaessa, ei vasta suorituksessa: muuten
 * käyttäjä vahvistaisi toimen joka kaatuu vasta jälkikäteen, eikä mallilla olisi
 * enää tilaisuutta korjata syötettään.
 *
 * Työkalumäärittelyt ovat samassa tiedostossa validoinnin kanssa, koska kentät
 * ovat samat — jako menee lukemisen ja kirjoittamisen väliltä (tools.ts /
 * proposals.ts), ei määrittelyn ja logiikan väliltä.
 */

export type ProposalTool = 'create_note' | 'create_goal' | 'complete_habit_today' | 'create_alert'

type ProposalBase = {
  id: string
  /** Ehdotuksen omistaja. Vain hän voi vahvistaa sen. */
  user: SessionUser
  /** Yhden lauseen suomenkielinen kuvaus, ainoa asia joka näytetään käyttäjälle. */
  summary: string
  /** Unix ms */
  createdAt: number
}

export type Proposal =
  | (ProposalBase & { tool: 'create_note'; args: { text: string } })
  | (ProposalBase & {
      tool: 'create_goal'
      args: { area: GoalArea; title: string; description: string; targetDate: string | null }
    })
  // Rutiini yksilöidään tunnisteella, vaikka malli antaa nimen: nimi ratkaistaan
  // kerran ehdotusta luotaessa, jotta vahvistus osuu varmasti samaan rutiiniin
  // kuin käyttäjälle näytetty kuvaus.
  | (ProposalBase & { tool: 'complete_habit_today'; args: { habitId: string; title: string } })
  | (ProposalBase & {
      tool: 'create_alert'
      args: { symbol: string; label: string; condition: AlertCondition; threshold: number }
    })

/** Ehdotus vanhenee kymmenessä minuutissa: vanha ehdotus ei saa jäädä odottamaan vahvistusta. */
const TTL_SECONDS = 10 * 60

const MAX_NOTE_LENGTH = 500
const MAX_TITLE_LENGTH = 200
const MAX_DESCRIPTION_LENGTH = 1000

/** Kirjoitustyökalujen määrittelyt mallille. */
export const WRITE_TOOLS = [
  {
    name: 'create_note',
    description:
      'Ehdottaa uuden muistiinpanon luomista käyttäjälle. EI luo mitään itse — käyttäjä vahvistaa ehdotuksen erikseen.',
    input_schema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Muistiinpanon teksti suomeksi, käyttäjän omin sanoin. #tagit ja /tagit poimitaan automaattisesti.',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_goal',
    description:
      'Ehdottaa uuden tavoitteen luomista. EI luo mitään itse — käyttäjä vahvistaa ehdotuksen erikseen.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Tavoitteen otsikko suomeksi.' },
        area: {
          type: 'string',
          enum: [...GOAL_AREAS],
          description: 'Elämänalue: tyo, henkilokohtainen tai terveys.',
        },
        description: { type: 'string', description: 'Vapaaehtoinen tarkennus suomeksi.' },
        targetDate: {
          type: 'string',
          description: 'Vapaaehtoinen määräpäivä muodossa YYYY-MM-DD.',
        },
      },
      required: ['title', 'area'],
      additionalProperties: false,
    },
  },
  {
    name: 'complete_habit_today',
    description:
      'Ehdottaa olemassa olevan rutiinin merkitsemistä tehdyksi tälle päivälle. Käytä get_habits-työkalua ensin nähdäksesi rutiinien nimet. EI merkitse mitään itse — käyttäjä vahvistaa ehdotuksen erikseen.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Rutiinin nimi täsmälleen kuten se on listassa.' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_alert',
    description:
      'Ehdottaa hintahälytyksen luomista watchlistin symbolille. EI luo mitään itse — käyttäjä vahvistaa ehdotuksen erikseen.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Watchlistin symboli, esim. BTC-USD tai ^OMXH25. Myös näyttönimi kelpaa, esim. BTC.',
        },
        condition: {
          type: 'string',
          enum: ['above', 'below'],
          description: 'Laukeaako hälytys rajan ylittyessä (above) vai alittuessa (below).',
        },
        threshold: { type: 'number', description: 'Hintaraja.' },
      },
      required: ['symbol', 'condition', 'threshold'],
      additionalProperties: false,
    },
  },
] satisfies Anthropic.Messages.ToolUnion[]

const WRITE_TOOL_NAMES = new Set(WRITE_TOOLS.map(t => t.name))

export function isWriteTool(name: string): name is ProposalTool {
  return WRITE_TOOL_NAMES.has(name)
}

export type Prepared = { ok: true; proposal: Proposal } | { ok: false; error: string }

function str(input: unknown, field: string): string {
  const raw = (input ?? {}) as Record<string, unknown>
  return typeof raw[field] === 'string' ? (raw[field] as string).trim() : ''
}

/** Kelvollinen kalenteripäivä muodossa YYYY-MM-DD. "2026-02-31" ei kelpaa. */
function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/** Symboli tai näyttönimi watchlistista. Malli voi sanoa "BTC" kun symboli on "BTC-USD". */
function findSymbol(raw: string) {
  const needle = raw.trim().toUpperCase()
  return (
    WATCHLIST.find(w => w.quoteSymbol.toUpperCase() === needle || w.label.toUpperCase() === needle) ??
    null
  )
}

function base(user: SessionUser, summary: string): ProposalBase {
  return { id: crypto.randomUUID(), user, summary, createdAt: Date.now() }
}

async function prepareNote(input: unknown, user: SessionUser): Promise<Prepared> {
  const text = str(input, 'text')
  if (!text) return { ok: false, error: 'Muistiinpanon teksti puuttuu.' }
  if (text.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: `Muistiinpano on liian pitkä (enintään ${MAX_NOTE_LENGTH} merkkiä).` }
  }
  return {
    ok: true,
    proposal: {
      ...base(user, `Luodaan muistiinpano: "${text}"`),
      tool: 'create_note',
      args: { text },
    },
  }
}

async function prepareGoal(input: unknown, user: SessionUser): Promise<Prepared> {
  const title = str(input, 'title')
  const area = str(input, 'area')
  const description = str(input, 'description')
  const targetDate = str(input, 'targetDate')

  if (!title) return { ok: false, error: 'Tavoitteen otsikko puuttuu.' }
  if (title.length > MAX_TITLE_LENGTH) {
    return { ok: false, error: `Otsikko on liian pitkä (enintään ${MAX_TITLE_LENGTH} merkkiä).` }
  }
  if (!(GOAL_AREAS as readonly string[]).includes(area)) {
    return { ok: false, error: `Elämänalueen on oltava yksi näistä: ${GOAL_AREAS.join(', ')}.` }
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return { ok: false, error: 'Kuvaus on liian pitkä.' }
  }
  if (targetDate && !isValidDate(targetDate)) {
    return { ok: false, error: 'Määräpäivän on oltava kelvollinen päivä muodossa YYYY-MM-DD.' }
  }

  const goalArea = area as GoalArea
  const dateNote = targetDate ? `, määräpäivä ${targetDate}` : ''
  return {
    ok: true,
    proposal: {
      ...base(user, `Luodaan tavoite (${GOAL_AREA_LABELS[goalArea]}): "${title}"${dateNote}`),
      tool: 'create_goal',
      args: { area: goalArea, title, description, targetDate: targetDate || null },
    },
  }
}

async function prepareHabit(input: unknown, user: SessionUser): Promise<Prepared> {
  const title = str(input, 'title')
  if (!title) return { ok: false, error: 'Rutiinin nimi puuttuu.' }

  const habits = await getHabits(user)
  const needle = title.toLowerCase()
  const matches = habits.filter(h => h.title.trim().toLowerCase() === needle)

  // Arvaus on tässä pahempi kuin virhe: väärä rutiini merkittäisiin tehdyksi ja
  // putki näyttäisi valheellista lukua. Nimet luetellaan, jotta malli voi kysyä
  // käyttäjältä kumpaa hän tarkoitti.
  if (matches.length === 0) {
    const names = habits.map(h => h.title).join(', ')
    return {
      ok: false,
      error: names
        ? `Rutiinia "${title}" ei löytynyt. Käyttäjän rutiinit: ${names}.`
        : 'Käyttäjällä ei ole yhtään rutiinia.',
    }
  }
  if (matches.length > 1) {
    return { ok: false, error: `Nimellä "${title}" löytyi useita rutiineja. Tarkenna kysymällä käyttäjältä.` }
  }

  const habit = matches[0]
  if (habit.completedDates.includes(todayISOHelsinki())) {
    return { ok: false, error: `Rutiini "${habit.title}" on jo merkitty tehdyksi tänään.` }
  }

  return {
    ok: true,
    proposal: {
      ...base(user, `Merkitään rutiini tehdyksi tänään: "${habit.title}"`),
      tool: 'complete_habit_today',
      args: { habitId: habit.id, title: habit.title },
    },
  }
}

async function prepareAlert(input: unknown, user: SessionUser): Promise<Prepared> {
  const raw = (input ?? {}) as { threshold?: unknown }
  const symbolInput = str(input, 'symbol')
  const condition = str(input, 'condition')
  const threshold = Number(raw.threshold)

  if (!symbolInput) return { ok: false, error: 'Symboli puuttuu.' }
  const found = findSymbol(symbolInput)
  if (!found) {
    return {
      ok: false,
      error: `Symbolia "${symbolInput}" ei ole watchlistissa. Sallitut: ${WATCHLIST.map(w => w.quoteSymbol).join(', ')}.`,
    }
  }
  if (condition !== 'above' && condition !== 'below') {
    return { ok: false, error: 'Ehdon on oltava "above" tai "below".' }
  }
  if (!Number.isFinite(threshold)) {
    return { ok: false, error: 'Hintarajan on oltava luku.' }
  }

  const suunta = condition === 'above' ? 'yli' : 'alle'
  return {
    ok: true,
    proposal: {
      ...base(user, `Luodaan hälytys: ${found.label} ${suunta} ${threshold}`),
      tool: 'create_alert',
      // Näyttönimi otetaan watchlistista eikä mallin ehdotuksesta, jotta
      // hälytyslistassa lukee sama nimi kuin muuallakin.
      args: { symbol: found.quoteSymbol, label: found.label, condition, threshold },
    },
  }
}

/**
 * Rakentaa ehdotuksen mallin työkalusyötteestä. Omistaja on aina kirjautunut
 * käyttäjä — mallin ehdottamaa omistajaa ei lueta lainkaan, muuten toisen
 * käyttäjän listalle voisi kirjoittaa pyytämällä sitä ääneen.
 */
export function prepareProposal(tool: ProposalTool, input: unknown, user: SessionUser): Promise<Prepared> {
  switch (tool) {
    case 'create_note':
      return prepareNote(input, user)
    case 'create_goal':
      return prepareGoal(input, user)
    case 'complete_habit_today':
      return prepareHabit(input, user)
    case 'create_alert':
      return prepareAlert(input, user)
  }
}

function proposalKey(user: SessionUser, id: string): string {
  return `assistant:proposal:${user}:${id}`
}

/** crypto.randomUUID():n muoto. Tunniste tulee selaimesta, joten se rajataan ennen avaimen rakentamista. */
function isValidId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

/**
 * Tallentaa ehdotuksen ja varmistaa lukemalla, että se todella meni perille.
 *
 * writeCached nielee Redis-virheet tarkoituksella (välimuistin vika ei saa
 * kaataa sivua), mutta tässä hiljainen epäonnistuminen tarkoittaisi että
 * käyttäjälle näytetään vahvistuspyyntö jota ei voi vahvistaa. Parempi kertoa
 * heti kuin antaa vahvistuksen kaatua 404:ään.
 */
export async function saveProposal(proposal: Proposal): Promise<void> {
  const key = proposalKey(proposal.user, proposal.id)
  await writeCached(key, proposal, TTL_SECONDS, 0)
  const check = await readCached<Proposal>(key)
  if (!check) throw new Error('Ehdotusta ei voitu tallentaa: välimuisti ei vastaa.')
}

/** Lataamisen lopputulos. Kutsuja erottaa puuttuvan ehdotuksen vieraasta. */
export type LoadResult =
  | { status: 'ok'; proposal: Proposal }
  | { status: 'not-found' }
  | { status: 'forbidden' }

/**
 * Lataa ehdotuksen. Avain sisältää jo käyttäjän, joten toisen ehdotusta ei voi
 * edes osua kohdalle; tallennettu omistaja tarkistetaan silti erikseen, jottei
 * avainmuodon myöhempi muutos avaisi reikää huomaamatta.
 */
export async function loadProposal(user: SessionUser, id: string): Promise<LoadResult> {
  if (!isValidId(id)) return { status: 'not-found' }
  const cached = await readCached<Proposal>(proposalKey(user, id))
  if (!cached) return { status: 'not-found' }

  const proposal = cached.data
  if (proposal.user !== user) return { status: 'forbidden' }
  // Vanhenemisen hoitaa Redis, mutta ikä tarkistetaan myös täällä: ilman
  // Redis-yhteyttä tai kellon heittäessä avain voisi elää pidempään.
  if (Date.now() - proposal.createdAt > TTL_SECONDS * 1000) return { status: 'not-found' }
  return { status: 'ok', proposal }
}

export async function deleteProposal(user: SessionUser, id: string): Promise<void> {
  if (!isValidId(id)) return
  await invalidate(proposalKey(user, id))
}

/**
 * Suorittaa vahvistetun ehdotuksen. Heittää jos toimi ei onnistu, jolloin
 * kutsuja kirjaa auditiin `ok: false`.
 *
 * Omistaja on ehdotukseen tallennettu käyttäjä, eli sama joka vahvisti sen.
 */
export async function executeProposal(proposal: Proposal): Promise<void> {
  const owner: Owner = proposal.user

  switch (proposal.tool) {
    case 'create_note':
      await addNote({ owner, text: proposal.args.text })
      return
    case 'create_goal':
      await addGoal({
        owner,
        area: proposal.args.area,
        title: proposal.args.title,
        description: proposal.args.description,
        targetDate: proposal.args.targetDate,
      })
      return
    case 'complete_habit_today': {
      // toggleHabitToday kääntää tilan. Kymmenen minuutin vahvistusikkunassa
      // käyttäjä on voinut merkitä rutiinin itse, jolloin vahvistus poistaisi
      // merkinnän — siksi tila tarkistetaan uudelleen juuri ennen kääntöä.
      const habits = await getHabits(proposal.user)
      const habit = habits.find(h => h.id === proposal.args.habitId)
      if (!habit) throw new Error('Rutiinia ei löytynyt enää.')
      if (habit.completedDates.includes(todayISOHelsinki())) {
        throw new Error('Rutiini oli jo merkitty tehdyksi tänään.')
      }
      await toggleHabitToday(habit.id, proposal.user)
      return
    }
    case 'create_alert':
      await addAlert({
        symbol: proposal.args.symbol,
        label: proposal.args.label,
        condition: proposal.args.condition,
        threshold: proposal.args.threshold,
        createdBy: proposal.user,
      })
      return
  }
}
