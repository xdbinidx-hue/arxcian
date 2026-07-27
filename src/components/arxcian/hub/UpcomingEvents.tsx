import Link from 'next/link'
import { headers } from 'next/headers'
import { currentOwner } from '@/lib/session'
import { getCalendarStatus, upcomingEvents } from '@/lib/arxcian/personal/calendar/events'
import { Panel } from '@/components/arxcian/Panel'

function requestOrigin(): string {
  const h = headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

function dayLabel(ms: number): string {
  const d = new Date(ms)
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  if (same(d, today)) return 'tänään'
  if (same(d, tomorrow)) return 'huomenna'
  return d.toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' })
}

/** Seuraavat kalenteritapahtumat hubin pikanäkymään. */
export async function UpcomingEvents({ delay }: { delay?: number }) {
  const owner = await currentOwner()
  const status = owner
    ? await getCalendarStatus(owner, requestOrigin())
    : ({ state: 'disconnected' } as const)

  if (status.state !== 'connected') {
    const empty =
      status.state === 'not-configured'
        ? 'Google-tunnukset puuttuvat ympäristömuuttujista.'
        : status.state === 'error'
          ? `Kalenterin haku epäonnistui: ${status.message}`
          : 'Kalenteria ei ole yhdistetty — liitä se Personal-osiossa.'

    return <Panel title="Seuraavat tapahtumat" meta="Google Calendar" delay={delay} empty={empty} />
  }

  const events = upcomingEvents(status.events, 5)

  return (
    <Panel
      title="Seuraavat tapahtumat"
      meta="Google Calendar"
      delay={delay}
      empty="Ei tulevia tapahtumia."
    >
      {events.length > 0 ? (
        <>
          <ul className="space-y-2.5">
            {events.map(e => (
              <li key={e.id} className="flex items-baseline gap-3">
                <span className="w-24 shrink-0 font-mono text-[11px] text-ax-dim">
                  {dayLabel(e.start)}
                  {!e.allDay && ` ${new Date(e.start).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}`}
                </span>
                <span className="flex-1 text-[13px] leading-snug text-ax-text">{e.title}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/arxcian/personal"
            className="mt-3 inline-block text-[11px] text-ax-faint transition-colors hover:text-ax-accent"
          >
            Koko kalenteri →
          </Link>
        </>
      ) : null}
    </Panel>
  )
}
