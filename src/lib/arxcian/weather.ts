import { fetchAndCache } from './cache'
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

export type WeatherData = {
  location: typeof DEFAULT_LOCATION
  current: WeatherNow
  /** Seuraavat 24h, tunneittain */
  hourly: { time: string; temperature: number; precipitationProbability: number }[]
}

const CACHE_KEY = 'weather:current'
const TTL_SECONDS = 20 * 60

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
}

async function fetchFromOpenMeteo(): Promise<WeatherData> {
  const { lat, lon } = DEFAULT_LOCATION
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,wind_speed_10m,precipitation,weather_code,is_day` +
    `&hourly=temperature_2m,precipitation_probability&forecast_days=2&timezone=Europe%2FHelsinki`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Open-Meteo: HTTP ${res.status}`)
  const data = (await res.json()) as OpenMeteoResponse

  const now = new Date()
  const hourly = data.hourly.time
    .map((time, i) => ({
      time,
      temperature: data.hourly.temperature_2m[i],
      precipitationProbability: data.hourly.precipitation_probability[i],
    }))
    .filter(h => new Date(h.time) >= now)
    .slice(0, 24)

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
  }
}

export async function getWeather() {
  return fetchAndCache({ key: CACHE_KEY, ttl: TTL_SECONDS }, fetchFromOpenMeteo)
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

export async function getCityWeather() {
  return fetchAndCache({ key: CITIES_CACHE_KEY, ttl: TTL_SECONDS }, fetchCityWeather)
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
