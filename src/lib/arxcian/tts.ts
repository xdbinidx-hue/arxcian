import { google } from 'googleapis'

/**
 * Puheentuottaja AI-assistentin vastauksille (Google Cloud Text-to-Speech,
 * Chirp3-HD-ääni). Käyttää samaa palvelutiliä kuin RJ-Mobin Sheets/Drive-
 * haku — GCP-projekti oli jo pystyssä, joten laajensimme sen oikeuksia sen
 * sijaan että olisimme luoneet erillisen tilin pelkkää TTS:ää varten.
 *
 * Ääni on brittienglantia (en-GB) vaikka assistentin muu koodi ja
 * käyttöliittymä on suomeksi — käyttäjän oma valinta, ks.
 * src/app/api/arxcian/assistant/route.ts:n SYSTEM_PROMPT, joka vastaa
 * tarkoituksella englanniksi juuri tätä ääntä varten.
 */
const VOICE = { languageCode: 'en-GB', name: 'en-GB-Chirp3-HD-Sadaltager' }

// Google TTS rajoittaa syötteen 5000 tavuun. Assistentin MAX_TOKENS (1024)
// voisi teoriassa tuottaa tätä pidemmän vastauksen, joten katkaistaan
// varmuuden vuoksi ennen kutsua — muuten yksi pitkä vastaus kaataisi koko
// äänitoiminnon 400-virheeseen tekstivastauksen ollessa silti kunnossa.
const MAX_INPUT_CHARS = 4500

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
}

/**
 * Poistaa markdown-merkinnän ennen puhesynteesiä.
 *
 * Assistentin ohje kieltää korostukset, mutta malli tuottaa niitä silti
 * ajoittain — ja Chirp3-HD ääntää ne kuuluvasti, jolloin vastaus alkaa
 * "tähti tähti Teknologia tähti tähti". Siivous tehdään täällä eikä
 * kutsujassa, jotta jokainen puhereitti saa saman kohtelun ohjeen
 * pettäessä.
 *
 * Yhden alaviivan korostusta ei pureta tarkoituksella: se osuisi myös
 * tavallisiin snake_case-nimiin ja typistäisi ne väärin.
 */
export function speakableText(text: string): string {
  return (
    text
      // [teksti](osoite) → teksti
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      // **lihavointi** ja __lihavointi__ → sisältö
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      // *kursiivi* → sisältö, mutta vain kun tähdet rajaavat sanaa
      .replace(/\*(?=\S)([^*]*?)(?<=\S)\*/g, '$1')
      // `koodi` → koodi
      .replace(/`+([^`]*)`+/g, '$1')
      // otsikot ja lainaukset rivin alussa
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      // vaakaviivat omalla rivillään, ennen luettelomerkkejä ettei "---"
      // typisty pelkäksi viivaksi
      .replace(/^\s*([-*_]\s*){3,}$/gm, '')
      // luettelomerkit rivin alussa
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/** Muuntaa tekstin puheeksi ja palauttaa MP3-tavut. */
export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const spoken = speakableText(text)
  const trimmed = spoken.length > MAX_INPUT_CHARS ? spoken.slice(0, MAX_INPUT_CHARS) : spoken

  const tts = google.texttospeech({ version: 'v1', auth: getAuth() })
  const res = await tts.text.synthesize({
    requestBody: {
      input: { text: trimmed },
      voice: VOICE,
      audioConfig: { audioEncoding: 'MP3' },
    },
  })

  const audioContent = res.data.audioContent
  if (!audioContent) throw new Error('Puhesynteesi ei palauttanut ääntä')
  return Buffer.from(audioContent, 'base64')
}
