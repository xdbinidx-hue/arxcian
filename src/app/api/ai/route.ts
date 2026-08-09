import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { kv } from '@vercel/kv'
import { currentUser } from '@/lib/session'
import { MODEL_ASSISTANT } from '@/lib/arxcian/models'

/**
 * Vapaamuotoinen tekstigenerointi. Käyttäjä: RJ-Mobin Etelä-näkymä, joka
 * generoi tiimin lukemista WhatsApp-viestin.
 *
 * Istuntotarkistus on `currentUser` eikä `currentOwner`: reitti on RJ-Mobin
 * puolella, jonne myös vieraalla on pääsy. `currentOwner` sulkisi vieraan
 * ulos ja rikkoisi Etelä-näkymän niiltä, jotka käyttävät sitä vierastilillä.
 * Vaatimus on siis "istunto olemassa", ei "henkilökohtainen käyttäjä".
 */

const MAX_TOKENS = 1000

const RATE_LIMIT = 20
const RATE_LIMIT_WINDOW = 60 * 60 // 1 tunti sekunteina

let client: Anthropic | null = null
function getClient() {
  if (!client) client = new Anthropic()
  return client
}

/**
 * Kiinteä tuntikello: avain sisältää nykyisen tunnin numeron, jolloin laskuri
 * vaihtuu automaattisesti tunnin vaihtuessa eikä liu'u edellisestä kutsusta.
 * TTL asetetaan vain ensimmäisellä kutsulla (kun incr palauttaa 1) — muuten
 * jokainen kutsu venyttäisi vanhenemisaikaa eikä laskuri koskaan nollautuisi.
 *
 * Redis-virheet eivät saa estää käyttöä: samaa periaatetta noudattaa
 * lib/arxcian/cache.ts, jossa Redisin poissaolo ohittaa välimuistin sen
 * sijaan että kaataisi sivun.
 */
async function checkRateLimit(userId: string): Promise<boolean> {
  const hour = Math.floor(Date.now() / (RATE_LIMIT_WINDOW * 1000))
  const key = `ratelimit:ai:${userId}:${hour}`

  try {
    const count = await kv.incr(key)
    if (count === 1) await kv.expire(key, RATE_LIMIT_WINDOW)
    return count <= RATE_LIMIT
  } catch (e) {
    console.error('[api/ai] pyyntörajoituksen tarkistus epäonnistui', e)
    return true
  }
}

export async function POST(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  if (!(await checkRateLimit(user))) {
    return NextResponse.json(
      { error: 'Liikaa pyyntöjä, yritä myöhemmin uudelleen' },
      { status: 429 },
    )
  }

  let prompt: unknown
  try {
    ;({ prompt } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Virheellinen pyyntö' }, { status: 400 })
  }

  if (typeof prompt !== 'string' || !prompt.trim()) {
    return NextResponse.json({ error: 'prompt vaaditaan' }, { status: 400 })
  }

  try {
    const response = await getClient().messages.create({
      model: MODEL_ASSISTANT,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    })

    const block = response.content.find(b => b.type === 'text')
    if (!block || block.type !== 'text') {
      console.error('[api/ai] vastauksessa ei tekstilohkoa', response.stop_reason)
      return NextResponse.json({ error: 'Generointi epäonnistui' }, { status: 502 })
    }

    return NextResponse.json({ text: block.text })
  } catch (error) {
    // Tarkempi syy vain palvelimen lokiin: Anthropicin virhevastaus voi
    // sisältää organisaatio- tai avaintietoja, eikä sellaista palauteta
    // selaimeen.
    console.error('[api/ai] generointi epäonnistui', error)
    return NextResponse.json({ error: 'Generointi epäonnistui' }, { status: 500 })
  }
}
