import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@/lib/session'
import { checkRateLimit } from '@/lib/arxcian/rateLimit'
import { synthesizeSpeech } from '@/lib/arxcian/tts'

/**
 * Muuntaa tekstin puheeksi. Käytetään AI-assistentin (api/arxcian/assistant)
 * vastausten lukemiseen ääneen CommandPalettessa.
 */

/**
 * Pyyntöjä tunnissa käyttäjää kohti.
 *
 * Nostettu 60:stä, kun avustajan vastaus alettiin lukea lause kerrallaan:
 * yksi vastaus tekee nyt 3–4 pyyntöä yhden sijaan, jolloin vanha katto olisi
 * tarkoittanut vain ~15 vastausta tunnissa. 300 palauttaa saman käytännön
 * kapasiteetin kuin ennen pilkkomista ja jättää varaa pidemmille vastauksille.
 *
 * Raja suojaa ElevenLabsin merkkikiintiötä, ei palvelinta — synteesi on
 * ulkoinen maksullinen kutsu, joten katto pidetään olemassa.
 */
const RATE_LIMIT = 300

export async function POST(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  if (!(await checkRateLimit('tts', user, RATE_LIMIT))) {
    return NextResponse.json(
      { error: 'Liikaa pyyntöjä, yritä myöhemmin uudelleen' },
      { status: 429 },
    )
  }

  let text: unknown
  try {
    ;({ text } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Virheellinen pyyntö' }, { status: 400 })
  }

  if (typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'text vaaditaan' }, { status: 400 })
  }

  try {
    const audio = await synthesizeSpeech(text)
    return new NextResponse(new Uint8Array(audio), {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('[api/arxcian/tts] puhesynteesi epäonnistui', error)
    return NextResponse.json({ error: 'Puhesynteesi epäonnistui' }, { status: 500 })
  }
}
