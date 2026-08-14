import { NextResponse } from 'next/server'
import { currentOwner } from '@/lib/session'
import { sendToUser } from '@/lib/arxcian/push/send'

export const dynamic = 'force-dynamic'

/**
 * Testi-push kirjautuneen käyttäjän kaikille laitteille.
 *
 * Erillinen reitti eikä osa asetusten tallennusta: tämän pitää voida
 * epäonnistua näkyvästi. Jos VAPID-avaimet puuttuvat tai tilaus on kuollut,
 * käyttäjän on saatava se tietää nyt eikä vasta silloin kun Lontoo avautuu
 * eikä puhelin pirauta.
 */
export async function POST() {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  try {
    const result = await sendToUser(user, {
      title: 'Testi-ilmoitus',
      body: 'Näin markkinailmoitus näkyy kun arxcian on kiinni.',
      tag: `test:${Date.now()}`,
      url: '/arxcian/trading',
    })

    if (result.delivered === 0) {
      return NextResponse.json(
        {
          error:
            result.pruned > 0
              ? 'Tilaus oli vanhentunut ja poistettiin. Salli ilmoitukset uudelleen.'
              : 'Ei yhtään laitetta johon lähettää. Salli ilmoitukset ensin.',
          result,
        },
        { status: 409 },
      )
    }

    return NextResponse.json({ result })
  } catch (error) {
    // Puuttuvat VAPID-avaimet päätyvät tänne. Viesti menee käyttöliittymään
    // sellaisenaan, koska se kertoo täsmälleen mikä on kesken.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lähetys epäonnistui' },
      { status: 500 },
    )
  }
}
