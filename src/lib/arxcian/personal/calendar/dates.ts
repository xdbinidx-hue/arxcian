import type { CalendarEvent } from './types'

/**
 * Päivämääräapurit kalenterinäkymille. Käyttävät selaimen paikallista
 * aikavyöhykettä tarkoituksella — käyttäjä haluaa nähdä tapahtumat omassa
 * ajassaan, ja komponentit ovat asiakaspuolella.
 *
 * Viikko alkaa maanantaista (suomalainen käytäntö), ei sunnuntaista.
 */

export const WEEKDAYS_SHORT = ['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su']

export const MONTHS = [
  'tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu',
  'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu',
]

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d)
  x.setMonth(x.getMonth() + n, 1)
  return x
}

/** Maanantai joka aloittaa annetun päivän viikon. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d)
  const offset = (x.getDay() + 6) % 7
  return addDays(x, -offset)
}

export function startOfMonth(d: Date): Date {
  const x = startOfDay(d)
  x.setDate(1)
  return x
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date())
}

/** Kuuluuko tapahtuma tälle päivälle (monipäiväiset mukaan lukien). */
export function eventOnDay(event: CalendarEvent, day: Date): boolean {
  const dayStart = startOfDay(day).getTime()
  const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1
  return event.start <= dayEnd && event.end >= dayStart
}

export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter(e => eventOnDay(e, day))
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
}

export function formatDayLabel(d: Date): string {
  return d.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function formatMonthYear(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** Kuuden viikon ruudukko kuukausinäkymään, maanantaista alkaen. */
export function monthGrid(anchor: Date): Date[] {
  const first = startOfWeek(startOfMonth(anchor))
  return Array.from({ length: 42 }, (_, i) => addDays(first, i))
}

export function weekDays(anchor: Date): Date[] {
  const first = startOfWeek(anchor)
  return Array.from({ length: 7 }, (_, i) => addDays(first, i))
}

export type PositionedEvent = {
  event: CalendarEvent
  /** Osuus vuorokaudesta, 0–1 */
  top: number
  height: number
  /** Sarake ja sarakkeiden määrä päällekkäisyyksien jakamiseen */
  col: number
  cols: number
}

/**
 * Asettelee päivän tapahtumat tuntiruudukkoon. Päällekkäiset tapahtumat
 * jaetaan vierekkäisiin sarakkeisiin, jotta ne eivät peitä toisiaan.
 */
export function layoutDay(events: CalendarEvent[], day: Date): PositionedEvent[] {
  const dayStart = startOfDay(day).getTime()
  const dayMs = 24 * 60 * 60 * 1000

  const timed = events
    .filter(e => !e.allDay)
    .map(e => {
      const start = Math.max(e.start, dayStart)
      const end = Math.min(e.end, dayStart + dayMs)
      return { event: e, startMs: start, endMs: Math.max(end, start + 15 * 60 * 1000) }
    })
    .sort((a, b) => a.startMs - b.startMs)

  // Ryhmitellään päällekkäiset klustereiksi ja jaetaan kullekin sarake.
  const positioned: PositionedEvent[] = []
  let cluster: typeof timed = []

  const flush = () => {
    if (cluster.length === 0) return
    const columnEnds: number[] = []
    const assigned = cluster.map(item => {
      let col = columnEnds.findIndex(end => end <= item.startMs)
      if (col === -1) {
        col = columnEnds.length
        columnEnds.push(item.endMs)
      } else {
        columnEnds[col] = item.endMs
      }
      return { item, col }
    })
    const cols = columnEnds.length
    assigned.forEach(({ item, col }) => {
      positioned.push({
        event: item.event,
        top: (item.startMs - dayStart) / dayMs,
        height: (item.endMs - item.startMs) / dayMs,
        col,
        cols,
      })
    })
    cluster = []
  }

  let clusterEnd = -Infinity
  for (const item of timed) {
    if (cluster.length > 0 && item.startMs >= clusterEnd) flush()
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.endMs)
  }
  flush()

  return positioned
}
