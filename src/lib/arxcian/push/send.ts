import webpush, { WebPushError } from 'web-push'
import type { UserId } from '@/lib/session'
import { getSubscriptions, reconcileSubscriptions } from './subscriptions'

/**
 * Web Push -lähetys.
 *
 * Tämä on ilmoitusten se puolisko joka tavoittaa suljetun sovelluksen.
 * Sovelluksen ollessa auki banneri ja äänimerkki tulevat selaimen omasta
 * ajastimesta ([MarketAlerts](@/components/arxcian/trading/MarketAlerts)) —
 * push ei näytä mitään avoimessa välilehdessä, joten kumpikin kerros
 * tarvitaan.
 *
 * VAPID-avaimet luetaan vasta kutsuttaessa, ei moduulia ladattaessa: käännös
 * ja staattinen analyysi eivät tarvitse niitä, eikä puuttuva ympäristömuuttuja
 * saa kaataa buildia. Sama periaate kuin [kv.ts](../kv.ts):ssä.
 */

export type PushPayload = {
  title: string
  body: string
  /** Estää saman ilmoituksen kahdentumisen ilmoituskeskuksessa. */
  tag: string
  /** Minne napautus vie. */
  url: string
}

export type SendResult = {
  delivered: number
  /** Kuolleet tilaukset jotka poistettiin. */
  pruned: number
  /** Muut virheet: verkko, palvelun katko. Näitä ei poisteta. */
  failed: number
}

let configured = false

/** Asettaa VAPID-tiedot kerran. Heittää selkeän virheen jos avaimet puuttuvat. */
function configure(): void {
  if (configured) return

  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT

  if (!publicKey || !privateKey || !subject) {
    throw new Error('VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY tai VAPID_SUBJECT puuttuu')
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

/** Julkinen avain selaimelle. Erillinen configuresta, koska tämä ei tarvitse salaisuutta. */
export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null
}

/**
 * Lähettää yhden ilmoituksen kaikille käyttäjän laitteille.
 *
 * **404 ja 410 tarkoittavat kuollutta tilausta** — käyttäjä poisti sovelluksen
 * tai perui luvan. Ne poistetaan, koska muuten sama epäonnistuminen toistuisi
 * jokaisella lähetyksellä ikuisesti. Muut virheet (429, 5xx, verkko) ovat
 * ohimeneviä eikä niistä saa poistaa mitään: yksi Applen palvelukatko
 * tyhjentäisi silloin koko tilauslistan.
 */
export async function sendToUser(user: UserId, payload: PushPayload): Promise<SendResult> {
  const subscriptions = await getSubscriptions(user)
  if (subscriptions.length === 0) return { delivered: 0, pruned: 0, failed: 0 }

  configure()

  const body = JSON.stringify(payload)
  const delivered: string[] = []
  const dead: string[] = []
  let failed = 0

  // Rinnakkain: laitteita on korkeintaan kymmenen, ja peräkkäin lähetettynä
  // yhden hitaan päätepisteen aikakatkaisu viivästyttäisi kaikkia muita.
  await Promise.all(
    subscriptions.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          body,
          // TTL kertoo push-palvelulle kuinka kauan viestiä säilytetään jos
          // laite on tavoittamattomissa. Neljä tuntia: markkinan avautuminen
          // on ajankohtainen sen istunnon ajan, ei enää seuraavana aamuna.
          { TTL: 4 * 60 * 60 },
        )
        delivered.push(sub.endpoint)
      } catch (error) {
        const status = error instanceof WebPushError ? error.statusCode : 0
        if (status === 404 || status === 410) {
          dead.push(sub.endpoint)
        } else {
          failed++
          console.error(`[push] lähetys epäonnistui (${status || 'verkko'})`, error)
        }
      }
    }),
  )

  await reconcileSubscriptions(user, { delivered, dead })

  return { delivered: delivered.length, pruned: dead.length, failed }
}
