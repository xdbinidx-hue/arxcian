import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

// Nämä ovat kaikki polut joiden data voi muuttua kun Myyntiseurannat- tai Maksukuitit-kansiossa
// tapahtuu muutos: itse API-reitit (joiden JSON-vastaus on cachettu, ks. src/lib/apiCache.ts)
// sekä sivut jotka näyttävät tätä dataa.
const REVALIDATE_PATHS = ['/api/files', '/api/receipts', '/api/sheets', '/api/targets', '/arxcian/rj-mob/trendit', '/arxcian/rj-mob/tuotto', '/arxcian/rj-mob/etela', '/arxcian/rj-mob/tavoitteet']

// Google Drive lähettää tämän POST-pyynnön aina kun watch-kanavan (ks. ../register/route.ts)
// tarkkailema Drive-tila muuttuu. Google ei lähetä pyynnön mukana varsinaista dataa siitä mikä
// muuttui — ainoastaan headerit (X-Goog-Resource-State jne.) — joten reagoimme tyhjentämällä
// koko cachen sen sijaan että yrittäisimme päätellä mikä täsmälleen muuttui.
export async function POST(req: NextRequest) {
  const token = req.headers.get('x-goog-channel-token')
  if (!process.env.DRIVE_WEBHOOK_TOKEN || token !== process.env.DRIVE_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: 'invalid channel token' }, { status: 401 })
  }

  // "sync" on Googlen lähettämä vahvistusviesti kanavaa luotaessa, ei oikea muutosilmoitus —
  // ei tarvitse revalidoida sen takia (ks. drive.changes.watch-dokumentaatio).
  const resourceState = req.headers.get('x-goog-resource-state')
  if (resourceState !== 'sync') {
    for (const path of REVALIDATE_PATHS) revalidatePath(path)
  }

  return NextResponse.json({ ok: true })
}
