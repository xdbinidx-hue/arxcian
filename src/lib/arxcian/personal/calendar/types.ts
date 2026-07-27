/** Lähteestä riippumaton tapahtuma. Google Calendar on nyt ainoa lähde,
 *  mutta näkymät eivät tiedä siitä mitään. */
export type CalendarEvent = {
  id: string
  title: string
  /** Unix ms */
  start: number
  end: number
  allDay: boolean
  location: string | null
  /** Kalenterin nimi jos tapahtuma tulee muusta kuin oletuskalenterista */
  calendarName: string | null
  htmlLink: string | null
}

export type CalendarStatus =
  | { state: 'not-configured' }
  | { state: 'disconnected' }
  | { state: 'connected'; events: CalendarEvent[]; fetchedAt: number }
  | { state: 'error'; message: string }

export type CalendarView = 'agenda' | 'paiva' | 'viikko' | 'kuukausi' | 'vuosi'

export const CALENDAR_VIEWS: readonly CalendarView[] = ['agenda', 'paiva', 'viikko', 'kuukausi', 'vuosi']

export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = {
  agenda: 'Agenda',
  paiva: 'Päivä',
  viikko: 'Viikko',
  kuukausi: 'Kuukausi',
  vuosi: 'Vuosi',
}
