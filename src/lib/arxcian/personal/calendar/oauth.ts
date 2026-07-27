import { google } from 'googleapis'
import type { OAuth2Client, Credentials } from 'google-auth-library'
import { readCached, writeCached, invalidate } from '../../cache'
import type { UserId } from '@/lib/session'

/**
 * Google Calendar -OAuth. Erillään sovelluksen omasta kirjautumisesta:
 * PIN + iron-session kertoo kuka olet arxcianissa, tämä antaa luvan lukea
 * juuri sinun Google-kalenterisi.
 *
 * Tokenit elävät Redisissä käyttäjäkohtaisesti eivätkä koskaan päädy
 * selaimeen. Refresh-token on pitkäikäinen valtuutus, joten sitä
 * käsitellään kuten muitakin salaisuuksia — vain palvelinpuolella.
 */

// Vain luku riittää: näytämme tapahtumia, emme luo niitä.
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

const TOKEN_TTL_SECONDS = 5 * 365 * 24 * 60 * 60

function tokenKey(user: UserId): string {
  return `calendar:tokens:${user}`
}

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
    // Ilman tätä Google palauttaa refresh-tokenin vain ensimmäisellä
    // valtuutuksella — uudelleenliitos jäisi ilman sitä.
    prompt: 'consent',
    include_granted_scopes: true,
    state,
  })
}

export async function exchangeCode(origin: string, code: string): Promise<Credentials> {
  const { tokens } = await client(origin).getToken(code)
  return tokens
}

export async function storeTokens(user: UserId, tokens: Credentials): Promise<void> {
  await writeCached(tokenKey(user), tokens, TOKEN_TTL_SECONDS, 0)
}

export async function getStoredTokens(user: UserId): Promise<Credentials | null> {
  const cached = await readCached<Credentials>(tokenKey(user))
  return cached?.data ?? null
}

export async function clearTokens(user: UserId): Promise<void> {
  await invalidate(tokenKey(user))
}

export async function isConnected(user: UserId): Promise<boolean> {
  return Boolean(await getStoredTokens(user))
}

/**
 * Valtuutettu asiakas tallennetuilla tokeneilla, tai null jos käyttäjä ei
 * ole liittänyt kalenteria.
 *
 * Palauttaa myös `persist`-funktion: serverless-ympäristössä jokainen
 * pyyntö luo uuden asiakkaan, joten uusiutunut access-token on
 * tallennettava itse. Googlen 'tokens'-tapahtumaan ei voi luottaa, koska
 * pyyntö voi päättyä ennen kuin käsittelijä ehtii kirjoittaa.
 */
export async function authorizedClient(
  user: UserId,
  origin: string,
): Promise<{ auth: OAuth2Client; persistIfRefreshed: () => Promise<void> } | null> {
  const stored = await getStoredTokens(user)
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
        await storeTokens(user, { ...stored, ...current, refresh_token: current.refresh_token ?? stored.refresh_token })
      }
    },
  }
}
