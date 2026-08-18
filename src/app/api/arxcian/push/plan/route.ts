import { NextRequest, NextResponse } from 'next/server'
import { authorizeCron } from '@/lib/arxcian/cron'
import { planAllUsers } from '@/lib/arxcian/push/schedule'

export const dynamic = 'force-dynamic'

/**
 * Suunnittelee tulevien 48 tunnin ilmoitukset QStashin jonoon.
 *
 * Pääsynhallinta on sama kuin cron-reitillä (`CRON_SECRET` tai kirjautunut
 * käyttäjä) eikä QStashin allekirjoitus: **tätä reittiä ei kutsu QStash**.
 * Suunnittelu ratsastaa GitHub Actionsin olemassa olevalla cronilla ja on
 * lisäksi käynnistettävissä käsin selaimesta, kun haluaa nähdä heti mitä
 * jonoon menisi.
 *
 * Ajo on idempotentti: jo jonossa olevat ohitetaan, poistuneet perutaan.
 * Reittiä voi siis kutsua niin usein kuin haluaa.
 */
export async function GET(req: NextRequest) {
  const auth = await authorizeCron(req)
  if (!auth.ok) return NextResponse.json({ error: 'Ei oikeutta' }, { status: 401 })

  try {
    const results = await planAllUsers()
    return NextResponse.json({ ok: true, via: auth.via, results })
  } catch (error) {
    // Puuttuva QSTASH_TOKEN tai osoite päätyy tänne. Viesti menee vastaukseen
    // sellaisenaan, koska se kertoo täsmälleen mikä konfiguraatio puuttuu.
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Suunnittelu epäonnistui' },
      { status: 500 },
    )
  }
}
