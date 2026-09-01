export type SectionId = 'rjmob' | 'trading' | 'uutiset' | 'personal'

export type Section = {
  id: SectionId
  label: string
  href: string
  /** Lyhyt kuvaus hub-etusivun korttiin */
  description: string
  /** Polkuetuliite jolla osio tunnistetaan aktiiviseksi, jos se ei ole `href`.
   *  RJ-Mob tarvitsee tämän: sen href osoittaa yhteen alasivuun (tuotto), mutta
   *  osion on korostuttava kaikilla yhdeksällä. */
  match?: string
}

/** Hubin neljä pääosiota. Yksi määrittely, jota navigaatio ja etusivu käyttävät. */
export const SECTIONS: readonly Section[] = [
  {
    id: 'rjmob',
    label: 'RJ-Mob',
    href: '/arxcian/rj-mob/tuotto',
    description: 'Myynti, kannattavuus ja kassavirta',
    match: '/arxcian/rj-mob',
  },
  {
    id: 'trading',
    label: 'Trading',
    href: '/arxcian/trading',
    description: 'Markkinat, watchlist ja ICT',
  },
  {
    id: 'uutiset',
    label: 'Uutiset',
    href: '/arxcian/uutiset',
    description: 'Kategorioidut koosteet ja AI-tiivistelmät',
  },
  {
    id: 'personal',
    label: 'Personal',
    href: '/arxcian/personal',
    description: 'Tehtävät, kalenteri, tavoitteet ja rutiinit',
  },
]

export const HUB_HREF = '/arxcian'

/** Osio jonka näkymässä ollaan, polun perusteella. */
export function activeSection(pathname: string): SectionId | null {
  const found = SECTIONS.find(s => pathname.startsWith(s.match ?? s.href))
  return found ? found.id : null
}

/**
 * RJ-Mobin alasivut.
 *
 * Määrittely on täällä eikä [RjMobNav](src/components/rjmob/RjMobNav.tsx):ssä,
 * koska navigaatiopalkki ei ole enää ainoa kutsuja: avustajan
 * navigointityökalu ([assistant/actions.ts](src/lib/arxcian/assistant/actions.ts))
 * tarvitsee saman listan. Sitä ei voi tuoda `'use client'`-komponentista
 * palvelinpuolen moduuliin ilman että koko komponentti tulee mukana, ja kaksi
 * käsin ylläpidettyä listaa erkanisi ensimmäisen uuden sivun kohdalla —
 * avustaja väittäisi avaavansa sivun jota ei ole.
 *
 * `id` on avustajan käyttämä tunniste, `label` sama teksti jonka käyttäjä
 * näkee palkissa.
 *
 * Neljä välilehteä poistettiin 1.9.2026, ja kaikki neljä poistuivat kokonaan
 * — piilotettua sivua ei jätetty, jottei palkin ulkopuolelle jää mitään mitä
 * kukaan ei enää löydä. `yhteenveto` ja `tavoitteet` siksi että sama data oli
 * kahdessa paikassa ja Tavoitteet ja Run Rate -sivun kolme näkymää siirtyivät
 * Myyntiseurantaan näkymänapeiksi; `kassamyynti` ja `bonus` Albinin pyynnöstä.
 *
 * Vanhat polut ohjautuvat [next.config.js](next.config.js):n
 * uudelleenohjauksilla, jotta kirjanmerkit ja PWA:n kotiruutukuvakkeet eivät
 * päädy 404:ään. `/api/receipts` ja `/api/bonus-tavoitteet` jäävät: Trendit ja
 * Tuottoseuranta käyttävät molempia, joten poisto ei orvottanut laskentaa.
 */
export type RjMobPage = { id: string; label: string; href: string }

export const RJMOB_PAGES: readonly RjMobPage[] = [
  { id: 'tuotto', label: 'Tuottoseuranta', href: '/arxcian/rj-mob/tuotto' },
  { id: 'trendit', label: 'Trendit', href: '/arxcian/rj-mob/trendit' },
  { id: 'myyntiseuranta', label: 'Myyntiseuranta', href: '/arxcian/rj-mob/etela' },
  { id: 'laskuri', label: 'Laskuri', href: '/arxcian/rj-mob/laskuri' },
  { id: 'tyovuorot', label: 'Työvuorot', href: '/arxcian/rj-mob/tyovuorot' },
]
