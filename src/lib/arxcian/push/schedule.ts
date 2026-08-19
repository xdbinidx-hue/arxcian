import { Client } from '@upstash/qstash'
import { USER_IDS, type UserId } from '@/lib/session'
import { getCalendar } from '../trading/calendar'
import { marketEvents, type MarketEvent } from '../trading/marketEvents'
import { getNotifySettings, getTradingTimes } from '../trading/notifyStore'
import { getSubscriptions } from './subscriptions'
import { getPlanned, savePlanned, type PlannedMap } from './planned'

/**
 * Ilmoitusten ajastus QStashilla.
 *
 * **Miksi QStash eikä cron.** Vercelin Hobby-taso ajaa cronin kerran
 * vuorokaudessa tarkkuudella ±59 min, ja GitHub Actions myöhästyy rutiinilla
 * 5–15 minuuttia. Kumpikaan ei kelpaa lauseeseen "Lontoo avautuu", jonka pitää
 * olla totta silloin kun se sanotaan. QStash ajastaa yksittäisen HTTP-kutsun
 * absoluuttiseen hetkeen (`notBefore`), joten pollausta ei ole lainkaan:
 * jonossa on yksi viesti per tuleva tapahtuma.
 *
 * **Suunnittelu ja toimitus ovat eri tarkkuusluokkaa.** Toimitus vaatii
 * minuutin tarkkuuden, suunnittelu ei mitään — 48 tunnin ikkuna kestää hyvin
 * sen että suunnittelija ajetaan myöhässä. Siksi suunnittelu ratsastaa
 * olemassa olevalla GitHub Actions -cronilla (neljä ajoa/vrk) eikä vaadi omaa
 * ajastusta, ja QStashin kymmenestä ilmaisesta ajastuksesta jää käyttämättä
 * kaikki kymmenen.
 */

/**
 * Kuinka pitkälle eteenpäin jonotetaan.
 *
 * Neljä suunnitteluajoa vuorokaudessa tarkoittaa korkeintaan kahdentoista
 * tunnin väliä (20.00 -> 08.00), joten 48 tuntia on nelinkertainen
 * marginaali. Se kattaa myös sen että yksi ajo jää väliin GitHubin katkon
 * takia.
 */
const HORIZON_MS = 48 * 60 * 60 * 1000

/**
 * Alaraja: tätä lähempänä olevaa tapahtumaa ei enää jonoteta.
 *
 * Julkaisu ja toimitus vievät oman hetkensä, ja menneeseen `notBefore`-aikaan
 * julkaistu viesti lähtisi heti — eli ilmoitus tulisi väärään aikaan sen
 * sijaan että se jäisi tulematta. Tulematta jääminen on parempi virhe, koska
 * väärään aikaan tullut "Lontoo avautuu" on väärää tietoa.
 */
const LEAD_FLOOR_MS = 60_000

let client: Client | null = null

function qstash(): Client {
  if (!client) {
    const token = process.env.QSTASH_TOKEN
    if (!token) throw new Error('QSTASH_TOKEN puuttuu')
    client = new Client({ token })
  }
  return client
}

/**
 * Sovelluksen julkinen osoite.
 *
 * QStash kutsuu takaisin verkon yli, joten suhteellinen polku ei kelpaa.
 * `VERCEL_PROJECT_PRODUCTION_URL` on Vercelin itse asettama tuotantodomain —
 * se on oletus nimenomaan siksi, ettei ilmoituksia jonoteta preview-domainiin
 * joka kuolee seuraavan deployn myötä.
 */
export function baseUrl(): string {
  const explicit = process.env.ARXCIAN_BASE_URL
  if (explicit) return explicit.replace(/\/+$/, '')

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (production) return `https://${production}`

  throw new Error('ARXCIAN_BASE_URL tai VERCEL_PROJECT_PRODUCTION_URL puuttuu')
}

export function sendUrl(): string {
  return `${baseUrl()}/api/arxcian/push/send`
}

/**
 * Vastaako QStash tällä tunnuksella.
 *
 * Diagnostiikkaa varten, ja nimenomaan lukukutsulla: `publishJSON` todistaisi
 * saman mutta jättäisi jonoon viestin jota kukaan ei tilannut. Tunnuksen
 * puuttuminen ja väärä tunnus erottuvat viestistä — molemmat näyttivät
 * 19.8.2026 lokissa samalta rivinä "suunnittelu epäonnistui".
 */
export async function qstashReachable(): Promise<{ ok: boolean; error?: string }> {
  try {
    await qstash().schedules.list()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export type PlanResult = {
  user: UserId
  scheduled: number
  cancelled: number
  /** Jo jonossa olevat, joille ei tehty mitään. */
  kept: number
  /** Menneet rivit jotka siivottiin kartasta. */
  pruned: number
  skipped?: 'ei-laitteita' | 'push-pois'
  /**
   * Virheviesti jos tämän käyttäjän suunnittelu kaatui.
   *
   * Yhden käyttäjän kaatuminen ei saa estää toisen suunnittelua, mutta se ei
   * saa myöskään näyttää nollarivin verran onnistumiselta: ilman tätä kenttää
   * kaatunut ajo ja "ei mitään jonotettavaa" ovat kutsujalle sama tulos.
   */
  error?: string
}

/** Tapahtumat jotka kuuluu jonottaa juuri nyt. */
function dueForScheduling(events: MarketEvent[], now: number): MarketEvent[] {
  const from = now + LEAD_FLOOR_MS
  const to = now + HORIZON_MS
  return events.filter(e => e.notifyAt >= from && e.notifyAt <= to)
}

async function cancelQuietly(messageId: string): Promise<void> {
  try {
    await qstash().messages.cancel(messageId)
  } catch (error) {
    // Jo toimitettua tai peruttua viestiä ei voi perua, ja se on odotettavaa
    // eikä virhe: rivi poistetaan kartasta joka tapauksessa.
    console.warn(`[push] viestin peruutus ei onnistunut: ${messageId}`, error)
  }
}

/**
 * Synkronoi käyttäjän jono vastaamaan hänen nykyisiä asetuksiaan ja aikojaan.
 *
 * Kolme asiaa yhdellä kierroksella, koska ne kaikki vertaavat samaa kahta
 * listaa: uudet jonotetaan, poistuneet perutaan, menneet siivotaan. Erillisinä
 * funktioina kartta luettaisiin ja kirjoitettaisiin kolmesti.
 */
export async function planForUser(user: UserId, now = Date.now()): Promise<PlanResult> {
  const [subscriptions, settings] = await Promise.all([
    getSubscriptions(user),
    getNotifySettings(user),
  ])

  const planned = await getPlanned(user)

  // Ei laitteita tai push pois päältä: perutaan kaikki tulevat ja lopetetaan.
  // Jono ei saa jäädä elämään asetuksen jälkeen — muuten ilmoituksia tulisi
  // vielä kahden vuorokauden ajan sen jälkeen kun ne kytkettiin pois.
  if (subscriptions.length === 0 || !settings.push) {
    let cancelled = 0
    for (const entry of Object.values(planned)) {
      if (entry.at > now) {
        await cancelQuietly(entry.messageId)
        cancelled++
      }
    }
    await savePlanned(user, {})
    return {
      user,
      scheduled: 0,
      cancelled,
      kept: 0,
      pruned: 0,
      skipped: subscriptions.length === 0 ? 'ei-laitteita' : 'push-pois',
    }
  }

  const [times, calendar] = await Promise.all([getTradingTimes(user), getCalendar()])
  // Vain välimuistista: kalenterin haku on rate-limitattu ja kuuluu cronille.
  // Puuttuva välimuisti tarkoittaa ettei julkaisuja jonoteta tällä
  // kierroksella — istuntoajat eivät kärsi siitä, ja seuraava ajo kalenterin
  // päivityksen jälkeen jonottaa ne.
  const wanted = dueForScheduling(marketEvents(now, settings, times, calendar?.data ?? []), now)
  const wantedKeys = new Set(wanted.map(e => e.key))

  const next: PlannedMap = {}
  let cancelled = 0
  let pruned = 0
  let kept = 0

  for (const [eventKey, entry] of Object.entries(planned)) {
    // Mennyt: toimitettu tai ohitettu, rivi on turha.
    if (entry.at <= now) {
      pruned++
      continue
    }
    // Ei enää haluttu: aika poistettiin tai istunto kytkettiin pois.
    if (!wantedKeys.has(eventKey)) {
      await cancelQuietly(entry.messageId)
      cancelled++
      continue
    }
    next[eventKey] = entry
    kept++
  }

  let scheduled = 0
  const url = sendUrl()

  for (const event of wanted) {
    if (next[event.key]) continue

    const response = await qstash().publishJSON({
      url,
      body: { user, title: event.title, body: event.body, tag: event.key, url: '/arxcian/trading' },
      // Sekunteina, ei millisekunteina — QStashin oma yksikkö.
      notBefore: Math.floor(event.notifyAt / 1000),
      // Toinen lukko kartan päälle: jos julkaisu onnistuu mutta kartan
      // kirjoitus kaatuu, seuraava ajo ei jonota samaa tapahtumaa uudelleen.
      // QStash hylkää kaksoispisteen deduplikaatiotunnisteessa (400), ja
      // arxcianin avainkonventio käyttää sitä erottimena. Vain tunniste
      // siivotaan — event.key pysyy ennallaan, koska se on sekä
      // planned-kartan avain että ilmoituksen tag.
      deduplicationId: `${user}:${event.key}`.replace(/:/g, '-'),
      // Markkinan avautuminen on ajankohtainen sen istunnon ajan. Kolme
      // uudelleenyritystä riittää ohimenevään katkoon; sen jälkeen ilmoitus
      // olisi joka tapauksessa myöhässä.
      retries: 3,
    })

    next[event.key] = { messageId: response.messageId, at: event.at }
    scheduled++
  }

  await savePlanned(user, next)
  return { user, scheduled, cancelled, kept, pruned }
}

/**
 * Suunnittelee kaikille käyttäjille.
 *
 * Peräkkäin eikä rinnakkain: kummallakin on oma karttansa mutta yhteinen
 * QStash-kiintiö, ja peräkkäinen ajo pitää lokin luettavana kun jokin menee
 * pieleen. Käyttäjiä on kaksi ja viestejä kymmeniä, joten nopeudella ei ole
 * väliä.
 */
export async function planAllUsers(now = Date.now()): Promise<PlanResult[]> {
  const results: PlanResult[] = []
  for (const user of USER_IDS) {
    try {
      results.push(await planForUser(user, now))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[push] suunnittelu epäonnistui: ${user}`, error)
      results.push({ user, scheduled: 0, cancelled: 0, kept: 0, pruned: 0, error: message })
    }
  }
  return results
}

/**
 * Suunnittelu joka ei saa kaataa kutsujaansa.
 *
 * Asetusten tallennus ja treidausajan lisäys kutsuvat tätä, jotta muutos
 * näkyy jonossa heti eikä vasta seuraavassa cron-ajossa. Mutta jos QStash on
 * alhaalla, tallennuksen on silti onnistuttava: käyttäjän aika on tallessa ja
 * seuraava cron-ajo jonottaa sen.
 */
export async function replanQuietly(user: UserId): Promise<void> {
  try {
    await planForUser(user)
  } catch (error) {
    console.error(`[push] uudelleensuunnittelu epäonnistui: ${user}`, error)
  }
}
