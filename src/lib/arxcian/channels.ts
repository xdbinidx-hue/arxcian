import { XMLParser } from 'fast-xml-parser'
import { fetchAndCache, readCached } from './cache'
import { kv } from './kv'
import { writeAttempt } from './fetchStatus'
import { fetchYoutubeFeed, YoutubeFeedError } from './youtube'

/**
 * Seurattujen YouTube-kanavien uusimmat videot hubin KANAVAT-paneeliin.
 *
 * Sama julkinen RSS-syöte kuin trading/ict.ts käyttää — ei API-avainta eikä
 * kiintiötä. ICT on tarkoituksella yhä omassa tiedostossaan: Trading-osio
 * näyttää siitä koko videolistan, kun taas tämä hakee yhden tuoreimman per
 * kanava. Sama syöte kahdessa käyttötarkoituksessa, eri muoto.
 *
 * Itse haku, otsakkeet ja uudelleenyritys ovat [youtube.ts](youtube.ts):ssä,
 * yhteisenä kaikille kolmelle kutsujalle.
 *
 * Kanava-ID:t on ratkaistu kanavasivuilta ja syötteet varmistettu käsin
 * toimiviksi 19.8.2026 (kaikki viisi HTTP 200). ID on pysyvä vaikka kanava
 * vaihtaisi nimeä tai @-tunnusta, joten se on oikea asia kovakoodata —
 * @-tunnus ei olisi.
 */

export type ChannelVideo = {
  /** Kanavan näyttönimi, ei videon julkaisijakenttä */
  channel: string
  id: string
  title: string
  link: string
  thumbnail: string
  publishedAt: number | null
}

type Channel = { name: string; channelId: string }

const CHANNELS: readonly Channel[] = [
  { name: 'Joe Rogan', channelId: 'UCzQUP1qoWDoEbmsQxvdjxgQ' },
  { name: 'Alex Hormozi', channelId: 'UCrvchO1h6lWZAuGaa1LqX9Q' },
  { name: 'ICT Trading', channelId: 'UCtjxa77NqamhVC8atV85Rog' },
  { name: 'Dan Martell', channelId: 'UCA-mWX9CvCTVFWRMb9bKc9w' },
  { name: 'Iman Gadzhi', channelId: 'UC-l4IawN1e_eHns1NmkoKTg' },
]

export const CHANNELS_CACHE_KEY = 'hub:channels'

const TTL_SECONDS = 60 * 60

/**
 * Aikakatkaisu on väljempi kuin cache.ts:n 15 s oletus, koska yksi kanava voi
 * käyttää kolme yritystä viiveineen ennen kuin se luovuttaa.
 */
const TIMEOUT_MS = 30_000

/**
 * Montako perättäistä ajoa kanavan on kaaduttava ennen kuin sitä epäillään
 * poistuneeksi. Neljä ajoa vuorokaudessa, eli 12 ≈ kolme vuorokautta.
 *
 * Raja on tahallaan korkea: YouTube vastaa yksittäiseen hakuun 404:llä myös
 * silloin kun kanava on aivan olemassa (ks. youtube.ts), joten matala raja
 * merkitsisi eläviä kanavia kuolleiksi.
 */
const POISSA_RAJA = 12

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '__text',
  trimValues: true,
})

function attr(node: unknown, key: string): string {
  if (node && typeof node === 'object') {
    const v = (node as Record<string, unknown>)[`@_${key}`]
    if (typeof v === 'string') return v
  }
  return ''
}

function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const inner = (value as { __text?: unknown }).__text
    if (typeof inner === 'string') return inner
  }
  return ''
}

/** Uusin video yhdeltä kanavalta, tai null jos syöte on tyhjä. */
async function fetchLatest(channel: Channel): Promise<ChannelVideo | null> {
  const xml = await fetchYoutubeFeed(channel.channelId, channel.name)

  const doc = parser.parse(xml)
  const rawEntries = doc?.feed?.entry
  const entries: unknown[] = Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : []
  const first = entries[0] as Record<string, unknown> | undefined
  if (!first) return null

  const link = first.link as { '@_href'?: string } | undefined
  const mediaGroup = first['media:group'] as Record<string, unknown> | undefined
  const published = Date.parse(text(first.published))

  return {
    channel: channel.name,
    id: text(first['yt:videoId']),
    title: text(first.title),
    link: link?.['@_href'] ?? '',
    thumbnail: attr(mediaGroup?.['media:thumbnail'], 'url'),
    publishedAt: Number.isNaN(published) ? null : published,
  }
}

/**
 * Perättäisten epäonnistumisten laskuri, kanavakohtaisesti.
 *
 * `null` = laskuria ei saatu luettua (Redis poissa). Se on eri asia kuin
 * nolla: nolla väittäisi ettei kanava ole kaatunut kertaakaan, mikä on juuri
 * päinvastoin kuin mitä juuri tapahtui.
 */
async function bumpFailCount(channelId: string): Promise<number | null> {
  try {
    const key = `arxcian:youtube:fail:${channelId}`
    const n = await kv().incr(key)

    // TTL joka kerta uudelleen: listalta poistetun kanavan laskuri ei jää
    // Redisiin ikuisesti, ja yhä kaatuva kanava pitää omansa elossa.
    //
    // Omassa try/catchissaan, koska tämä on siivousta: jos vanhenemisen
    // asetus kaatuu, laskuri on silti kasvanut ja sen lukema on oikea. Saman
    // catchin alla epäonnistunut expire palauttaisi `null`in ja estäisi
    // ikuisesti nousun "lähde poissa" -tilaan, vaikka luku kasvaisi.
    try {
      await kv().expire(key, 30 * 24 * 60 * 60)
    } catch {
      // Vanheneminen jää asettamatta — laskuri toimii silti.
    }

    return n
  } catch (e) {
    console.error(`[channels] laskurin kasvatus epäonnistui: ${channelId}`, e)
    return null
  }
}

async function clearFailCount(channelId: string): Promise<void> {
  try {
    await kv().del(`arxcian:youtube:fail:${channelId}`)
  } catch {
    // Laskurin siivous on kosmetiikkaa — ei kaadeta hakua sen takia.
  }
}

function statusOf(reason: unknown): string {
  return reason instanceof YoutubeFeedError
    ? reason.status === null
      ? 'ei vastausta'
      : `HTTP ${reason.status}`
    : String(reason)
}

/**
 * Erottaa "haku rikki" ja "lähde poissa" toisistaan lokissa.
 *
 * **Statuskoodi yksinään ei kelpaa erottimeen.** YouTube vastaa 404:llä sekä
 * poistuneeseen kanavaan että estettyyn pyyntöön, joten koodin perusteella ei
 * voi päättää poistaako kanavan listalta. Erotin on sen sijaan **saman ajon
 * muiden kanavien tulos**:
 *
 * - **Enemmistö kaatui** → vika on hakuyhteydessä, ei kanavissa. Yksi lokirivi
 *   koko ajosta, eikä kanavakohtaisia laskureita kosketa — muuten kolmen
 *   vuorokauden katkos merkitsisi kaikki kanavat poistuneiksi.
 * - **Enemmistö onnistui** → kaatunut kanava on aidosti oma tapauksensa.
 *   Kasvatetaan sen laskuria, ja vasta rajan ylittyessä sanotaan se poissa.
 *
 * Raja on enemmistössä eikä yhdessä onnistujassa, koska esto osuu osittain:
 * sama ajo lokitti sekä 404:iä että 500:ia. Yksi läpi päässyt kanava ei saa
 * riittää siihen että neljä muuta elävää kanavaa merkitään poistuneiksi.
 * Kääntöpuoli on tiedostettu: jos enemmistö kanavista oikeasti kuolisi
 * yhtaikaa, niitä ei merkittäisi poissaoleviksi. Se on harvinaisempi ja
 * halvempi virhe kuin elävän kanavan poistaminen listalta.
 */
async function reportOutcome(
  onnistuneet: Channel[],
  kaatuneet: { channel: Channel; reason: unknown }[],
): Promise<void> {
  if (kaatuneet.length === 0) {
    await Promise.all(onnistuneet.map(c => clearFailCount(c.channelId)))
    return
  }

  if (kaatuneet.length > onnistuneet.length) {
    const statukset = kaatuneet.map(k => `${k.channel.name} ${statusOf(k.reason)}`).join(', ')
    const laajuus =
      onnistuneet.length === 0
        ? `kaikki ${kaatuneet.length} kanavaa`
        : `${kaatuneet.length}/${CHANNELS.length} kanavaa`
    console.error(
      `[channels] haku rikki — ${laajuus} kaatui (${statukset}). ` +
        'Yhteinen syy, ei kanavavika: YouTube rajoittaa konesali-IP:tä. Kanavia ei merkitä poistuneiksi.',
    )
    await Promise.all(onnistuneet.map(c => clearFailCount(c.channelId)))
    return
  }

  await Promise.all(onnistuneet.map(c => clearFailCount(c.channelId)))

  for (const { channel, reason } of kaatuneet) {
    const perakkain = await bumpFailCount(channel.channelId)

    if (perakkain !== null && perakkain >= POISSA_RAJA) {
      console.error(
        `[channels] lähde poissa — ${channel.name} (${channel.channelId}) on kaatunut ` +
          `${perakkain} perättäistä ajoa vaikka muut kanavat vastaavat. Tarkista onko kanava olemassa ` +
          'ja poista rivi CHANNELS-listalta jos ei.',
      )
    } else {
      const laskuri = perakkain === null ? 'laskuria ei saatu' : `${perakkain}. perättäinen`
      console.error(
        `[channels] ohimenevä virhe — ${channel.name}: ${statusOf(reason)} (${laskuri}). ` +
          'Muut kanavat onnistuivat, joten lähdettä ei epäillä vielä poistuneeksi.',
      )
    }
  }
}

/**
 * Kaikkien kanavien tuoreimmat, uusin ensin.
 *
 * Yksi kaatuva kanava ei vie muita mukanaan — siksi `Promise.allSettled` eikä
 * `Promise.all`.
 */
async function fetchChannels(): Promise<ChannelVideo[]> {
  const settled = await Promise.allSettled(CHANNELS.map(fetchLatest))

  const videos: ChannelVideo[] = []
  const onnistuneet: Channel[] = []
  const kaatuneet: { channel: Channel; reason: unknown }[] = []

  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      onnistuneet.push(CHANNELS[i])
      if (result.value) videos.push(result.value)
    } else {
      kaatuneet.push({ channel: CHANNELS[i], reason: result.reason })
    }
  })

  await reportOutcome(onnistuneet, kaatuneet)

  // Kaatuneen kanavan viimeksi tunnettu video säilytetään.
  //
  // `fetchAndCache` korvaa listan kokonaan eikä yhdistä, joten ilman tätä yksi
  // kaatunut kanava pyyhkisi senkin videon jonka edellinen ajo haki — paneeli
  // kutistuisi viidestä neljään vaikka mitään ei ole poistunut. Sama periaate
  // kuin vanhentuneen datan palauttamisessa, vain kanavan tarkkuudella.
  //
  // **Vain osittaisessa onnistumisessa.** Jos kaikki kaatuivat, listaa ei saa
  // täydentää: silloin `videos` ei jäisi tyhjäksi, alla oleva heitto jäisi
  // tekemättä ja cron raportoisi `"ok": true` haulle jota ei tapahtunut —
  // täsmälleen se bugi jota tämä muutos korjaa.
  if (kaatuneet.length > 0 && onnistuneet.length > 0) {
    const edellinen = (await readCached<ChannelVideo[]>(CHANNELS_CACHE_KEY))?.data ?? []
    for (const { channel } of kaatuneet) {
      const vanhaVideo = edellinen.find(v => v.channel === channel.name)
      if (vanhaVideo) videos.push(vanhaVideo)
    }
  }

  // Tila kirjoitetaan ennen mahdollista heittoa, jotta myös täysin
  // epäonnistunut ajo jättää jäljen. Ilman tätä käyttöliittymä näkisi vain
  // vanhan onnistumisen eikä tietäisi että sen jälkeen on yritetty ja kaaduttu.
  await writeAttempt(CHANNELS_CACHE_KEY, {
    ok: onnistuneet.length,
    failed: kaatuneet.map(k => k.channel.name),
  })

  // Jos jokainen kanava kaatui, heitetään — muuten fetchAndCache tallentaisi
  // tyhjän listan onnistuneena tuloksena ja paneeli näyttäisi tyhjää koko
  // välimuistin voimassaolon ajan. Heitto vie vanhentuneen datan reitille,
  // joka on koko välimuistin periaate: vanha data on parempi kuin ei mitään.
  if (videos.length === 0 && CHANNELS.length > 0) {
    throw new Error('Yhtään kanavaa ei saatu haettua')
  }

  return videos.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
}

/**
 * `force` on cronia varten: ilman sitä ajastettu haku palauttaa tuoreen
 * välimuistin eikä ota yhteyttä YouTubeen lainkaan. Juuri niin kävi — cron
 * raportoi `"ok": true, "items": 5` 51 millisekunnissa tekemättä yhtään hakua.
 */
export async function getChannelVideos(force = false) {
  return fetchAndCache(
    { key: CHANNELS_CACHE_KEY, ttl: TTL_SECONDS, timeout: TIMEOUT_MS, force },
    fetchChannels,
  )
}
