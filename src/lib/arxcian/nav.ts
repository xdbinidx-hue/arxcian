export type SectionId = 'rjmob' | 'trading' | 'uutiset' | 'personal'

export type Section = {
  id: SectionId
  label: string
  href: string
  /** Lyhyt kuvaus hub-etusivun korttiin */
  description: string
  /** Ulkoinen = arxcianin kehyksen ulkopuolinen näkymä (RJ-Mob) */
  external?: boolean
}

/** Hubin neljä pääosiota. Yksi määrittely, jota navigaatio ja etusivu käyttävät. */
export const SECTIONS: readonly Section[] = [
  {
    id: 'rjmob',
    label: 'RJ-Mob',
    href: '/tuotto',
    description: 'Myynti, kannattavuus ja kassavirta',
    external: true,
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
    description: 'Kalenteri, tavoitteet ja rutiinit',
  },
]

export const HUB_HREF = '/arxcian'

/** Osio jonka näkymässä ollaan, polun perusteella. */
export function activeSection(pathname: string): SectionId | null {
  const match = SECTIONS.find(s => !s.external && pathname.startsWith(s.href))
  return match ? match.id : null
}
