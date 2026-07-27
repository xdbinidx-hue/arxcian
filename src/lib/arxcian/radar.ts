import { fetchAndCache } from './cache'

const CACHE_KEY = 'weather:radar'
const TTL_SECONDS = 8 * 60 // RainViewer päivittää tutkakuvan n. 10 min välein

type RainViewerResponse = {
  host: string
  radar: { past: { time: number; path: string }[] }
}

async function fetchLatestRadarTile(): Promise<string> {
  const res = await fetch('https://api.rainviewer.com/public/weather-maps.json')
  if (!res.ok) throw new Error(`RainViewer: HTTP ${res.status}`)
  const data = (await res.json()) as RainViewerResponse

  const latest = data.radar.past.at(-1)
  if (!latest) throw new Error('RainViewer ei palauttanut tutkakehyksiä')

  // {z}/{x}/{y} jää Leafletin täytettäväksi, 256px tiilet, väripaletti 2, ei lumen erottelua.
  return `${data.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`
}

export async function getRadarTileUrl() {
  return fetchAndCache({ key: CACHE_KEY, ttl: TTL_SECONDS }, fetchLatestRadarTile)
}
