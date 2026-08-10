import { google } from 'googleapis'
import type { OAuth2Client, Credentials } from 'google-auth-library'
import { getAccountTokens, storeAccountTokens } from './accounts'
import type { UserId } from '@/lib/session'

/**
 * Google Calendar -OAuth. Erillään sovelluksen omasta kirjautumisesta:
 * PIN + iron-session kertoo kuka olet arxcianissa, tämä antaa luvan lukea
 * juuri sinun Google-kalenterisi.
 *
 * Tokenit elävät Redisissä tilikohtaisesti (accounts.ts) eivätkä koskaan
 * päädy selaimeen. Refresh-token on pitkäikäinen valtuutus, joten sitä
 * käsitellään kuten muitakin salaisuuksia — vain palvelinpuolella.
 */

// calendar.readonly riittää tapahtumien lukemiseen. openid ja userinfo.email
// ovat mukana vain jotta liitetystä tilistä saadaan pysyvä tunniste (sub) ja
// näytettävä sähköpostiosoite — ilman niitä kahta tiliä ei voisi erottaa
// toisistaan käyttöliittymässä. Molemmat ovat ei-arkaluontoisia scopeja.
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
]

export function isConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
}

/**
 * Uudelleenohjausosoite johdetaan pyynnön originista, jotta sama koodi
 * toimii sekä localhostissa että tuotannossa ilman lisäkonfiguraatiota.
 * Google hyväksyy vain konsolissa rekisteröidyt osoitteet, joten tämä ei
 * avaa avointa uudelleenohjausta.
 */
export function redirectUri(origin: string): string {
  return `${origin}/api/arxcian/personal/calendar/callback`
}

function client(origin: string): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri(origin),
  )
}

export function authUrl(origin: string, state: string): string {
  return client(origin).generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    // consent: ilman tätä Google palauttaa refresh-tokenin vain ensimmäisellä
    // valtuutuksella. select_account: ilman tätä Google käyttää vaiti
    // selaimessa jo kirjautunutta tiliä, jolloin toisen tilin (työ)
    // lisääminen olisi mahdotonta.
    prompt: 'select_account consent',
    include_granted_scopes: true,
    state,
  })
}

export type ExchangedAccount = {
  tokens: Credentials
  /** Googlen pysyvä tunniste tilille. Sähköposti voi vaihtua, tämä ei. */
  id: string
  email: string | null
}

/**
 * Vaihtaa valtuutuskoodin tokeneiksi ja selvittää mille tilille lupa
 * myönnettiin. Tunniste luetaan id_tokenista, joka varmennetaan Googlen
 * julkisilla avaimilla — sen sisältöä ei oteta vastaan varmentamatta.
 */
export async function exchangeCode(origin: string, code: string): Promise<ExchangedAccount | null> {
  const auth = client(origin)
  const { tokens } = await auth.getToken(code)
  if (!tokens.refresh_token && !tokens.access_token) return null

  if (tokens.id_token) {
    const ticket = await auth.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    if (payload?.sub) {
      return { tokens, id: payload.sub, email: payload.email ?? null }
    }
  }

  // Varatie jos id_token puuttuu (esim. scopet eivät ole vielä voimassa
  // suostumusnäytöllä): tokeninfo kertoo saman tunnisteen.
  if (tokens.access_token) {
    try {
      const info = await auth.getTokenInfo(tokens.access_token)
      if (info.sub) return { tokens, id: info.sub, email: info.email ?? null }
    } catch (e) {
      console.error('[calendar] tokeninfo epäonnistui', e)
    }
  }

  return null
}

/**
 * Valtuutettu asiakas yhden tilin tallennetuilla tokeneilla, tai null jos
 * tiliä ei ole liitetty.
 *
 * Palauttaa myös `persist`-funktion: serverless-ympäristössä jokainen
 * pyyntö luo uuden asiakkaan, joten uusiutunut access-token on
 * tallennettava itse. Googlen 'tokens'-tapahtumaan ei voi luottaa, koska
 * pyyntö voi päättyä ennen kuin käsittelijä ehtii kirjoittaa.
 */
export async function authorizedClient(
  user: UserId,
  accountId: string,
  origin: string,
): Promise<{ auth: OAuth2Client; persistIfRefreshed: () => Promise<void> } | null> {
  const stored = await getAccountTokens(user, accountId)
  if (!stored) return null

  const auth = client(origin)
  auth.setCredentials(stored)
  const originalAccessToken = stored.access_token

  return {
    auth,
    persistIfRefreshed: async () => {
      const current = auth.credentials
      if (current.access_token && current.access_token !== originalAccessToken) {
        // Google ei palauta refresh-tokenia uusinnan yhteydessä — säilytetään alkuperäinen.
        await storeAccountTokens(user, accountId, {
          ...stored,
          ...current,
          refresh_token: current.refresh_token ?? stored.refresh_token,
        })
      }
    },
  }
}
