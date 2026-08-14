/**
 * Ilmoituksen toimitus selaimessa: käyttöjärjestelmän ilmoitus ja äänimerkki.
 *
 * **Tämä ei ole Web Push.** Oikea push vaatii palvelimen joka herää oikealla
 * minuutilla, ja sellaista ei tässä projektissa ole: Vercelin Hobby-taso
 * sallii kaksi cronia vuorokaudessa, ja GitHub Actionsin ajastin myöhästyy
 * rutiininomaisesti 5–15 minuuttia. "Lontoo avautuu" kymmenen minuuttia
 * myöhässä ei ole ilmoitus vaan väärä tieto, joten sitä ei rakennettu.
 *
 * Seuraus on kerrottava suoraan eikä piilotettava: **ilmoitus tulee vain kun
 * arxcian on auki** — välilehtenä tai kotiruudulta avattuna. Tausta-ajossa
 * selain hidastaa ajastimia, mutta minuutin tarkkuus säilyy, joten taustalla
 * oleva välilehti riittää.
 *
 * Kanavia on kolme koska ne epäonnistuvat eri tavoin: ilmoitus vaatii luvan,
 * ääni vaatii käyttäjän eleen, banneri toimii aina. Siksi banneri näytetään
 * silloinkin kun kaksi muuta on estetty.
 */

export type NotifyPermission = 'default' | 'granted' | 'denied' | 'unsupported'

export function notifyPermission(): NotifyPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (notifyPermission() === 'unsupported') return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    // Vanhat Safarit hylkäävät lupauspohjaisen kutsun. Tila luetaan silloin
    // suoraan, koska takaisinkutsuversio on jo ehtinyt asettaa sen.
    return notifyPermission()
  }
}

/**
 * Käyttöjärjestelmän ilmoitus.
 *
 * Ensisijaisesti service workerin kautta: `registration.showNotification` on
 * ainoa tapa joka toimii kotiruudulle asennetussa sovelluksessa Androidilla ja
 * iOS:llä. `new Notification(...)` toimii työpöytäselaimessa mutta heittää
 * osassa mobiiliselaimia — ja kehityksessä service workeria ei rekisteröidä
 * lainkaan, joten molemmat polut tarvitaan.
 *
 * `tag` estää saman tapahtuman kahdentumisen ilmoituskeskuksessa jos sama
 * ilmoitus jostain syystä annetaan kahdesti.
 */
export async function showSystemNotification(input: {
  title: string
  body: string
  tag: string
}): Promise<boolean> {
  if (notifyPermission() !== 'granted') return false

  const options: NotificationOptions = {
    body: input.body,
    tag: input.tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // Ilmoitus jää näkyviin kunnes se kuitataan: markkinan avautuminen on
    // hetkellinen tapahtuma, ja itsestään kadonnut ilmoitus olisi sama kuin
    // ei ilmoitusta lainkaan jos katse oli muualla.
    requireInteraction: true,
    data: { url: '/arxcian/trading' },
  }

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration) {
        await registration.showNotification(input.title, options)
        return true
      }
    } catch {
      // Pudotaan alla olevaan varapolkuun.
    }
  }

  try {
    new Notification(input.title, options)
    return true
  } catch {
    return false
  }
}

/**
 * Äänimerkki.
 *
 * Ääni syntetisoidaan Web Audiolla eikä ladata tiedostona: kaksi siniaaltoa on
 * muutama rivi, kun taas äänitiedosto olisi uusi binääri repossa, uusi
 * välimuistisääntö service workeriin ja yksi verkkohaku lisää juuri sillä
 * hetkellä kun ilmoituksen pitäisi olla välitön.
 *
 * AudioContext syntyy `suspended`-tilassa eikä selain päästä sitä käyntiin
 * ilman käyttäjän elettä. `unlockChime` kutsutaan asetusten kytkimestä — se
 * painallus on ele — ja sen jälkeen sama konteksti soittaa kaikki myöhemmät
 * äänet. Uusi konteksti olisi taas lukittu, joten jakaminen ei ole optimointi
 * vaan koko idea. Sama kuvio kuin puheentoiston [voice/audio.ts](./voice/audio.ts):ssä.
 */
let context: AudioContext | null = null

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!context) context = new Ctor()
  return context
}

/** Kutsutaan käyttäjän eleen käsittelijästä. Uudelleenkutsu on vaaraton. */
export function unlockChime(): void {
  const ctx = ensureContext()
  if (ctx && ctx.state === 'suspended') void ctx.resume()
}

/** Kaksisävelinen merkkiääni. Ei lupaa onnistumista — ele on voinut puuttua. */
export function playChime(): void {
  const ctx = ensureContext()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()

  const now = ctx.currentTime
  // Nouseva kvintti: erottuu puhelimen omista äänistä eikä kuulosta
  // virheilmoitukselta, mikä laskeva intervalli olisi.
  const tones = [
    { frequency: 880, start: 0, length: 0.16 },
    { frequency: 1318.5, start: 0.13, length: 0.32 },
  ]

  for (const tone of tones) {
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.value = tone.frequency

    // Nousu ja lasku eksponentiaalisesti: suora katkaisu kuuluisi naksahduksena.
    const start = now + tone.start
    const end = start + tone.length
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)

    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start(start)
    oscillator.stop(end + 0.02)
  }
}
