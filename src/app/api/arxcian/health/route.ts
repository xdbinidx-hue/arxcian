import { NextResponse } from 'next/server'
import { writeCached, readCached, invalidate } from '@/lib/arxcian/cache'

export const dynamic = 'force-dynamic'

/**
 * Tarkistaa että välimuisti on tavoitettavissa: kirjoittaa, lukee ja
 * poistaa yhden avaimen. Middleware vaatii jo istunnon tähän reittiin.
 *
 * Hyödyllinen myöhemmin kun jokin osio ei näytä dataa — kertoo heti
 * onko vika Redisissä vai lähteessä.
 */
export async function GET() {
  const key = 'health:ping'
  const stamp = Date.now()
  const started = Date.now()

  try {
    await writeCached(key, { stamp }, 60)
    const back = await readCached<{ stamp: number }>(key)
    await invalidate(key)

    const ok = back?.data.stamp === stamp
    return NextResponse.json({
      ok,
      // Välimuistin virheet eivät heitä poikkeusta vaan palauttavat null,
      // joten epäonnistunut edestakainen kirjoitus näkyy tässä.
      cache: ok ? 'ok' : 'ei vastaa',
      ms: Date.now() - started,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, cache: 'virhe', error: message }, { status: 500 })
  }
}
