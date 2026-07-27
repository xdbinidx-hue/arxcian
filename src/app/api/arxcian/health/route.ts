import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export const dynamic = 'force-dynamic'

/**
 * Kertoo onko välimuisti tavoitettavissa: kirjoittaa, lukee ja poistaa
 * yhden avaimen. Middleware vaatii jo istunnon tähän reittiin.
 *
 * Käyttää kv:tä suoraan eikä cache.ts:n apureita, koska ne nielevät
 * Redis-virheet tarkoituksella. Terveystarkistuksen pitää näyttää syy.
 */
export async function GET() {
  const key = 'arxcian:health:ping'
  const stamp = Date.now()
  const started = Date.now()

  try {
    await kv.set(key, { stamp }, { ex: 60 })

    // Ensimmäinen luku voi osua replikaan johon kirjoitus ei ole vielä
    // ehtinyt. Uusintayritys kertoo onko kyse viiveestä vai oikeasta viasta.
    let back = await kv.get<{ stamp: number }>(key)
    const immediate = back?.stamp === stamp
    let retried = false

    if (!immediate) {
      await new Promise(r => setTimeout(r, 400))
      back = await kv.get<{ stamp: number }>(key)
      retried = true
    }

    await kv.del(key)

    const ok = back?.stamp === stamp
    return NextResponse.json({
      ok,
      cache: ok ? (immediate ? 'ok' : 'ok, mutta viiveellä') : 'kirjoitus ei näy luettaessa',
      immediate,
      retried,
      wrote: stamp,
      read: back ?? null,
      ms: Date.now() - started,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { ok: false, cache: 'virhe', error: message, ms: Date.now() - started },
      { status: 500 },
    )
  }
}
