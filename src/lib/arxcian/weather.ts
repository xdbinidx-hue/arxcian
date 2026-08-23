import { fetchAndCache } from './cache'
import { nowLocalISOHelsinki } from './time'
import { GLOBE_CITIES } from './globe/cities'

// Oletussijainti Helsinki, koska Albin ja Arbnor toimivat pääkaupunkiseudulla.
// Ei kysyttävissä käyttäjältä nyt — jos joku muu sijainti on tarpeen, se on
// helppo tehdä valittavaksi myöhemmin ilman rakennemuutosta.
export const DEFAULT_LOCATION = { name: 'Helsinki', lat: 60.1699, lon: 24.9384 }

export type WeatherNow = {
  temperature: number
  apparentTemperature: number
  windSpeed: number
  precipitation: number
  weatherCode: number
  isDay: boolean
}

export type SunDay = {
  /** YYYY-MM-DD paikallista aikaa */
  date: string
  /** Paikallisaika ilman vyöhykemerkintää, esim. 2026-08-12T05:12 */
  sunrise: string
  sunset: string
  /** Päivän pituus sekunteina */
  daylightSeconds: number
}

export type WeatherData = {
  location: typeof DEFAULT_LOCATION
  current: WeatherNow
  /** Seuraavat 24h, tunneittain */
  hourly: { time: string; temperature: number; precipitationProbability: number }[]
  /**
   * Auringonnousu ja -lasku, tänään ja huomenna.
   *
   * Valinnainen tarkoituksella: kenttä lisättiin jälkikäteen, ja välimuistissa
   * ehtii olla vanhan muotoisia merkintöjä TTL:n loppuun asti. Lukija ei siis
   * saa olettaa sitä olemassa olevaksi.
   */
  daily?: SunDay[]
}

const CACHE_KEY = 'weather:current'

/**
 * Neljä tuntia eli cronin ajoväli (8, 12, 16, 20).
 *
 * Aiempi 20 min oli lyhyempi kuin ajoväli, jolloin välimuisti oli lähes aina
 * umpeutunut kun hub avattiin ja sivulataus haki itse — vastoin periaatetta
 * "sivulataus ei odota ulkoista lähdettä jos välimuistissa on tuoretta dataa".
 *
 * Hinta on tiedossa ja hyväksytty: näytetty lämpötila voi olla neljä tuntia
 * vanha. Se ei jää piiloon, koska paneeli näyttää hakuajan otsikkorivillään
 * ([panelStatusLogic.ts](panelStatusLogic.ts)) — vanha luku on eri asia kuin
 * vanha luku josta ei kerrota. Yön yli ajoväli on 12 h, jolloin TTL umpeutuu
 * ja ensimmäinen aamun avaaja hakee itse; Suspense-raja pitää huolen ettei
 * sivun runko odota sitä.
 */
const TTL_SECONDS = 4 * 60 * 60

type OpenMeteoResponse = {
  current: {
    temperature_2m: number
    apparent_temperature: number
    wind_speed_10m: number
    precipitation: number
    weather_code: number
    is_day: number
  }
  hourly: {
    time: string[]
    temperature_2m: number[]
    precipitation_probability: number[]
  }
  /** Puuttuu jos Open-Meteo ei palauta daily-lohkoa. */
  daily?: {
    time: string[]
    /** null napapäivänä ja -yönä — Helsingissä ei tapahdu, mutta tyyppi kertoo sen. */
    sunrise: (string | null)[]
    sunset: (string | null)[]
    daylight_duration: (number | null)[]
  }
}

async function fetchFromOpenMeteo(): Promise<WeatherData> {
  const { lat, lon } = DEFAULT_LOCATION
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,wind_speed_10m,precipitation,weather_code,is_day` +
    `&hourly=temperature_2m,precipitation_probability` +
    `&daily=sunrise,sunset,daylight_duration&forecast_days=2&timezone=Europe%2FHelsinki`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Open-Meteo: HTTP ${res.status}`)
  const data = (await res.json()) as OpenMeteoResponse

  // Vertailu merkkijonona eikä Daten kautta: leimat ovat vyöhykemerkinnätöntä
  // Helsingin aikaa, jolloin new Date() tulkitsisi ne Vercelin UTC-vyöhykkeellä
  // ja ennuste alkaisi kesällä kolme tuntia menneisyydestä. Sama ansa jonka
  // sunClock kiertää — virhe ei näy paikallisessa kehityksessä, koska Macin
  // vyöhyke on Europe/Helsinki.
  const now = nowLocalISOHelsinki()
  const hourly = data.hourly.time
    .map((time, i) => ({
      time,
      temperature: data.hourly.temperature_2m[i],
      precipitationProbability: data.hourly.precipitation_probability[i],
    }))
    .filter(h => h.time >= now)
    .slice(0, 24)

  const daily = (data.daily?.time ?? []).flatMap<SunDay>((date, i) => {
    const sunrise = data.daily?.sunrise[i]
    const sunset = data.daily?.sunset[i]
    const daylight = data.daily?.daylight_duration[i]
    if (typeof sunrise !== 'string' || typeof sunset !== 'string') return []
    return [{ date, sunrise, sunset, daylightSeconds: daylight ?? 0 }]
  })

  return {
    location: DEFAULT_LOCATION,
    current: {
      temperature: data.current.temperature_2m,
      apparentTemperature: data.current.apparent_temperature,
      windSpeed: data.current.wind_speed_10m,
      precipitation: data.current.precipitation,
      weatherCode: data.current.weather_code,
      isDay: data.current.is_day === 1,
    },
    hourly,
    daily,
  }
}

export const WEATHER_CACHE_KEY = CACHE_KEY

export async function getWeather(force = false) {
  return fetchAndCache({ key: CACHE_KEY, ttl: TTL_SECONDS, force }, fetchFromOpenMeteo)
}

/* ---------------------------------------------------------------
   Auringonnousun ja -laskun apurit.
   --------------------------------------------------------------- */

/**
 * Annetun päivän auringonnousu ja -lasku, tai null jos sitä päivää ei ole.
 *
 * Vain täsmäosuma kelpaa. Aiempi varahaara palautti ensimmäisen tulevan
 * päivän, jolloin vanhentunut välimuisti olisi näyttänyt huomisen nousun ja
 * laskun tämän päivän lukuina ilman mitään merkkiä siitä — juuri se mitä
 * aurinkopaneelilta ei haluta. Tyhjä lohko on rehellisempi kuin väärän päivän
 * kellonaika. Open-Meteon daily alkaa aina tästä päivästä, joten normaalisti
 * osuma löytyy; null tarkoittaa että data on eri päivältä tai vanhan muotoinen
 * merkintä ilman daily-kenttää.
 */
export function pickSunDay(daily: SunDay[] | undefined, isoDate: string): SunDay | null {
  if (!daily || daily.length === 0) return null
  return daily.find(d => d.date === isoDate) ?? null
}

/**
 * "05:12" Open-Meteon paikallisajasta.
 *
 * Merkkijono luetaan sellaisenaan eikä Daten kautta: Open-Meteo palauttaa
 * timezone=Europe/Helsinki -parametrilla jo Suomen ajan ilman vyöhykemerkintää
 * ("2026-08-12T05:12"), jolloin new Date() tulkitsisi sen palvelimen omalla
 * vyöhykkeellä ja Vercelin UTC-ympäristössä kello siirtyisi kolme tuntia.
 */
export function sunClock(localIso: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(localIso)
  return match ? `${match[1]}:${match[2]}` : '—'
}

/** "16 h 19 min" — päivän pituus luettavana. */
export function daylightLabel(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60))
  return `${Math.floor(total / 60)} h ${total % 60} min`
}

/* ---------------------------------------------------------------
   Maapallon Weather-kerros: usean kaupungin nykysää yhdellä kutsulla.
   --------------------------------------------------------------- */

export type CityWeather = {
  name: string
  lat: number
  lon: number
  temperature: number
  weatherCode: number
  isDay: boolean
}

/**
 * Välimuistiavain johdetaan kaupunkilistasta, jottei listan muuttaminen jätä
 * vanhoja kaupunkeja näkyviin. Kiinteällä avaimella poistettu kaupunki
 * palautuisi välimuistista TTL:n loppuun asti — tämä havaittiin kun listan
 * vaihdon jälkeen kartalla näkyi yhä Lagos.
 */
function citiesFingerprint(): string {
  const s = GLOBE_CITIES.map(c => `${c.name}:${c.lat}:${c.lon}`).join(',')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}

export const CITIES_CACHE_KEY = `weather:cities:${citiesFingerprint()}`

/** Vastaus on TAULUKKO kun sijainteja on useita, ja samassa järjestyksessä kuin syöte. */
type OpenMeteoCity = {
  current: { temperature_2m: number; weather_code: number; is_day: number }
}

async function fetchCityWeather(): Promise<CityWeather[]> {
  const lats = GLOBE_CITIES.map(c => c.lat).join(',')
  const lons = GLOBE_CITIES.map(c => c.lon).join(',')
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
    `&current=temperature_2m,weather_code,is_day&timezone=UTC`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Open-Meteo: HTTP ${res.status}`)
  const data = (await res.json()) as OpenMeteoCity[]

  // Sijainnit luetaan omasta listasta eikä vastauksesta: Open-Meteo pyöristää
  // koordinaatit hilaansa (esim. 24,9384 → 24,9452), jolloin piste ei osuisi
  // tarkalleen haluttuun kohtaan pallolla.
  return GLOBE_CITIES.map((city, i) => ({
    name: city.name,
    lat: city.lat,
    lon: city.lon,
    temperature: data[i]?.current.temperature_2m ?? 0,
    weatherCode: data[i]?.current.weather_code ?? 0,
    isDay: data[i]?.current.is_day === 1,
  })).filter((_, i) => data[i] !== undefined)
}

export async function getCityWeather(force = false) {
  // force on cronia varten. Kun TTL nostettiin ajovälin mittaiseksi, ilman
  // lippua ajastettu työ palauttaisi tuoreen välimuistin tekemättä hakua ja
  // raportoisi silti onnistuneensa — sama tyhjäkäynti kuin `hub-channels`illa
  // (ks. CLAUDE.md). Lyhyellä TTL:llä vika ei näkynyt, koska välimuisti oli
  // ajon hetkellä aina jo umpeutunut.
  return fetchAndCache({ key: CITIES_CACHE_KEY, ttl: TTL_SECONDS, force }, fetchCityWeather)
}

/** WMO-säätunnuksen suomenkielinen kuvaus ja ikonimerkki (Open-Meteon weather_code). */
export function describeWeatherCode(code: number): { label: string; icon: string } {
  const table: Record<number, { label: string; icon: string }> = {
    0: { label: 'Selkeää', icon: '☀️' },
    1: { label: 'Enimmäkseen selkeää', icon: '🌤️' },
    2: { label: 'Puolipilvistä', icon: '⛅' },
    3: { label: 'Pilvistä', icon: '☁️' },
    45: { label: 'Sumua', icon: '🌫️' },
    48: { label: 'Huurresumua', icon: '🌫️' },
    51: { label: 'Heikkoa tihkua', icon: '🌦️' },
    53: { label: 'Tihkua', icon: '🌦️' },
    55: { label: 'Tiheää tihkua', icon: '🌦️' },
    61: { label: 'Heikkoa sadetta', icon: '🌧️' },
    63: { label: 'Sadetta', icon: '🌧️' },
    65: { label: 'Rankkaa sadetta', icon: '🌧️' },
    71: { label: 'Heikkoa lumisadetta', icon: '🌨️' },
    73: { label: 'Lumisadetta', icon: '🌨️' },
    75: { label: 'Rankkaa lumisadetta', icon: '❄️' },
    80: { label: 'Sadekuuroja', icon: '🌦️' },
    81: { label: 'Kuuroja', icon: '🌧️' },
    82: { label: 'Rajuja kuuroja', icon: '⛈️' },
    95: { label: 'Ukkosta', icon: '⛈️' },
    96: { label: 'Ukkosta ja raekuuroja', icon: '⛈️' },
    99: { label: 'Voimakasta ukkosta', icon: '⛈️' },
  }
  return table[code] ?? { label: 'Ei tietoa', icon: '❔' }
}
