import { NextRequest, NextResponse } from 'next/server'
import { Receiver } from '@upstash/qstash'
import { USER_IDS, type UserId } from '@/lib/session'
import { sendToUser } from '@/lib/arxcian/push/send'
import { sendUrl } from '@/lib/arxcian/push/schedule'

export const dynamic = 'force-dynamic'

/**
 * QStashin ajastama lähetys yhdelle tapahtumalle.
 *
 * **Tähän ei pääse istunnolla eikä `CRON_SECRET`illa.** Runko kertoo kenelle
 * lähetetään, joten pelkkä jaettu salaisuus riittäisi kenelle tahansa
 * lähettämään ilmoituksen kenen tahansa puhelimeen. QStash allekirjoittaa
 * jokaisen kutsun, ja allekirjoitus kattaa sekä rungon että osoitteen.
 *
 * Osoite annetaan `sendUrl()`:stä eikä `req.url`:stä: pyyntö tulee Vercelin
 * välityspalvelimen läpi, ja rekonstruoitu osoite voi erota siitä mihin
 * QStash allekirjoituksen laski.
 */
function receiver(): Receiver {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY

  if (!currentSigningKey || !nextSigningKey) {
    throw new Error('QSTASH_CURRENT_SIGNING_KEY tai QSTASH_NEXT_SIGNING_KEY puuttuu')
  }

  return new Receiver({ currentSigningKey, nextSigningKey })
}

function isUser(value: unknown): value is UserId {
  return USER_IDS.some(id => id === value)
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('upstash-signature')
  if (!signature) return NextResponse.json({ error: 'Allekirjoitus puuttuu' }, { status: 401 })

  // Runko luetaan tekstinä eikä JSONina, koska allekirjoitus lasketaan
  // tavuista: uudelleensarjallistettu JSON ei enää täsmäisi.
  const raw = await req.text()

  try {
    const valid = await receiver().verify({ signature, body: raw, url: sendUrl() })
    if (!valid) return NextResponse.json({ error: 'Allekirjoitus ei kelpaa' }, { status: 401 })
  } catch (error) {
    console.error('[push] allekirjoituksen tarkistus epäonnistui', error)
    return NextResponse.json({ error: 'Allekirjoitus ei kelpaa' }, { status: 401 })
  }

  const payload = JSON.parse(raw) as {
    user?: string
    title?: string
    body?: string
    tag?: string
    url?: string
  }

  if (!isUser(payload.user) || !payload.title) {
    return NextResponse.json({ error: 'user ja title vaaditaan' }, { status: 400 })
  }

  const result = await sendToUser(payload.user, {
    title: payload.title,
    body: payload.body ?? '',
    tag: payload.tag ?? payload.title,
    url: payload.url ?? '/arxcian/trading',
  })

  // Aina 200, myös kun laitteita ei ollut: QStash yrittäisi muuten uudelleen
  // kolmesti, eikä tilaukseton käyttäjä ole ohimenevä vika vaan pysyvä tila.
  return NextResponse.json({ ok: true, result })
}
