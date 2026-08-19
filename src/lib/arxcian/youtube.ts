/**
 * YouTuben julkisen Atom-syötteen haku — yksi paikka koko sovellukselle.
 *
 * Samaa syötettä käyttää kolme kutsujaa: hubin [channels.ts](channels.ts),
 * Tradingin [trading/ict.ts](trading/ict.ts) ja Uutisten Mark Moss -lähde.
 * Ennen tätä otsakkeet ja virheenkäsittely olivat kopioituna kahteen niistä,
 * jolloin YouTuben rikkoessa haun toinen jäi korjaamatta — ja niin kävikin.
 *
 * ## Miksi uudelleenyritys on olemassa
 *
 * YouTube rajoittaa Vercelin jaettuja konesali-IP-osoitteita **ajoittain**.
 * Selvitys 19.8.2026: tuotanto lokitti `HTTP 404` ja `HTTP 500` jokaiselle
 * kanavalle klo 08:00 ajossa, ja klo 20:00 ajo samana päivänä haki kaikki
 * viisi kanavaa onnistuneesti. Samaan aikaan kaikki kanava-ID:t vastasivat
 * `HTTP 200` kotiverkosta. Kyse ei siis ole poistuneista kanavista, muuttuneesta
 * osoitteesta eikä puuttuvasta avaimesta, vaan lähettävästä IP-osoitteesta.
 *
 * **404 on tässä botinestovastaus, ei "kanavaa ei ole".** Siksi se on
 * uusittavien koodien joukossa, ja siksi yksittäisestä 404:stä ei saa päätellä
 * että kanava kannattaa poistaa listalta.
 *
 * Uudelleenyritys ei auta jos esto muuttuu pysyväksi. Silloin vaihtoehdot ovat
 * YouTube Data API v3 (vaatii uuden avaimen) tai haun siirto GitHub
 * Actionsiin. Ero on siinä, että kutsuja saa nyt luokitellun virheen ja voi
 * kertoa sen käyttäjälle sen sijaan että vika jäisi lokiin.
 */

/**
 * Otsakkeet joilla YouTube suostuu palvelemaan syötteen.
 *
 * Lisätty 11.8.2026 oletuksella että bottimainen User-Agent oli syy siihen
 * ettei haku toiminut Vercelistä. **Oletus oli väärä:** haku palauttaa 200
 * kotiverkosta myös täysin ilman otsakkeita, ja vika jatkui otsakkeiden
 * lisäämisen jälkeen kahdeksan päivää. Otsakkeet ovat silti tallella — ne
 * eivät maksa mitään, ja `CONSENT`-eväste on aidosti tarpeen ettei YouTube
 * ohjaa suostumussivulle joissain tapauksissa.
 */
const YOUTUBE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Cookie: 'CONSENT=YES+cb',
}

/** Yritysten määrä yhtä syötettä kohti. */
const ATTEMPTS = 3

/**
 * Viive ennen kutakin yritystä, millisekunteina. Ensimmäinen menee heti.
 *
 * Hajonta lisätään päälle, jottei viisi rinnakkaista kanavahakua osu
 * uudelleen samaan hetkeen — juuri se rypäs saattaa olla se mikä laukaisee
 * rajoituksen.
 */
const BACKOFF_MS = [0, 500, 1500]

/** Statuskoodit joiden kohdalla kannattaa yrittää uudelleen. */
function worthRetrying(status: number): boolean {
  // 404 on mukana tarkoituksella, ks. tiedoston yläkommentti.
  return status === 403 || status === 404 || status === 408 || status === 429 || status >= 500
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Syötteen haku epäonnistui kaikilla yrityksillä.
 *
 * Kantaa statuskoodin, jotta kutsuja voi erottaa "haku rikki" ja "lähde
 * poissa" toisistaan. Statuskoodi **yksinään ei riitä** siihen päättelyyn —
 * ks. channels.ts:n luokittelu.
 */
export class YoutubeFeedError extends Error {
  /** Viimeisin HTTP-status, tai null jos haku ei päässyt vastaukseen asti. */
  readonly status: number | null
  readonly attempts: number

  constructor(label: string, status: number | null, attempts: number, cause?: unknown) {
    const syy = status === null ? 'ei vastausta' : `HTTP ${status}`
    super(`${label}: ${syy} (${attempts} yritystä)`)
    this.name = 'YoutubeFeedError'
    this.status = status
    this.attempts = attempts
    this.cause = cause
  }
}

/**
 * Hakee yhden kanavan Atom-syötteen XML-tekstinä.
 *
 * `label` on vain virheviestiä varten — kanavan näyttönimi tai lähteen nimi.
 * Heittää `YoutubeFeedError`in jos kaikki yritykset kaatuvat.
 */
export async function fetchYoutubeFeed(channelId: string, label: string): Promise<string> {
  return fetchYoutubeFeedUrl(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
    label,
  )
}

/**
 * Sama kuin `fetchYoutubeFeed`, mutta valmiilla osoitteella.
 *
 * Uutisten lähdelistassa syöte on tallessa kokonaisena URL:na eikä kanava-ID:nä
 * ([news/sources.ts](news/sources.ts)), joten sen ei tarvitse purkaa ID:tä
 * ulos vain rakentaakseen saman osoitteen uudelleen.
 */
export async function fetchYoutubeFeedUrl(url: string, label: string): Promise<string> {
  let lastStatus: number | null = null
  let lastCause: unknown = undefined
  let tehdyt = 0

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const wait = BACKOFF_MS[attempt]
    if (wait > 0) await sleep(wait + Math.random() * 250)

    tehdyt++
    try {
      const res = await fetch(url, { headers: YOUTUBE_HEADERS })

      if (res.ok) return await res.text()

      lastStatus = res.status
      lastCause = undefined
      // Esim. 400 tai 410 ei parane uusimalla — turha odottaa loppuun asti.
      if (!worthRetrying(res.status)) break
    } catch (e) {
      // Verkkovirhe (DNS, katkennut yhteys). Uusitaan aina.
      lastStatus = null
      lastCause = e
    }
  }

  throw new YoutubeFeedError(label, lastStatus, tehdyt, lastCause)
}
