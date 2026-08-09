import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { currentUser } from '@/lib/session'

/**
 * Vapaamuotoinen tekstigenerointi. Käyttäjä: RJ-Mobin Etelä-näkymä, joka
 * generoi tiimin lukemista WhatsApp-viestin.
 *
 * Istuntotarkistus on `currentUser` eikä `currentOwner`: reitti on RJ-Mobin
 * puolella, jonne myös vieraalla on pääsy. `currentOwner` sulkisi vieraan
 * ulos ja rikkoisi Etelä-näkymän niiltä, jotka käyttävät sitä vierastilillä.
 * Vaatimus on siis "istunto olemassa", ei "henkilökohtainen käyttäjä".
 */

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1000

let client: Anthropic | null = null
function getClient() {
  if (!client) client = new Anthropic()
  return client
}

export async function POST(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

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
      model: MODEL,
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
