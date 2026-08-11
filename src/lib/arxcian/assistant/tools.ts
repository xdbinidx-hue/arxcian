import type Anthropic from '@anthropic-ai/sdk'
import { headers } from 'next/headers'
import type { SessionUser } from '@/lib/session'
import { readCached } from '../cache'
import { CATEGORIES, type Category } from '../news/types'
import { latestAcrossCategories } from '../news/digest'
import { watchlistSnapshot } from '../trading/snapshot'
import { readCachedSentiment } from '../trading/sentiment'
import { getAlerts } from '../trading/alerts'
import { parseMonthInput, readRjMobMonths, readRjMobSummary } from '../rjmobSummary'
import { getCalendarStatus, upcomingEvents } from '../personal/calendar/events'
import { getGoals } from '../personal/goals'
import { getHabits, calculateStreak } from '../personal/habits'
import { getNotes } from '../personal/notes'
import { CITIES_CACHE_KEY, describeWeatherCode, type CityWeather } from '../weather'
import { isoDateHelsinki, todayISOHelsinki } from '../time'
import { setLanguage } from './language'
import { isLanguage } from './types'

/**
 * Avustajan lukutyökalut.
 *
 * **Yksikään näistä ei hae ulkoisesta lähteestä.** Data luetaan välimuistista
 * tai olemassa olevista apureista, jotka itse lukevat välimuistia. Avustaja ei
 * saa kuormittaa Yahoo Financea, Open-Meteoa tai RSS-syötteitä omilla
 * kutsuillaan — se on cronin tehtävä, ja kysymyksiä voi tulla kymmeniä
 * tunnissa. Tyhjä välimuisti ei ole virhe vaan "ei vielä haettu" -viesti, jonka
 * malli osaa kertoa käyttäjälle.
 *
 * Henkilökohtaiset tietueet haetaan kirjastoapureilla, jotka suodattavat
 * näkyvyyden jo itse (`visibleTo`). Käyttäjä välitetään läpi sellaisenaan —
 * suodatusta ei toisteta eikä ohiteta täällä.
 *
 * Yksi poikkeus lukemiseen: `set_language` kirjoittaa käyttäjän kieliasetuksen.
 * Se on tarkoituksella **täällä eikä proposals.ts:ssä**, eli se ei tuota
 * vahvistuskorttia. Vahvistus on tietueen luontia varten (muistiinpano,
 * tavoite, hälytys), jossa väärin kuultu puhe jäisi listalle näyttämään
 * oikealta. Kielivalinta ei ole tietue vaan asetus, jonka virheellisyys kuuluu
 * heti seuraavasta lauseesta ja jonka voi perua sanomalla "vastaa englanniksi"
 * — vahvistuskortti tekisi siitä tarpeettoman kankean.
 */

/** Kuinka monta tietuetta yksi työkalu enintään palauttaa. */
const MAX_ITEMS = 20

/**
 * Sama johtaminen kuin hubin palvelinkomponenteissa (esim. UpcomingEvents):
 * kalenterin OAuth-uudelleenohjaus rakennetaan pyynnön originista, joten sama
 * koodi toimii localhostissa ja tuotannossa.
 *
 * Kutsutaan pyynnön alussa eikä työkalun suorituksen aikana: suoratoistettu
 * vastaus jatkuu ReadableStreamin sisällä, eikä pyyntökohtaisiin otsakkeisiin
 * ole siellä syytä luottaa.
 */
export function requestOrigin(): string {
  const h = headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

/** Hetki luettavassa muodossa Helsingin aikaa. sv-SE antaa ISO-tyylisen "2026-08-12 09:00". */
function helsinkiTime(ms: number): string {
  return new Date(ms).toLocaleString('sv-SE', {
    timeZone: 'Europe/Helsinki',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/** Lukutyökalujen määrittelyt. Kirjoitustyökalut ovat writeTools.ts:ssä. */
export const READ_TOOLS = [
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
    name: 'get_rjmob_summary',
    description:
      'Hakee RJ-Mobin yhden kuukauden myyntiluvut: liittymät, kassakate ja F-Secure. Oletuksena kuluva kuukausi. Vain kuluvan kuukauden muutosprosentti on kuukauden loppuun projisoitu ennuste (projected on tosi); valmiin kuukauden muutos on toteutunut vertailu edelliseen kuukauteen. Vastauksen availableMonths kertoo miltä kuukausilta lukuja on. Vain luku — RJ-Mobin lukuja ei voi muuttaa avustajan kautta.',
    input_schema: {
      type: 'object',
      properties: {
        month: {
          type: 'string',
          description:
            'Kuukausi jonka luvut haetaan: "2026-06", "current", "previous" tai suomenkielinen kuukauden nimi ("kesäkuu", "viime kuu"). Jätä pois kuluvalle kuukaudelle.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'get_calendar',
    description:
      'Hakee käyttäjän tulevat kalenteritapahtumat kaikilta liitetyiltä Google-tileiltä aikajärjestyksessä.',
    input_schema: {
      type: 'object',
      properties: {
        n: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'Kuinka monta tapahtumaa palautetaan. Oletus 5.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'get_goals',
    description: 'Hakee käyttäjän tavoitteet: otsikko, elämänalue, määräpäivä ja onko tehty.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_habits',
    description:
      'Hakee käyttäjän päivittäiset rutiinit, onko kukin merkitty tehdyksi tänään, ja putken pituuden päivinä.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_notes',
    description: 'Hakee käyttäjän uusimmat muistiinpanot tageineen.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_weather',
    description:
      'Hakee seurattujen kaupunkien nykysään (lämpötila ja sääkuvaus) maapallon välimuistista. Helsinki on mukana listassa.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'set_language',
    description:
      'Vaihtaa kielen jolla vastaat: "fi" on suomi, "en" englanti. Käytä tätä kun käyttäjä pyytää vastauksia toisella kielellä ("vastaa suomeksi", "answer in English"). Asetus säilyy seuraaviin keskusteluihin. Vaihdon jälkeen vastaa lyhyesti, yhdellä lauseella, uudella kielellä.',
    input_schema: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: ['fi', 'en'],
          description: 'Uusi kieli: fi (suomi) tai en (englanti).',
        },
      },
      required: ['language'],
      additionalProperties: false,
    },
  },
] satisfies Anthropic.Messages.ToolUnion[]

const READ_TOOL_NAMES = new Set(READ_TOOLS.map(t => t.name))

export function isReadTool(name: string): boolean {
  return READ_TOOL_NAMES.has(name)
}

/** Poimii get_latest_news-työkalun syötteestä kelvolliset arvot, muu jää varaan. */
function newsInput(input: unknown): { n: number; category: Category | undefined } {
  const raw = (input ?? {}) as { n?: unknown; category?: unknown }
  const parsed = Math.round(Number(raw.n))
  const n = Math.min(MAX_ITEMS, Math.max(1, Number.isFinite(parsed) ? parsed : 5))
  const category =
    typeof raw.category === 'string' && (CATEGORIES as readonly string[]).includes(raw.category)
      ? (raw.category as Category)
      : undefined
  return { n, category }
}

/** Rajaa mallin pyytämän määrän järkeväksi. Malli voi ehdottaa mitä tahansa. */
function countInput(input: unknown, fallback: number): number {
  const raw = (input ?? {}) as { n?: unknown }
  const parsed = Math.round(Number(raw.n))
  return Math.min(MAX_ITEMS, Math.max(1, Number.isFinite(parsed) ? parsed : fallback))
}

/**
 * RJ-Mobin kuukausiluvut välimuistista.
 *
 * Työkalu ei hae Drivestä eikä laske mitään: kuukaudet ovat cron-työn
 * `rjmob-summary` kirjoittamia. Kun pyydettyä kuukautta ei ole, vastaus
 * kertoo mitä kuukausia on — malli ei saa täyttää aukkoa arvauksella,
 * koska väärä myyntiluku näyttää täsmälleen oikealta.
 */
async function rjmobSummaryResult(input: unknown): Promise<unknown> {
  const raw = (input ?? {}) as { month?: unknown }
  const asked = typeof raw.month === 'string' ? raw.month : ''

  const availableMonths = await readRjMobMonths()
  const month = parseMonthInput(asked)

  if (!month) {
    return {
      error: `Kuukautta ei tunnistettu: "${asked}".`,
      availableMonths,
      note: 'Kysy käyttäjältä mitä kuukautta hän tarkoittaa. Älä arvaa lukuja.',
    }
  }

  const cached = await readRjMobSummary(month)
  if (!cached) {
    return {
      error: `RJ-Mobin lukuja kuukaudelta ${month} ei ole välimuistissa.`,
      availableMonths,
      note: 'Kerro käyttäjälle miltä kuukausilta lukuja on. Älä arvaa lukuja.',
    }
  }

  return {
    ...cached.data,
    month,
    availableMonths,
    fetchedAt: helsinkiTime(cached.fetchedAt),
    note: 'changePercent on kuukauden loppuun projisoitu ennuste, kun projected on tosi. Muuten se on toteuma.',
  }
}

async function calendarResult(input: unknown, user: SessionUser, origin: string): Promise<unknown> {
  const status = await getCalendarStatus(user, origin)

  // Ei-yhdistetty kalenteri ei ole poikkeus vaan vastaus: malli kertoo
  // käyttäjälle mitä pitää tehdä sen sijaan että työkalu kaatuisi.
  if (status.state === 'not-configured') {
    return { error: 'Google-kalenterin tunnukset puuttuvat palvelimen ympäristömuuttujista.' }
  }
  if (status.state === 'disconnected') {
    return { error: 'Kalenteria ei ole yhdistetty. Käyttäjä voi liittää sen Personal-osiossa.' }
  }
  if (status.state === 'error') {
    return { error: `Kalenterin haku epäonnistui: ${status.message}` }
  }

  const events = upcomingEvents(status.events, countInput(input, 5))
  return {
    timezone: 'Europe/Helsinki',
    events: events.map(e => ({
      title: e.title,
      start: helsinkiTime(e.start),
      end: helsinkiTime(e.end),
      allDay: e.allDay,
      location: e.location,
      calendar: e.calendarName,
      account: e.accountEmail,
    })),
  }
}

/**
 * Suorittaa lukutyökalun. Heittää vain odottamattomista virheistä — tyhjä
 * välimuisti palautetaan selkeänä viestinä.
 */
export async function runReadTool(
  name: string,
  input: unknown,
  user: SessionUser,
  origin: string,
): Promise<unknown> {
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
    case 'get_rjmob_summary':
      return rjmobSummaryResult(input)
    case 'get_calendar':
      return calendarResult(input, user, origin)
    case 'get_goals': {
      const goals = await getGoals(user)
      return goals.slice(0, MAX_ITEMS).map(g => ({
        title: g.title,
        area: g.area,
        description: g.description,
        targetDate: g.targetDate,
        done: g.done,
      }))
    }
    case 'get_habits': {
      const today = todayISOHelsinki()
      const habits = await getHabits(user)
      return habits.slice(0, MAX_ITEMS).map(h => ({
        title: h.title,
        doneToday: h.completedDates.includes(today),
        streakDays: calculateStreak(h.completedDates),
      }))
    }
    case 'get_notes': {
      const notes = await getNotes(user)
      return notes.slice(0, MAX_ITEMS).map(n => ({
        text: n.text,
        tags: n.tags,
        created: isoDateHelsinki(new Date(n.createdAt)),
      }))
    }
    case 'get_weather': {
      // Luetaan vain välimuistia: cron-työ globe-weather pitää sen tuoreena.
      const cached = await readCached<CityWeather[]>(CITIES_CACHE_KEY)
      if (!cached) return { error: 'Säädataa ei ole vielä välimuistissa.' }
      return {
        fetchedAt: helsinkiTime(cached.fetchedAt),
        cities: cached.data.map(c => ({
          name: c.name,
          temperature: c.temperature,
          conditions: describeWeatherCode(c.weatherCode).label,
        })),
      }
    }
    case 'set_language': {
      const raw = (input ?? {}) as { language?: unknown }
      if (!isLanguage(raw.language)) {
        return { error: 'Kielen on oltava "fi" tai "en".' }
      }
      // Omistaja on aina kirjautunut käyttäjä: mallin ehdottamaa käyttäjää ei
      // lueta lainkaan, muuten toisen kieliasetuksen voisi vaihtaa pyytämällä
      // sitä ääneen. Sama sääntö kuin ehdotuksissa (proposals.ts).
      await setLanguage(user, raw.language)
      // Kehotus on jo uudella kielellä: se on mallille vahvin yksittäinen
      // vihje siitä millä kielellä seuraava lause kirjoitetaan.
      return {
        ok: true,
        language: raw.language,
        note:
          raw.language === 'fi'
            ? 'Kieli on nyt suomi. Vastaa tästä eteenpäin suomeksi, alkaen lyhyestä vahvistuksesta.'
            : 'The language is now English. Answer in English from now on, starting with a short confirmation.',
      }
    }
    default:
      throw new Error(`Tuntematon lukutyökalu: ${name}`)
  }
}
