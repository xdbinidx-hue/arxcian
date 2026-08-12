import type { Owner } from '@/lib/session'

export type GoalArea = 'tyo' | 'henkilokohtainen' | 'terveys'

export const GOAL_AREAS: readonly GoalArea[] = ['tyo', 'henkilokohtainen', 'terveys']

export const GOAL_AREA_LABELS: Record<GoalArea, string> = {
  tyo: 'Työ',
  henkilokohtainen: 'Henkilökohtainen',
  terveys: 'Terveys',
}

export type Goal = {
  id: string
  owner: Owner
  area: GoalArea
  title: string
  description: string
  targetDate: string | null // YYYY-MM-DD
  done: boolean
  createdAt: number
  completedAt: number | null
}

export type Habit = {
  id: string
  owner: Owner
  title: string
  createdAt: number
  /** YYYY-MM-DD -päivämäärät jolloin rutiini on merkitty tehdyksi. */
  completedDates: string[]
}

export type Todo = {
  id: string
  owner: Owner
  title: string
  /** YYYY-MM-DD jolle tehtävä on ajoitettu, `null` = jonossa ilman päivää.
   *  Päivä on selaimen paikallinen kalenteripäivä, ei UTC: palvelin ajaa
   *  UTC:ssa, joten "tänään" laskettuna palvelimella olisi Suomen aikaa
   *  klo 00–03 väärä päivä. Siksi päivä valitaan ja tulkitaan selaimessa. */
  date: string | null
  /** HH:MM paikallista aikaa. Vaatii `date`n — ilman päivää kellonajalla ei
   *  ole ankkuria mihin muistutus kiinnittyisi. */
  remindAt: string | null
  done: boolean
  createdAt: number
  completedAt: number | null
}

export type Note = {
  id: string
  owner: Owner
  text: string
  tags: string[]
  createdAt: number
  /** Jos muistiinpano on ylennetty tavoitteeksi, sen tavoitteen id. */
  promotedToGoalId: string | null
}
