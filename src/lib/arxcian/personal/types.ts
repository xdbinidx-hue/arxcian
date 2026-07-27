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

export type Note = {
  id: string
  owner: Owner
  text: string
  tags: string[]
  createdAt: number
  /** Jos muistiinpano on ylennetty tavoitteeksi, sen tavoitteen id. */
  promotedToGoalId: string | null
}
