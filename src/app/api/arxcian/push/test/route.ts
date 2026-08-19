import { NextResponse } from 'next/server'
import { currentOwner } from '@/lib/session'
import { sendToUser, type SendResult } from '@/lib/arxcian/push/send'

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
      return NextResponse.json({ error: syy(result), result }, { status: 409 })
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

/**
 * Miksi mitään ei mennyt perille — käyttäjän kannalta, ei vain koodina.
 *
 * **Järjestys on olennainen.** Aiemmin haarauduttiin vain `pruned`:in
 * perusteella, jolloin lähetysvirhe päätyi "ei laitteita" -haaraan: kun
 * VAPID-avainpari oli epäsuhta, Apple vastasi 403 BadJwtToken ja käyttäjää
 * kehotettiin sallimaan ilmoitukset, vaikka laite oli listalla ja lupa
 * annettu. Palvelun antama virhe on aina tarkempi tieto kuin laitelistan
 * tila, joten se katsotaan ensin.
 *
 * Kolme poistosyytä pidetään erillään, koska ne vaativat eri korjauksen:
 * palvelimen avainpari korjataan Vercelin ympäristömuuttujiin, vanhentunut
 * tilaus korjaantuu itsestään sivun avaamisella, ja kuollut tilaus vaatii
 * ilmoitusluvan uudelleen.
 */
function syy(result: SendResult): string {
  // Lähetykset ajetaan rinnakkain, joten failures[0] on se joka sattui
  // ehtimään ensin. Palvelimen avainvirhe haetaan siksi nimenomaisesti: se
  // koskee kaikkia laitteita ja on korjattavissa, kun 429 yhdeltä laitteelta
  // on ohimenevä — järjestys ei saa ratkaista kumpi näytetään.
  const failure =
    result.failures.find(f => f.syy === 'palvelimen-avain') ?? result.failures[0]

  if (failure) {
    const koodi = failure.statusCode
    // statusCode 0 = ei HTTP-vastausta lainkaan, jolloin koodia ei ole mitä näyttää.
    const koodiTeksti = koodi ? `HTTP ${koodi}` : 'ei vastausta push-palvelulta'

    if (failure.syy === 'palvelimen-avain') {
      // Palvelun oma syy mukaan vain jos se on lyhyt tunniste ("BadJwtToken").
      // Pitkä tai monirivinen runko on HTML-sivu eikä kuulu viestiin.
      const syyteksti =
        failure.body && failure.body.length <= 40 && !failure.body.includes('\n')
          ? `, ${failure.body}`
          : ''
      return `Palvelimen VAPID-avaimet eivät ole pari keskenään (${koodiTeksti}${syyteksti}). Tämä on palvelinpuolen asetusvirhe, ei sinun laitteessasi.`
    }
    return `Lähetys epäonnistui (${koodiTeksti}).`
  }

  if (result.prunedStale > 0) {
    return `${result.prunedStale} tilausta oli tehty vanhalla VAPID-avaimella eikä kelvannut enää. Ne poistettiin ja laite liitetään uudelleen automaattisesti — kokeile testiä hetken päästä uudelleen.`
  }

  if (result.pruned > 0) return 'Tilaus oli vanhentunut ja poistettiin. Salli ilmoitukset uudelleen.'

  return 'Ei yhtään laitetta johon lähettää. Salli ilmoitukset ensin.'
}
