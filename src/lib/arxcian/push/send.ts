import { createECDH } from 'node:crypto'
import webpush, { WebPushError } from 'web-push'
import type { UserId } from '@/lib/session'
import {
  getSubscriptions,
  reconcileSubscriptions,
  type PushSubscriptionRecord,
} from './subscriptions'

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

/**
 * Mikä avainvirheen aiheutti.
 *
 * Apple vastaa 403 `BadJwtToken` sekä silloin kun vika on palvelimessa
 * (avainpari, `sub`-kenttä, kello) että silloin kun tilaus on tehty jollain
 * muulla julkisella avaimella. Ne vaativat eri korjauksen — toinen tehdään
 * Vercelin ympäristömuuttujiin, toinen puhelimessa — joten pelkkä statuskoodi
 * ei riitä vastaukseen.
 *
 * `tilauksen-avain` ei esiinny tässä listassa: sellainen tilaus poistetaan
 * eikä jää virheeksi kerrottavaksi. `avain-epäselvä` on rehellinen kolmas
 * tila — allekirjoitus hylättiin, eikä kumpaakaan voi osoittaa.
 */
export type FailureCause = 'palvelimen-avain' | 'avain-epäselvä' | 'muu'

/**
 * Yksi epäonnistunut lähetys, sen verran kuin kutsuja tarvitsee syyn
 * kertomiseen.
 *
 * **Päätepisteen koko osoitetta ei oteta mukaan.** Se sisältää laitekohtaisen
 * tunnisteen, jolla kuka tahansa voi lähettää ilmoituksen laitteeseen — se ei
 * kuulu HTTP-vastaukseen eikä lokiriville. Isäntänimi riittää kertomaan
 * kumman palvelun (Apple, Google, Mozilla) kanssa on ongelma.
 */
export type SendFailure = {
  /** 0 = ei HTTP-vastausta lainkaan (verkkovirhe, aikakatkaisu). */
  statusCode: number
  /** Push-palvelun oma virheteksti, esim. "BadJwtToken". Katkaistu. */
  body?: string
  /** Vain isäntä, ei polkua eikä tunnistetta. */
  endpointHost?: string
  /** Kumpi avain on väärin, jos kyse on avaimesta. */
  syy: FailureCause
}

export type SendResult = {
  delivered: number
  /** Kuolleet tilaukset jotka poistettiin (404/410): sovellus poistettu tai lupa peruttu. */
  pruned: number
  /**
   * Vanhaan VAPID-avaimeen sidotut tilaukset jotka poistettiin.
   *
   * Eri luku kuin `pruned`, koska syy ja korjaus ovat eri: kuollut tilaus
   * vaatii luvan uudelleen, vanhentunut avain vain uuden tilauksen samalla
   * luvalla. Yhteen laskettuina kumpaakaan ei voisi kertoa oikein.
   */
  prunedStale: number
  /** Muut virheet: verkko, palvelun katko, palvelimen avainvirhe. Näitä ei poisteta. */
  failed: number
  /**
   * Syyt `failed`-virheille.
   *
   * Pelkkä laskuri kertoo että jokin meni pieleen muttei mikä, ja kutsuja
   * joutuu arvaamaan. Väärä arvaus maksaa: kun VAPID-avainpari oli epäsuhta,
   * Apple vastasi 403 BadJwtToken ja testireitti kehotti sallimaan
   * ilmoitukset — asian joka oli jo kunnossa.
   */
  failures: SendFailure[]
}

/** Palvelun virheteksti voi olla pitkä HTML-sivu; vastaukseen riittää alku. */
const BODY_MAX = 200

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

export type VapidKeyCheck = 'eheä' | 'epäsuhta' | 'viallinen' | 'puuttuu'

let keyCheck: VapidKeyCheck | null = null

/**
 * Vastaako yksityinen avain julkista.
 *
 * **Tämä on ainoa tapa erottaa BadJwtTokenin kaksi syytä.** Push-palvelu
 * hylkää allekirjoituksen samalla koodilla riippumatta siitä onko vika
 * palvelimen avainparissa vai tilauksen vanhassa avaimessa, ja väärä arvaus
 * maksoi jo kerran: 19.8.2026 testi-push kehotti sallimaan ilmoitukset
 * silloin kun avaimet olivat väärin palvelimella.
 *
 * VAPID-avaimet ovat P-256-käyrän avaimia, joten julkinen johdetaan
 * yksityisestä laskemalla — ei tarvita ulkoista palvelua eikä vertailuarvoa.
 * Tulos muistetaan, koska se ei muutu prosessin elinaikana.
 *
 * Ei heitä: tämä on diagnoosi eikä portti. Puuttuva avain on `configure`n
 * asia kerrottavaksi, ei tämän.
 */
export function vapidKeyCheck(): VapidKeyCheck {
  if (keyCheck) return keyCheck

  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return (keyCheck = 'puuttuu')

  try {
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'))
    const derived = ecdh.getPublicKey().toString('base64url')
    return (keyCheck = sameKey(derived, publicKey) ? 'eheä' : 'epäsuhta')
  } catch {
    // Muotovirhe on eri vika kuin väärä pari, ja korjaus on eri: toinen on
    // väärin kopioitu arvo, toinen väärästä parista poimittu. Sama sana
    // molemmille lähettäisi etsimään väärää asiaa.
    return (keyCheck = 'viallinen')
  }
}

/**
 * Onko tilaus tehty sillä avaimella joka palvelimella nyt on.
 *
 * `tuntematon` on eri asia kuin `vanha`: kenttä lisättiin 19.8.2026, joten
 * sitä vanhemmasta rivistä ei tiedetä mitään. Kumpikin vaatii saman
 * korjauksen (uusi tilaus), mutta vain toisesta voi sanoa sen varmasti — ja
 * käyttöliittymässä varmuus on eri asia kuin arvaus.
 */
export type KeyState = 'nykyinen' | 'vanha' | 'tuntematon'

export function subscriptionKeyState(sub: PushSubscriptionRecord): KeyState {
  const nykyinen = vapidPublicKey()
  if (!sub.appServerKey || !nykyinen) return 'tuntematon'
  return sameKey(sub.appServerKey, nykyinen) ? 'nykyinen' : 'vanha'
}

/**
 * Sama avain, vaikka esitysmuoto eroaisi.
 *
 * Base64url-arvo voi olla täytteellä tai ilman, ja merkkijonovertailu
 * merkitsisi silloin jokaisen laitteen vanhentuneeksi — eli käynnistäisi
 * turhan uudelleentilauksen jokaisella laitteella. Bufferin kautta
 * kierrätetty arvo on aina samassa muodossa.
 */
function sameKey(a: string, b: string): boolean {
  try {
    return Buffer.from(a, 'base64url').equals(Buffer.from(b, 'base64url'))
  } catch {
    return false
  }
}

/**
 * Lähettää yhden ilmoituksen kaikille käyttäjän laitteille.
 *
 * **404 ja 410 tarkoittavat kuollutta tilausta** — käyttäjä poisti sovelluksen
 * tai perui luvan. Ne poistetaan, koska muuten sama epäonnistuminen toistuisi
 * jokaisella lähetyksellä ikuisesti. Muut virheet (429, 5xx, verkko) ovat
 * ohimeneviä eikä niistä saa poistaa mitään: yksi Applen palvelukatko
 * tyhjentäisi silloin koko tilauslistan.
 *
 * **401 ja 403 poistavat vain ehdollisesti**, ks. `ratkaiseAvainvirheet`.
 */
export async function sendToUser(user: UserId, payload: PushPayload): Promise<SendResult> {
  const subscriptions = await getSubscriptions(user)
  if (subscriptions.length === 0) {
    return { delivered: 0, pruned: 0, prunedStale: 0, failed: 0, failures: [] }
  }

  configure()

  const body = JSON.stringify(payload)
  const delivered: string[] = []
  const dead: string[] = []
  const avainvirheet: Avainvirhe[] = []
  const failures: SendFailure[] = []

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
          return
        }

        const teksti = failureBody(error)
        // Avainvirheet kerätään ja ratkaistaan vasta erän jälkeen, ks. alta.
        if (onAvainvirhe(status, teksti)) {
          avainvirheet.push({ sub, status, body: teksti })
          return
        }

        const failure: SendFailure = {
          statusCode: status,
          body: teksti,
          endpointHost: hostOf(sub.endpoint),
          syy: 'muu',
        }
        failures.push(failure)
        // Rakenteisena ja kerran: lokista ja vastauksesta on löydyttävä
        // sama totuus, muuten toinen niistä johtaa väärään päätelmään.
        console.error('[push] lähetys epäonnistui', failure)
      }
    }),
  )

  const stale = ratkaiseAvainvirheet(avainvirheet, delivered.length, failures)
  await reconcileSubscriptions(user, { delivered, dead: [...dead, ...stale] })

  return {
    delivered: delivered.length,
    pruned: dead.length,
    prunedStale: stale.length,
    failed: failures.length,
    failures,
  }
}

/** Yksi hylätty allekirjoitus, odottamassa erän muuta tulosta. */
type Avainvirhe = { sub: PushSubscriptionRecord; status: number; body?: string }

/**
 * Kuka poistetaan ja kuka ei — vasta kun koko erän tulos on tiedossa.
 *
 * **Erotin ei ole statuskoodi vaan saman ajon muiden laitteiden tulos**, sama
 * päättely kuin YouTube-hauissa: jos yksikään lähetys ei mennyt perille, vika
 * on lähettävässä päässä eikä yhdessäkään tilauksessa, eikä silloin kosketa
 * mitään. Avainparin eheys ei riitä erottimeksi yksinään, koska eheälläkin
 * parilla 403 syntyy väärästä `sub`-kentästä ja palvelimen kellosta — ja
 * silloin koodisidonnainen poisto veisi koko laitelistan yhdellä ajolla.
 *
 * Kaksi tapausta poistetaan:
 *
 * - `vanha`: tilaukseen tallennettu avain on eri kuin nykyinen. Tämä on
 *   suoraa todistetta eikä päättelyä — tilaus ei kelpaa enää koskaan.
 * - `tuntematon` **ja** jokin toinen laite sai ilmoituksen: avainta ei ole
 *   kirjattu (rivi on kenttää vanhempi), mutta onnistunut lähetys samassa
 *   erässä todistaa että palvelinpää on kunnossa.
 *
 * `nykyinen` ei koskaan poistu: sen avain täsmää, joten vika on muualla.
 */
function ratkaiseAvainvirheet(
  virheet: Avainvirhe[],
  onnistuneita: number,
  failures: SendFailure[],
): string[] {
  const stale: string[] = []

  for (const { sub, status, body } of virheet) {
    const tila = subscriptionKeyState(sub)

    if (tila === 'vanha' || (tila === 'tuntematon' && onnistuneita > 0)) {
      stale.push(sub.endpoint)
      console.warn('[push] tilaus sidottu vanhaan avaimeen, poistetaan', {
        endpointHost: hostOf(sub.endpoint),
        label: sub.label,
        avainTila: tila,
      })
      continue
    }

    const failure: SendFailure = {
      statusCode: status,
      body,
      endpointHost: hostOf(sub.endpoint),
      syy: tila === 'nykyinen' ? 'palvelimen-avain' : 'avain-epäselvä',
    }
    failures.push(failure)
    console.error('[push] lähetys epäonnistui', { ...failure, avainpari: vapidKeyCheck() })
  }

  return stale
}

/**
 * Kelpaamaton allekirjoitus.
 *
 * 401 ja 403 tarkoittavat molemmilla suurilla palveluilla samaa: pyyntöä ei
 * hyväksytty avainten takia. Apple kertoo syyn tekstinä ("BadJwtToken"),
 * Google pelkkänä koodina.
 *
 * **Runkotekstiin ei luoteta yksinään.** Sanan "vapid" osuma missä tahansa
 * vastauksessa luokittelisi myös 429:n ja 502:n avainvirheeksi, ja koska tämä
 * predikaatti nyt ohjaa poistoa eikä vain virheviestiä, ohimenevä katko
 * veisi tilauksia mukanaan. Siksi teksti kelpaa vain 400:n kanssa, jota osa
 * palveluista käyttää VAPID-virheeseen.
 */
function onAvainvirhe(status: number, body?: string): boolean {
  if (status === 401 || status === 403) return true
  return status === 400 && /badjwttoken|vapid/i.test(body ?? '')
}

/** Push-palvelun virheteksti, katkaistuna. */
function failureBody(error: unknown): string | undefined {
  const raw = error instanceof WebPushError ? error.body : error instanceof Error ? error.message : ''
  const trimmed = raw?.trim()
  if (!trimmed) return undefined
  return trimmed.length > BODY_MAX ? `${trimmed.slice(0, BODY_MAX)}…` : trimmed
}

/** Vain isäntä: päätepisteen polussa on laitekohtainen tunniste. */
function hostOf(endpoint: string): string | undefined {
  try {
    return new URL(endpoint).host
  } catch {
    return undefined
  }
}
