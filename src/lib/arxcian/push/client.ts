/**
 * Push-tilaus selaimen puolella.
 *
 * Erillään [send.ts](./send.ts):stä, joka on palvelinkoodia ja importtaa
 * `web-push`in — sen vetäminen selainniputukseen kaataisi käännöksen.
 *
 * **Service worker rekisteröidään vain tuotannossa**
 * ([ServiceWorkerRegister](@/components/arxcian/ServiceWorkerRegister)), koska
 * kehityksessä se välimuistittaisi `/_next/static/*`-palasia ja rikkoisi hot
 * reloadin. Push ei siis toimi `npm run dev`issä lainkaan, ja se sanotaan
 * käyttöliittymässä eikä jätetä pääteltäväksi tyhjästä ilmoituksesta.
 */

export type DeviceSubscription = {
  endpoint: string
  keys: { p256dh: string; auth: string }
  label: string
}

/**
 * VAPID-avain base64url-muodosta `pushManager.subscribe`n odottamaksi tavupuskuriksi.
 *
 * `atob` ei ymmärrä base64url-aakkostoa eikä täytteen puuttumista, joten `-`
 * ja `_` käännetään ja `=` lisätään takaisin. Ilman tätä selain hylkää avaimen
 * virheellä joka ei kerro syytä.
 *
 * Puskuri varataan nimenomaisesti `ArrayBuffer`ina ja paluutyyppi on
 * `BufferSource`: pelkkä `new Uint8Array(pituus)` on TypeScript 5.7:stä
 * lähtien `Uint8Array<ArrayBufferLike>`, joka ei kelpaa
 * `applicationServerKey`ksi koska se voisi olla myös `SharedArrayBuffer`.
 */
function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(normalized)

  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

/**
 * Karkea laitteen nimi listaa varten.
 *
 * User-agentin haarukointi on epätarkkaa eikä siihen nojata missään muussa:
 * tämä on pelkkä ihmisluettava tunniste jotta "poista laite" -painike ei
 * osoittaisi satunnaiseen URL-pötköön. Väärä arvaus ei riko mitään.
 */
export function deviceLabel(): string {
  const ua = navigator.userAgent
  const platform = /iPhone|iPad/.test(ua)
    ? 'iPhone'
    : /Android/.test(ua)
      ? 'Android'
      : /Macintosh/.test(ua)
        ? 'Mac'
        : /Windows/.test(ua)
          ? 'Windows'
          : 'Laite'

  // Chrome ennen Safaria: Chromen user-agent sisältää sanan "Safari", ei toisin päin.
  const browser = /CriOS|Chrome/.test(ua)
    ? 'Chrome'
    : /Firefox/.test(ua)
      ? 'Firefox'
      : /Safari/.test(ua)
        ? 'Safari'
        : 'selain'

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true

  return `${platform} · ${standalone ? 'kotiruutu' : browser}`
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Rekisteröity service worker, tai null jos sitä ei ole (kehitys). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

/** Tämän laitteen nykyinen tilaus, tai null. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration()
  if (!reg) return null
  return reg.pushManager.getSubscription()
}

/**
 * Tilaa push tälle laitteelle.
 *
 * Heittää puhuvan virheen jokaisesta esteestä erikseen, koska ne vaativat eri
 * korjauksen: puuttuva service worker tarkoittaa kehitysympäristöä, evätty
 * lupa vaatii selaimen asetukset, ja iPhonella koko rajapinta puuttuu ellei
 * sovellusta ole asennettu kotiruudulle.
 */
export async function subscribeThisDevice(publicKey: string): Promise<DeviceSubscription> {
  if (!pushSupported()) {
    throw new Error(
      'Selain ei tue push-ilmoituksia. iPhonella arxcian on asennettava kotiruudulle.',
    )
  }

  const reg = await registration()
  if (!reg) {
    throw new Error('Service workeria ei ole rekisteröity — push toimii vain tuotantoversiossa.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Ilmoituslupa evättiin. Salli se selaimen sivukohtaisista asetuksista.')
  }

  // userVisibleOnly on pakollinen: selaimet eivät salli hiljaista pushia
  // lainkaan, ja arvo false hylättäisiin.
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })

  const json = subscription.toJSON()
  if (!json.keys?.p256dh || !json.keys.auth) {
    throw new Error('Selain ei palauttanut salausavaimia — tilaus ei kelpaa.')
  }

  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    label: deviceLabel(),
  }
}

/**
 * Peruu tämän laitteen tilauksen selaimessa ja palauttaa peruutetun endpointin.
 *
 * Palvelinpuolen poisto on kutsujan vastuulla: selaimen `unsubscribe` ei kerro
 * palvelimelle mitään, ja pelkkä palvelinpoisto jättäisi selaimen tilauksen
 * elämään niin että seuraava "ota käyttöön" palauttaisi saman endpointin
 * ilman uutta lupakyselyä.
 */
export async function unsubscribeThisDevice(): Promise<string | null> {
  const subscription = await currentSubscription()
  if (!subscription) return null

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  return endpoint
}
