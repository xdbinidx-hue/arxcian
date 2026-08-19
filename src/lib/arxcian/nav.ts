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
