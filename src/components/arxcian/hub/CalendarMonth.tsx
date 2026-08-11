import Link from 'next/link'
import { headers } from 'next/headers'
import { currentOwner } from '@/lib/session'
import { getCalendarStatus } from '@/lib/arxcian/personal/calendar/events'
import { CALENDAR_DISCONNECTED } from '@/lib/arxcian/personal/calendar/types'
import { Panel } from '@/components/arxcian/Panel'

function requestOrigin(): string {
  const h = headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

const TZ = 'Europe/Helsinki'
const WEEKDAYS = ['MA', 'TI', 'KE', 'TO', 'PE', 'LA', 'SU']

/** YYYY-MM-DD Helsingin aikavyöhykkeellä. Sama kuvio kuin time.ts:n apureissa. */
function isoInHelsinki(ms: number): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: TZ,
  }).format(new Date(ms))
  return parts
}

/**
 * Kuukausiruudukko: viikko alkaa maanantaista, ja päivä jossa on tapahtumia
 * saa pisteen alleen.
 *
 * Ruudukko rakennetaan aina täysinä viikkoina, joten edellisen ja seuraavan
 * kuukauden reunapäivät ovat mukana himmennettyinä — muuten rivit
 * hyppisivät kuukauden vaihtuessa eikä sarakkeen leveys pysyisi vakiona.
 *
 * getDay() palauttaa sunnuntaille 0, joten maanantaialkuinen viikko vaatii
 * siirron (day + 6) % 7. Tämä on se kohta joka menee helposti väärin.
 */
function buildMonth(now: Date) {
  const year = now.getFullYear()
  const month = now.getMonth()

  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7

  const start = new Date(year, month, 1 - lead)

  const cells: { date: Date; inMonth: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    cells.push({ date, inMonth: date.getMonth() === month })
  }

  // Kuudes rivi näytetään vain jos kuukausi todella ulottuu sinne.
  const used = cells.slice(0, 35).some(c => c.inMonth && c.date.getDate() > 22) && cells[35].inMonth
  return { cells: used ? cells : cells.slice(0, 35), label: first }
}

export async function CalendarMonth({ delay }: { delay?: number }) {
  const owner = await currentOwner()
  const status = owner ? await getCalendarStatus(owner, requestOrigin()) : CALENDAR_DISCONNECTED

  const now = new Date()
  const { cells, label } = buildMonth(now)
  const todayIso = isoInHelsinki(now.getTime())

  // Päivät joilla on tapahtumia. Kalenterin ollessa irti joukko on tyhjä ja
  // ruudukko näkyy silti — kuukausinäkymä on hyödyllinen ilmankin.
  const busy = new Set<string>()
  if (status.state === 'connected') {
    for (const event of status.events) busy.add(isoInHelsinki(event.start))
  }

  const monthLabel = label
    .toLocaleDateString('fi-FI', { month: 'long', year: 'numeric' })
    .toUpperCase()

  return (
    <Panel title="Kalenteri" delay={delay}>
      <div className="mb-3 text-center font-mono text-[11px] tracking-[0.14em] text-ax-dim">
        {monthLabel}
      </div>

      <div className="mb-2 grid grid-cols-7 text-center font-mono text-[8px] tracking-wider text-ax-faint">
        {WEEKDAYS.map(d => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1.5 text-center text-[10px]">
        {cells.map(({ date, inMonth }) => {
          const iso = isoInHelsinki(date.getTime())
          const isToday = iso === todayIso
          const hasEvents = busy.has(iso)

          return (
            <div key={iso} className="flex flex-col items-center gap-0.5">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full tabular-nums ${
                  isToday
                    ? 'bg-ax-accent font-medium text-white shadow-[0_0_12px_rgb(var(--ax-accent)/0.55)]'
                    : inMonth
                      ? 'text-ax-dim'
                      : 'text-ax-faint/40'
                }`}
              >
                {date.getDate()}
              </span>
              <span
                aria-hidden="true"
                className={`h-1 w-1 rounded-full ${
                  hasEvents && !isToday ? 'bg-ax-accent/70' : 'bg-transparent'
                }`}
              />
            </div>
          )
        })}
      </div>

      <Link
        href="/arxcian/personal"
        className="mt-3 inline-block text-[11px] text-ax-faint transition-colors hover:text-ax-accent"
      >
        Koko kalenteri →
      </Link>
    </Panel>
  )
}
