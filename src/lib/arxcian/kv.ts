import { createClient, type VercelKV } from '@vercel/kv'

/**
 * Redis-asiakas koko sovellukselle.
 *
 * **Miksi omaa asiakasta tarvitaan.** `@vercel/kv`:n oletusvienti rakentaa
 * asiakkaan asetuksella `cache: "default"` (ks. paketin `createClient`).
 * Next tulkitsee sen kutsujen välimuistituslupana ja tallentaa Upstashin
 * HTTP-vastaukset omaan Data Cacheensa vuodeksi. Seuraus on hiljainen ja
 * ikävä: kylmän prosessin ensimmäinen luku avainta kohti voi palauttaa
 * vanhentuneen arvon — tai `null`in avaimelle joka on Redisissä tallella —
 * ilman että mikään kirjaa virhettä. Sivu näyttää silloin vanhaa dataa
 * vaikka cron on juuri kirjoittanut uuden.
 *
 * `cache: 'no-store'` on `@upstash/redis`:n oma oletus, ja koska `...config`
 * leviää paketin oletusten päälle, se menee `"default"`in yli. Redis on
 * välimuisti jo itsessään; sen päälle ei tarvita toista välimuistia joka ei
 * tiedä milloin arvo muuttui.
 *
 * **Miksi laiskasti.** Asiakas rakennetaan vasta ensimmäisellä kutsulla, ei
 * moduulia ladattaessa. Käännös ja staattinen analyysi eivät tarvitse
 * Redis-tunnuksia, eikä puuttuva ympäristömuuttuja saa kaataa buildia.
 *
 * **Miksi heitto eikä null.** Kutsujat kääräisevät jo kutsunsa try/catchiin ja
 * niillä on omat varautumisensa: health-reitti raportoi katkon, rateLimit
 * epäonnistuu auki tai kiinni lipun mukaan, cache.ts palaa suoraan lähteeseen.
 * Null-paluu pakottaisi jokaisen niistä kirjoittamaan saman tarkistuksen
 * uudelleen ja hukkaisi syyn.
 */

let client: VercelKV | null = null

/** Rakentaa asiakkaan tai heittää selkeän virheen jonka kutsuja nappaa. */
function create(): VercelKV {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN

  if (!url || !token) {
    throw new Error('KV_REST_API_URL tai KV_REST_API_TOKEN puuttuu')
  }

  try {
    return createClient({ url, token, cache: 'no-store' })
  } catch (e) {
    // Esimerkiksi kelvoton URL. Kääritään, jotta kutsujan lokista näkee että
    // vika oli asiakkaan luonnissa eikä itse Redis-kutsussa.
    throw new Error(`Redis-asiakkaan luonti epäonnistui: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Jaettu asiakas. Luodaan kerran ja vasta kun sitä oikeasti tarvitaan. */
export function kv(): VercelKV {
  if (!client) client = create()
  return client
}
