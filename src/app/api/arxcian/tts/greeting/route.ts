import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@/lib/session'
import { checkRateLimit } from '@/lib/arxcian/rateLimit'
import { fetchAndCache } from '@/lib/arxcian/cache'
import { getLanguage } from '@/lib/arxcian/assistant/language'
import { GREETING_TEXT_HEADER, greetingText } from '@/lib/arxcian/assistant/greeting'
import { synthesizeSpeech } from '@/lib/arxcian/tts'

/**
 * Kirjautuneen käyttäjän tervehdys valmiiksi puheena, hänen omalla kielellään.
 *
 * Herätyssanan jälkeen ääni pitää alkaa heti: mallikutsu ja synteesi pyynnön
 * hetkellä tarkoittaisivat sekunnin hiljaisuutta juuri siinä kohtaa jossa
 * käyttäjä odottaa vastausta. Teksti ei koskaan muutu, joten se syntetisoidaan
 * kerran ja luetaan sen jälkeen Redisistä.
 *
 * Oma reittinsä eikä /api/arxcian/tts:n parametri, koska välimuistin avain on
 * käyttäjä eikä kutsujan lähettämä teksti — POST-reitti syntetisoisi minkä
 * tahansa tekstin ja joutuisi arvaamaan milloin kyse on tervehdyksestä.
 *
 * Välimuistin avain on käyttäjä **ja kieli**: sama käyttäjä voi kuulla
 * kumpaakin, ja tervehdykset ovat eri ääniä. Vanha kieletön avain jää
 * käyttämättömäksi ja vanhenee itsestään — migraatiota ei rakenneta yhdelle
 * äänitiedostolle.
 */

/**
 * Puoli vuotta. Vanheneminen ei ole ajastus vaan siivous: jos tervehdyksen
 * sanamuoto tai ääni vaihtuu, avain katoaa lopulta itsestään eikä jää
 * roikkumaan Redisiin vanhalla äänellä. Muutos otetaan käyttöön poistamalla
 * avain, ei odottamalla tätä.
 */
const CACHE_TTL = 180 * 24 * 60 * 60

/**
 * Selain saa tallentaa äänen, mutta **tarkistaa aina onko se yhä oikea**.
 *
 * Aiemmin tässä oli vuorokauden max-age. Kielivalinnan myötä se tarkoittaisi,
 * että kielen vaihdon jälkeen herätyssana tervehtisi vielä vuorokauden vanhalla
 * kielellä ja vanhalla äänellä. ETag riippuu käyttäjästä ja kielestä, joten
 * muuttumaton tervehdys palautuu 304:llä ilman uutta latausta ja ilman
 * Redis-lukua — vaihtunut tulee heti kokonaan uudelleen.
 *
 * `private`, koska ääni on käyttäjäkohtaista: Albin ja Arbnor voivat käyttää
 * samaa laitetta, eikä välityspalvelin saa jakaa vastausta molemmille.
 */
const CACHE_CONTROL = 'private, no-cache'

/**
 * Oma kiintiönsä eikä /api/arxcian/tts:n 300, jotta herätyssanan tervehdys ei
 * syö vastausten puhekiintiötä. Katto on silti olemassa: ensimmäinen kutsu
 * välimuistin ohi on oikea synteesi, ja tyhjän välimuistin hetkellä toistuvat
 * kutsut olisivat muuten toistuvia maksullisia kutsuja.
 */
const RATE_LIMIT = 60

export async function GET(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  if (!(await checkRateLimit('tts-greeting', user, RATE_LIMIT))) {
    return NextResponse.json(
      { error: 'Liikaa pyyntöjä, yritä myöhemmin uudelleen' },
      { status: 429 },
    )
  }

  const language = await getLanguage(user)
  const text = greetingText(user, language)

  // ETag kattaa kaiken mikä tervehdyksessä voi muuttua: kuka tervehditään ja
  // millä kielellä. Sisällöstä ei tarvitse laskea tiivistettä, koska teksti on
  // näiden kahden funktio.
  const etag = `"greeting-${user}-${language}"`
  if (req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': CACHE_CONTROL },
    })
  }

  try {
    // MP3 talletetaan base64-merkkijonona: välimuistin arvo serialisoidaan
    // JSONiksi, ja Buffer muuttuisi siinä { type: 'Buffer', data: [...] }
    // -muotoon, joka on moninkertaisesti isompi kuin sama data base64:nä.
    const cached = await fetchAndCache<string>(
      { key: `tts:greeting:${user}:${language}`, ttl: CACHE_TTL, staleFor: CACHE_TTL },
      async () => (await synthesizeSpeech(text, language)).toString('base64'),
    )

    const audio = Buffer.from(cached.data, 'base64')
    return new NextResponse(new Uint8Array(audio), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': CACHE_CONTROL,
        ETag: etag,
        [GREETING_TEXT_HEADER]: encodeURIComponent(text),
      },
    })
  } catch (error) {
    console.error('[api/arxcian/tts/greeting] tervehdyksen synteesi epäonnistui', error)
    return NextResponse.json({ error: 'Puhesynteesi epäonnistui' }, { status: 500 })
  }
}
