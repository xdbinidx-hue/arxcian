import { speakableText } from '@/lib/arxcian/speakable'
import { TTS_MODEL } from '@/lib/arxcian/models'

/**
 * Puheentuottaja AI-assistentin vastauksille (ElevenLabs).
 *
 * Korvasi Google Cloud TTS:n (Chirp3-HD): ääni on selvästi luonnollisempi ja
 * Flash v2.5 vastaa nopeammin, mikä on tässä koko pointti — assistentin vastaus
 * luetaan ääneen lause kerrallaan jo generoinnin aikana, joten jokainen sadasosa
 * synteesin viiveestä kuuluu käyttäjälle taukona.
 *
 * Funktion sopimus `(text) => Promise<Buffer>` säilyi ennallaan, joten
 * /api/arxcian/tts ja selaimen puhejono (lib/arxcian/speechQueue.ts) eivät
 * muuttuneet lainkaan. googleapis on yhä riippuvuutena — RJ-Mobin Sheets- ja
 * Drive-haku käyttävät sitä.
 */

/**
 * Ääni ja avain tulevat ympäristöstä, ja **molemmat ovat pakollisia**.
 *
 * Puuttuvasta asetuksesta ei palata hiljaisesti Googleen: kaksi rinnakkaista
 * ääntä tarkoittaisi että tuotannossa voi kuulua eri ääni kuin kehityksessä
 * ilman että kukaan huomaa mitään olevan vialla. Selkeä virhe kertoo heti mikä
 * puuttuu.
 */
function config() {
  const apiKey = process.env.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY puuttuu')
  if (!voiceId) throw new Error('ELEVENLABS_VOICE_ID puuttuu')
  return { apiKey, voiceId }
}

/**
 * Striimaava päätepiste tavallisen sijaan, vaikka tavut puretaan tässä
 * kokonaiseksi puskuriksi: ElevenLabs aloittaa lähetyksen heti ensimmäisistä
 * valmiista tavuista sen sijaan että odottaisi koko tiedoston valmistumista,
 * joten sama vastaus on kokonaan perillä aiemmin.
 */
const API_BASE = 'https://api.elevenlabs.io/v1/text-to-speech'

/** mp3_44100_128 on rajapinnan oletus ja käytettävissä kaikilla tasoilla. */
const OUTPUT_FORMAT = 'mp3_44100_128'

/**
 * Synteesin aikakatkaisu. Flash v2.5 vastaa lauseeseen tyypillisesti alle
 * sekunnissa, joten 20 s tarkoittaa käytännössä vain sitä ettei jumittunut
 * yhteys jätä selaimen puhejonoa odottamaan loputtomiin.
 */
const TIMEOUT_MS = 20_000

/**
 * Yhden pyynnön merkkikatto.
 *
 * Flash v2.5 hyväksyisi selvästi pidemmän syötteen, mutta laskutus on
 * merkkipohjaista: yksi karannut vastaus ei saa muuttua yhdeksi isoksi
 * laskuriviksi. Selain pilkkoo vastauksen muutenkin lauseiksi, joten tähän
 * rajaan osuu käytännössä vain väärinkäyttö tai bugi.
 */
const MAX_INPUT_CHARS = 4500

/**
 * Muuntaa tekstin puheeksi ja palauttaa MP3-tavut.
 *
 * Markdownin siivous (speakableText) on lib/arxcian/speakable.ts:ssä, koska
 * selain tarvitsee samaa funktiota lauseiksi pilkkomiseen eikä voi tuoda tätä
 * tiedostoa. Siivous ajetaan silti myös täällä: reitti on julkinen rajapinta,
 * eikä se saa luottaa kutsujan siivonneen tekstin.
 *
 * Kieltä ei pakoteta (`language_code`), koska sama funktio tuottaa sekä
 * assistentin englanninkieliset vastaukset että suomenkielisen tervehdyksen —
 * malli tunnistaa kielen tekstistä.
 */
export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const { apiKey, voiceId } = config()

  const spoken = speakableText(text)
  const trimmed = spoken.length > MAX_INPUT_CHARS ? spoken.slice(0, MAX_INPUT_CHARS) : spoken
  if (!trimmed) throw new Error('Puhesynteesille ei annettu tekstiä')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${API_BASE}/${encodeURIComponent(voiceId)}/stream?output_format=${OUTPUT_FORMAT}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({ text: trimmed, model_id: TTS_MODEL }),
      signal: controller.signal,
      cache: 'no-store',
    })
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    // Virheen runko on JSONia ja kertoo syyn (väärä ääni, kiintiö täynnä,
    // kelpaamaton avain). Se kuuluu lokiin — ilman sitä 401 ja 422 näyttäisivät
    // palvelimen lokissa täsmälleen samalta.
    const detail = await res.text().catch(() => '')
    throw new Error(`ElevenLabs vastasi ${res.status}: ${detail.slice(0, 300)}`)
  }

  const audio = Buffer.from(await res.arrayBuffer())
  if (audio.length === 0) throw new Error('Puhesynteesi ei palauttanut ääntä')

  return audio
}
