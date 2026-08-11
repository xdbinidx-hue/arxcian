import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/session'
import { checkRateLimit } from '@/lib/arxcian/rateLimit'
import { fetchAndCache } from '@/lib/arxcian/cache'
import { greetingText } from '@/lib/arxcian/assistant/greeting'
import { synthesizeSpeech } from '@/lib/arxcian/tts'

/**
 * Kirjautuneen käyttäjän tervehdys valmiiksi puheena.
 *
 * Herätyssanan jälkeen ääni pitää alkaa heti: mallikutsu ja synteesi pyynnön
 * hetkellä tarkoittaisivat sekunnin hiljaisuutta juuri siinä kohtaa jossa
 * käyttäjä odottaa vastausta. Teksti ei koskaan muutu, joten se syntetisoidaan
 * kerran ja luetaan sen jälkeen Redisistä.
 *
 * Oma reittinsä eikä /api/arxcian/tts:n parametri, koska välimuistin avain on
 * käyttäjä eikä kutsujan lähettämä teksti — POST-reitti syntetisoisi minkä
 * tahansa tekstin ja joutuisi arvaamaan milloin kyse on tervehdyksestä.
 */

/**
 * Puoli vuotta. Vanheneminen ei ole ajastus vaan siivous: jos tervehdyksen
 * sanamuoto tai ääni vaihtuu, avain katoaa lopulta itsestään eikä jää
 * roikkumaan Redisiin vanhalla äänellä. Muutos otetaan käyttöön poistamalla
 * avain, ei odottamalla tätä.
 */
const CACHE_TTL = 180 * 24 * 60 * 60

/**
 * Selaimen oma välimuisti vuorokaudeksi, `private` koska ääni on
 * käyttäjäkohtaista (Albin ja Arbnor voivat käyttää samaa laitetta, ja
 * välityspalvelin ei saa jakaa vastausta molemmille). Vuorokausi eikä viikko:
 * tervehdys haetaan joka tapauksessa kerran istunnon aikana, joten pidempi
 * ikä ei nopeuttaisi mitään mutta hidastaisi sanamuodon vaihtoa.
 */
const BROWSER_MAX_AGE = 24 * 60 * 60

/**
 * Oma kiintiönsä eikä /api/arxcian/tts:n 300, jotta herätyssanan tervehdys ei
 * syö vastausten puhekiintiötä. Katto on silti olemassa: ensimmäinen kutsu
 * välimuistin ohi on oikea synteesi, ja tyhjän välimuistin hetkellä toistuvat
 * kutsut olisivat muuten toistuvia maksullisia kutsuja.
 */
const RATE_LIMIT = 60

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  if (!(await checkRateLimit('tts-greeting', user, RATE_LIMIT))) {
    return NextResponse.json(
      { error: 'Liikaa pyyntöjä, yritä myöhemmin uudelleen' },
      { status: 429 },
    )
  }

  try {
    // MP3 talletetaan base64-merkkijonona: välimuistin arvo serialisoidaan
    // JSONiksi, ja Buffer muuttuisi siinä { type: 'Buffer', data: [...] }
    // -muotoon, joka on moninkertaisesti isompi kuin sama data base64:nä.
    const cached = await fetchAndCache<string>(
      { key: `tts:greeting:${user}`, ttl: CACHE_TTL, staleFor: CACHE_TTL },
      async () => (await synthesizeSpeech(greetingText(user))).toString('base64'),
    )

    const audio = Buffer.from(cached.data, 'base64')
    return new NextResponse(new Uint8Array(audio), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': `private, max-age=${BROWSER_MAX_AGE}`,
      },
    })
  } catch (error) {
    console.error('[api/arxcian/tts/greeting] tervehdyksen synteesi epäonnistui', error)
    return NextResponse.json({ error: 'Puhesynteesi epäonnistui' }, { status: 500 })
  }
}
