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
 */
export type RjMobPage = { id: string; label: string; href: string }

export const RJMOB_PAGES: readonly RjMobPage[] = [
  { id: 'yhteenveto', label: 'Yhteenveto', href: '/arxcian/rj-mob/yhteenveto' },
  { id: 'tuotto', label: 'Tuottoseuranta', href: '/arxcian/rj-mob/tuotto' },
  { id: 'trendit', label: 'Trendit', href: '/arxcian/rj-mob/trendit' },
  { id: 'kassamyynti', label: 'Kassamyynti', href: '/arxcian/rj-mob/kassamyynti' },
  { id: 'myyntiseuranta', label: 'Myyntiseuranta', href: '/arxcian/rj-mob/etela' },
  { id: 'tavoitteet', label: 'Tavoitteet ja Run Rate', href: '/arxcian/rj-mob/tavoitteet' },
  { id: 'bonus', label: 'Päällikköbonus', href: '/arxcian/rj-mob/bonus' },
  { id: 'laskuri', label: 'Laskuri', href: '/arxcian/rj-mob/laskuri' },
  { id: 'tyovuorot', label: 'Työvuorot', href: '/arxcian/rj-mob/tyovuorot' },
]
