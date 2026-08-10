'use client'

import {
  MONTHS,
  WEEKDAYS_SHORT,
  addDays,
  eventsOnDay,
  formatDayLabel,
  formatTime,
  isToday,
  layoutDay,
  monthGrid,
  startOfDay,
  startOfMonth,
  weekDays,
} from '@/lib/arxcian/personal/calendar/dates'
import { accountAccent, type CalendarEvent } from '@/lib/arxcian/personal/calendar/types'

type ViewProps = {
  events: CalendarEvent[]
  anchor: Date
  /** Näytetäänkö tilin tunniste tapahtumien yhteydessä. Vain useamman
   *  liitetyn tilin käyttäjälle, jotta yhden tilin näkymä ei muutu. */
  showAccounts?: boolean
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const HOUR_HEIGHT = 40

function EventChip({ event, compact = false }: { event: CalendarEvent; compact?: boolean }) {
  const accent = accountAccent(event.accountColorIndex)
  const body = (
    <>
      {!event.allDay && !compact && (
        <span className="mr-1 font-mono text-[10px] text-ax-faint">{formatTime(event.start)}</span>
      )}
      <span className="truncate">{event.title}</span>
    </>
  )
  const className = `block truncate rounded border-l-2 px-1.5 py-0.5 text-[11px] text-ax-text ${
    event.htmlLink ? 'hover:brightness-125' : ''
  }`
  const style = { borderLeftColor: accent.solid, backgroundColor: accent.soft }

  return event.htmlLink ? (
    <a href={event.htmlLink} target="_blank" rel="noopener noreferrer" className={className} style={style} title={event.title}>
      {body}
    </a>
  ) : (
    <span className={className} style={style} title={event.title}>
      {body}
    </span>
  )
}

/** Tuntiruudukko päivä- ja viikkonäkymän pohjaksi. */
function HourGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <div className="w-10 shrink-0">
        {HOURS.map(h => (
          <div key={h} className="relative" style={{ height: HOUR_HEIGHT }}>
            <span className="absolute -top-1.5 right-1 font-mono text-[9px] text-ax-faint">
              {String(h).padStart(2, '0')}
            </span>
          </div>
        ))}
      </div>
      <div className="relative flex-1">
        <div className="absolute inset-0">
          {HOURS.map(h => (
            <div key={h} className="border-t border-ax-line/40" style={{ height: HOUR_HEIGHT }} />
          ))}
        </div>
        {children}
      </div>
    </div>
  )
}

function DayColumn({ events, day }: { events: CalendarEvent[]; day: Date }) {
  const positioned = layoutDay(eventsOnDay(events, day), day)
  const total = HOUR_HEIGHT * 24

  return (
    <div className="relative h-full">
      {positioned.map(({ event, top, height, col, cols }) => {
        const accent = accountAccent(event.accountColorIndex)
        return (
          <a
            key={`${event.id}-${col}`}
            href={event.htmlLink ?? undefined}
            target={event.htmlLink ? '_blank' : undefined}
            rel="noopener noreferrer"
            title={`${formatTime(event.start)}–${formatTime(event.end)} ${event.title}`}
            className="absolute overflow-hidden rounded border-l-2 px-1 py-0.5 text-[10px] leading-tight text-ax-text hover:brightness-125"
            style={{
              top: top * total,
              height: Math.max(height * total, 16),
              left: `${(col / cols) * 100}%`,
              width: `${(1 / cols) * 100 - 1}%`,
              borderLeftColor: accent.solid,
              backgroundColor: accent.soft,
            }}
          >
            <span className="block truncate font-medium">{event.title}</span>
            <span className="block truncate font-mono text-[9px] text-ax-dim">{formatTime(event.start)}</span>
          </a>
        )
      })}
    </div>
  )
}

function AllDayStrip({ events, days }: { events: CalendarEvent[]; days: Date[] }) {
  const has = days.some(d => eventsOnDay(events, d).some(e => e.allDay))
  if (!has) return null

  return (
    <div className="mb-1 flex border-b border-ax-line pb-1">
      <div className="w-10 shrink-0 pr-1 text-right font-mono text-[9px] text-ax-faint">koko pv</div>
      <div className="flex flex-1 gap-1">
        {days.map(day => (
          <div key={day.toISOString()} className="flex-1 space-y-0.5">
            {eventsOnDay(events, day)
              .filter(e => e.allDay)
              .map(e => (
                <EventChip key={e.id} event={e} compact />
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function AgendaView({ events, showAccounts = false }: ViewProps) {
  const now = Date.now()
  const upcoming = events.filter(e => e.end >= now).slice(0, 50)

  if (upcoming.length === 0) {
    return <p className="py-8 text-center text-[13px] text-ax-faint">Ei tulevia tapahtumia.</p>
  }

  // Ryhmitellään päiväkohtaisesti, jotta lista on selattava.
  const groups = new Map<string, CalendarEvent[]>()
  for (const e of upcoming) {
    const key = startOfDay(new Date(e.start)).toISOString()
    const list = groups.get(key) ?? []
    list.push(e)
    groups.set(key, list)
  }

  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([key, dayEvents]) => {
        const day = new Date(key)
        return (
          <div key={key}>
            <h3
              className={`mb-1.5 text-[11px] uppercase tracking-wider ${
                isToday(day) ? 'text-ax-accent' : 'text-ax-faint'
              }`}
            >
              {isToday(day) ? 'Tänään · ' : ''}
              {formatDayLabel(day)}
            </h3>
            <ul className="space-y-1">
              {dayEvents.map(e => {
                const accent = accountAccent(e.accountColorIndex)
                return (
                  <li
                    key={e.id}
                    className="flex items-baseline gap-3 rounded-md border border-ax-line px-3 py-2 text-[12px]"
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 self-center rounded-full"
                      style={{ backgroundColor: accent.solid }}
                    />
                    <span className="w-24 shrink-0 font-mono text-[11px] text-ax-dim">
                      {e.allDay ? 'koko päivä' : `${formatTime(e.start)}–${formatTime(e.end)}`}
                    </span>
                    <span className="flex-1 text-ax-text">
                      {e.htmlLink ? (
                        <a
                          href={e.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-ax-accent"
                        >
                          {e.title}
                        </a>
                      ) : (
                        e.title
                      )}
                      {e.location && <span className="ml-2 text-[11px] text-ax-faint">📍 {e.location}</span>}
                    </span>
                    {e.calendarName && (
                      <span className="shrink-0 rounded border border-ax-line px-1.5 text-[9px] text-ax-faint">
                        {e.calendarName}
                      </span>
                    )}
                    {showAccounts && e.accountEmail && (
                      <span className="shrink-0 rounded border border-ax-line px-1.5 text-[9px] text-ax-faint">
                        {e.accountEmail}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

export function DayView({ events, anchor }: ViewProps) {
  return (
    <div>
      <h3 className={`mb-2 text-[12px] ${isToday(anchor) ? 'text-ax-accent' : 'text-ax-dim'}`}>
        {formatDayLabel(anchor)}
      </h3>
      <AllDayStrip events={events} days={[anchor]} />
      <div className="max-h-[520px] overflow-y-auto">
        <HourGrid>
          <DayColumn events={events} day={anchor} />
        </HourGrid>
      </div>
    </div>
  )
}

export function WeekView({ events, anchor }: ViewProps) {
  const days = weekDays(anchor)

  return (
    <div>
      <div className="mb-1 flex">
        <div className="w-10 shrink-0" />
        {days.map(day => (
          <div key={day.toISOString()} className="flex-1 text-center">
            <div className="text-[10px] uppercase tracking-wider text-ax-faint">
              {WEEKDAYS_SHORT[(day.getDay() + 6) % 7]}
            </div>
            <div className={`text-[13px] ${isToday(day) ? 'font-medium text-ax-accent' : 'text-ax-text'}`}>
              {day.getDate()}
            </div>
          </div>
        ))}
      </div>

      <AllDayStrip events={events} days={days} />

      <div className="max-h-[520px] overflow-y-auto">
        <HourGrid>
          <div className="flex h-full">
            {days.map(day => (
              <div key={day.toISOString()} className="flex-1 border-l border-ax-line/40">
                <DayColumn events={events} day={day} />
              </div>
            ))}
          </div>
        </HourGrid>
      </div>
    </div>
  )
}

export function MonthView({ events, anchor }: ViewProps) {
  const grid = monthGrid(anchor)
  const currentMonth = anchor.getMonth()

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAYS_SHORT.map(d => (
          <div key={d} className="text-center text-[10px] uppercase tracking-wider text-ax-faint">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {grid.map(day => {
          const dayEvents = eventsOnDay(events, day)
          const outside = day.getMonth() !== currentMonth
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[76px] rounded border p-1 ${
                isToday(day) ? 'border-ax-accent/50 bg-ax-accent/5' : 'border-ax-line'
              } ${outside ? 'opacity-40' : ''}`}
            >
              <div className={`mb-0.5 text-[11px] ${isToday(day) ? 'text-ax-accent' : 'text-ax-dim'}`}>
                {day.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(e => (
                  <EventChip key={e.id} event={e} compact />
                ))}
                {dayEvents.length > 3 && (
                  <span className="block text-[9px] text-ax-faint">+{dayEvents.length - 3} lisää</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function YearView({ events, anchor }: ViewProps) {
  const year = anchor.getFullYear()

  // Tapahtumien määrä per päivä, jotta tiheys voidaan näyttää sävyinä.
  const counts = new Map<string, number>()
  for (const e of events) {
    const d = startOfDay(new Date(e.start))
    if (d.getFullYear() !== year) continue
    const key = d.toISOString()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {MONTHS.map((name, monthIndex) => {
        const first = new Date(year, monthIndex, 1)
        const cells = monthGrid(first)
        return (
          <div key={name}>
            <h3 className="mb-1 text-[11px] uppercase tracking-wider text-ax-dim">{name}</h3>
            <div className="grid grid-cols-7 gap-px">
              {cells.map(day => {
                const outside = day.getMonth() !== monthIndex
                const count = counts.get(startOfDay(day).toISOString()) ?? 0
                const intensity = count === 0 ? 0 : count === 1 ? 0.25 : count <= 3 ? 0.5 : 0.85
                return (
                  <div
                    key={day.toISOString()}
                    title={count > 0 ? `${day.getDate()}.${monthIndex + 1}. — ${count} tapahtumaa` : undefined}
                    className={`aspect-square rounded-[2px] text-center text-[8px] leading-[1.6] ${
                      outside ? 'opacity-20' : ''
                    } ${isToday(day) ? 'ring-1 ring-ax-accent' : ''}`}
                    style={{
                      backgroundColor: intensity > 0 ? `rgb(var(--ax-accent) / ${intensity})` : undefined,
                      color: intensity > 0.4 ? 'rgb(var(--ax-bg))' : undefined,
                    }}
                  >
                    {outside ? '' : day.getDate()}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Otsikkoteksti navigointipalkkiin valitun näkymän mukaan. */
export function rangeLabel(view: string, anchor: Date): string {
  if (view === 'paiva') return formatDayLabel(anchor)
  if (view === 'viikko') {
    const days = weekDays(anchor)
    const last = days[6]
    return `${days[0].getDate()}.${days[0].getMonth() + 1}. – ${last.getDate()}.${last.getMonth() + 1}.${last.getFullYear()}`
  }
  if (view === 'vuosi') return String(anchor.getFullYear())
  if (view === 'agenda') return 'Tulevat tapahtumat'
  return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
}

/** Siirtymä eteen/taakse valitun näkymän mukaan. */
export function shiftAnchor(view: string, anchor: Date, direction: 1 | -1): Date {
  if (view === 'paiva') return addDays(anchor, direction)
  if (view === 'viikko') return addDays(anchor, 7 * direction)
  if (view === 'vuosi') return new Date(anchor.getFullYear() + direction, anchor.getMonth(), 1)
  const next = startOfMonth(anchor)
  next.setMonth(next.getMonth() + direction)
  return next
}
