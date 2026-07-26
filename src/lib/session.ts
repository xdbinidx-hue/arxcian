import { getIronSession, type SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'

/** arxcianin varsinaiset käyttäjät. RJ-Mobin vieraskäyttäjä on erikseen 'guest'. */
export type UserId = 'albin' | 'arbnor'
export type SessionUser = UserId | 'guest'

/** Sisällön näkyvyys: henkilökohtainen (omistajan tunnus) tai molemmille jaettu. */
export type Owner = UserId | 'shared'

export const USER_IDS: readonly UserId[] = ['albin', 'arbnor']

export type SessionData = {
  user?: SessionUser
  /** Unix ms. Istunto vanhenee tähän myös palvelimella, ei pelkän evästeen varassa. */
  expiresAt?: number
}

/** Vieraskäyttäjän käyttökerrat. Omassa pitkäikäisessä evästeessään, jotta
 *  laskuri säilyy vaikka tunnin istunto ehtii vanheta. */
export type GuestData = { uses?: number }

export const SESSION_COOKIE = 'arxcian_session'
export const GUEST_COOKIE = 'arxcian_guest'

export const USER_SESSION_DAYS = 30
export const GUEST_SESSION_HOURS = 1
export const GUEST_MAX_USES = 5

const DAY = 24 * 60 * 60

function password() {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET puuttuu tai on alle 32 merkkiä')
  }
  return secret
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}

export function sessionOptions(): SessionOptions {
  return {
    password: password(),
    cookieName: SESSION_COOKIE,
    ttl: USER_SESSION_DAYS * DAY,
    cookieOptions: cookieOptions(USER_SESSION_DAYS * DAY),
  }
}

export function guestOptions(): SessionOptions {
  return {
    password: password(),
    cookieName: GUEST_COOKIE,
    ttl: 365 * DAY,
    cookieOptions: cookieOptions(365 * DAY),
  }
}

/** Kirjautunut käyttäjä istuntodatasta, tai null jos puuttuu tai vanhentunut. */
export function sessionUser(data: SessionData | null | undefined): SessionUser | null {
  if (!data?.user) return null
  if (data.expiresAt && Date.now() > data.expiresAt) return null
  return data.user
}

/** Istunto server componentissa tai route handlerissa. */
export function getSession() {
  return getIronSession<SessionData>(cookies(), sessionOptions())
}

/** Kirjautunut käyttäjä server-puolella, tai null. */
export async function currentUser(): Promise<SessionUser | null> {
  return sessionUser(await getSession())
}

/** arxcianin osiot ovat henkilökohtaisia — vieras ei pääse niihin. */
export async function currentOwner(): Promise<UserId | null> {
  const user = await currentUser()
  return user && user !== 'guest' ? user : null
}

/** Näkeekö käyttäjä tämän omistajan sisällön. */
export function canView(owner: Owner, user: SessionUser | null): boolean {
  if (!user || user === 'guest') return false
  return owner === 'shared' || owner === user
}

/** Suodattaa listan käyttäjän näkyvyyden mukaan. */
export function visibleTo<T extends { owner: Owner }>(items: T[], user: SessionUser | null): T[] {
  return items.filter(item => canView(item.owner, user))
}
