/**
 * arxcian service worker.
 *
 * Sivujen HTML:ää ei tallenneta välimuistiin tarkoituksella: sisältö on
 * henkilökohtaista ja Albin ja Arbnor voivat käyttää samaa laitetta.
 * Välimuistissa on vain muuttumattomat staattiset tiedostot, ja verkon
 * pettäessä näytetään yksinkertainen offline-sivu.
 */

const CACHE = 'arxcian-v1'
const PRECACHE = ['/icons/icon-192.png', '/icons/icon-512.png']

const OFFLINE_HTML = `<!doctype html>
<html lang="fi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ei yhteyttä · arxcian</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#05070a;color:#dce6f0;font-family:system-ui,sans-serif;text-align:center;padding:24px}
  .dot{width:8px;height:8px;border-radius:99px;background:#35d6d0;margin:0 auto 20px;opacity:.5}
  h1{font-size:17px;font-weight:500;margin:0 0 8px}
  p{font-size:13px;color:#8b9bad;margin:0 0 24px;line-height:1.6}
  button{background:transparent;border:1px solid rgba(148,180,210,.26);color:#dce6f0;
    padding:9px 20px;border-radius:8px;font-size:13px;cursor:pointer}
</style></head>
<body><div><div class="dot"></div>
<h1>Ei verkkoyhteyttä</h1>
<p>arxcian tarvitsee yhteyden näyttääkseen ajantasaisen tilanteen.</p>
<button onclick="location.reload()">Yritä uudelleen</button>
</div></body></html>`

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/** Muuttumattomat tiedostot: haetaan välimuistista, muuten verkosta ja talteen. */
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(CACHE)
    cache.put(request, response.clone())
  }
  return response
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Rajapintakutsut menevät aina verkkoon
  if (url.pathname.startsWith('/api/')) return

  // /textures/ on mukana koska maapallon NASA-tekstuuri on 232 kB — ilman
  // välimuistia se ladattaisiin uudelleen joka käynnistyksellä mobiilidatalla.
  const isImmutable =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/textures/')

  if (isImmutable) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(OFFLINE_HTML, {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          }),
      ),
    )
  }
})

/**
 * Ilmoituksen napautus avaa arxcianin.
 *
 * Ilman tätä käsittelijää napautus vain sulkee ilmoituksen: markkinailmoitus
 * annetaan `registration.showNotification`illa, eikä service workerin
 * näyttämällä ilmoituksella ole oletustoimintoa. Jo avoin ikkuna nostetaan
 * esiin uuden avaamisen sijaan, jottei jokainen kuittaus jättäisi jälkeensä
 * välilehteä.
 */
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = event.notification.data?.url || '/arxcian'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if (client.url.includes('/arxcian') && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(target)
    }),
  )
})
