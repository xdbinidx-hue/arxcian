import { NextResponse } from 'next/server'
import { currentOwner } from '@/lib/session'
import { subscriptionKeyState, vapidKeyCheck, vapidPublicKey } from '@/lib/arxcian/push/send'
import { getSubscriptions } from '@/lib/arxcian/push/subscriptions'
import { getPlanned } from '@/lib/arxcian/push/planned'
import { qstashReachable, sendUrl } from '@/lib/arxcian/push/schedule'

export const dynamic = 'force-dynamic'

/**
 * Push-ketjun tilannekuva yhdellä latauksella.
 *
 * **Miksi tämä on olemassa.** Push kulkee viiden erillisen asian läpi —
 * VAPID-avainpari, tilauksen avain, `sub`-kenttä, QStashin tunnus ja
 * takaisinkutsuosoite — ja kaikki viisi näkyvät ulospäin samana asiana:
 * ilmoitus ei tullut. Ilman tätä reittiä jokainen korjaus on arvaus jonka
 * todistaminen kestää seuraavaan aamucroniin asti, ja 19.8.2026 se maksoi
 * puoli päivää: testi-push kehotti sallimaan ilmoitukset silloin kun vika oli
 * palvelimen avaimissa.
 *
 * **Salaisuudet eivät kulje vastaukseen.** Yksityisestä avaimesta kerrotaan
 * vain onko se olemassa ja onko se pari julkiselle. Päätepisteistä vain
 * isäntä, koska polussa on laitekohtainen tunniste jolla kuka tahansa voi
 * lähettää ilmoituksen laitteeseen.
 */
export async function GET() {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const [subscriptions, planned, qstash] = await Promise.all([
    getSubscriptions(user),
    getPlanned(user),
    qstashReachable(),
  ])

  const now = Date.now()
  const publicKey = vapidPublicKey()

  return NextResponse.json({
    kayttaja: user,
    ymparisto: process.env.VERCEL_ENV ?? 'paikallinen',

    // Olemassaolo, ei arvoa. Puuttuva muuttuja on eri vika kuin väärä arvo, ja
    // ympäristömuuttuja astuu voimaan vasta uudessa deployssa — siksi tämä
    // luetaan ajavasta prosessista eikä `vercel env ls`:stä.
    env: {
      VAPID_PUBLIC_KEY: Boolean(process.env.VAPID_PUBLIC_KEY),
      VAPID_PRIVATE_KEY: Boolean(process.env.VAPID_PRIVATE_KEY),
      VAPID_SUBJECT: Boolean(process.env.VAPID_SUBJECT),
      QSTASH_TOKEN: Boolean(process.env.QSTASH_TOKEN),
      QSTASH_CURRENT_SIGNING_KEY: Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY),
      QSTASH_NEXT_SIGNING_KEY: Boolean(process.env.QSTASH_NEXT_SIGNING_KEY),
      CRON_SECRET: Boolean(process.env.CRON_SECRET),
    },

    // Tämä on se yksi luku joka erottaa BadJwtTokenin kaksi syytä.
    avainpari: vapidKeyCheck(),
    julkinenAvain: publicKey ? `${publicKey.slice(0, 12)}… (${publicKey.length} merkkiä)` : null,
    subject: subjectTila(),

    // Osoite johon QStash kutsuu takaisin. Väärä osoite ei kaada suunnittelua
    // vaan toimituksen, eli vika näkyisi vasta tapahtuman hetkellä.
    sendUrl: turvallisesti(sendUrl),

    laitteet: subscriptions.map(s => ({
      host: hostOf(s.endpoint),
      label: s.label,
      createdAt: s.createdAt,
      lastSentAt: s.lastSentAt,
      avainTila: subscriptionKeyState(s),
    })),

    // Jono ja Redisin push:planned:<käyttäjä> ovat sama asia; jos tämä luku on
    // nolla mutta laitteita on, suunnittelu ei ole ajanut tai se kaatui.
    jonossa: {
      yhteensa: Object.keys(planned).length,
      tulevat: Object.values(planned).filter(entry => entry.at > now).length,
    },

    qstash,
  })
}

/**
 * Kelpaako `sub`-kenttä push-palvelulle.
 *
 * Apple hylkää JWT:n `BadJwtToken`illa myös silloin kun subject ei ole
 * `mailto:`- tai `https:`-muotoinen, eli sama virhe kuin avainten epäsuhdasta.
 * Arvo näytetään kokonaan, koska se on osoite jota juuri tässä tutkitaan eikä
 * salaisuus.
 */
function subjectTila(): { arvo: string | null; kelpaa: boolean } {
  const arvo = process.env.VAPID_SUBJECT ?? null
  return { arvo, kelpaa: Boolean(arvo && /^(mailto:|https:\/\/)/.test(arvo)) }
}

/** Puuttuva perusosoite heittää; diagnostiikassa se on tulos eikä kaatuminen. */
function turvallisesti(fn: () => string): string {
  try {
    return fn()
  } catch (error) {
    return error instanceof Error ? `virhe: ${error.message}` : 'virhe'
  }
}

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return 'tuntematon'
  }
}
