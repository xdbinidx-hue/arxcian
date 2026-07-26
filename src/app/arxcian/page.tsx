import Link from 'next/link'
import { currentOwner } from '@/lib/session'
import { SECTIONS } from '@/lib/arxcian/nav'
import { SectionIcon } from '@/components/arxcian/icons'
import { Panel } from '@/components/arxcian/Panel'

const TZ = 'Europe/Helsinki'

function helsinki(now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat('fi-FI', { hour: 'numeric', hour12: false, timeZone: TZ }).format(now),
  )
  const date = new Intl.DateTimeFormat('fi-FI', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TZ,
  }).format(now)
  return { hour, date }
}

function greeting(hour: number) {
  if (hour < 5) return 'Hyvää yötä'
  if (hour < 10) return 'Hyvää huomenta'
  if (hour < 17) return 'Hyvää päivää'
  return 'Hyvää iltaa'
}

export default async function ArxcianHub() {
  const user = await currentOwner()
  const name = user ? user[0].toUpperCase() + user.slice(1) : ''
  const { hour, date } = helsinki(new Date())

  return (
    <div className="mx-auto max-w-6xl">
      <header className="ax-rise pb-6 pt-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ax-faint">{date}</p>
        <h1 className="mt-1.5 text-2xl font-light tracking-tight text-ax-text sm:text-3xl">
          {greeting(hour)}, <span className="font-medium">{name}</span>
        </h1>
      </header>

      {/* Neljä pääosiota */}
      <nav aria-label="Pääosiot" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SECTIONS.map((section, i) => (
          <Link
            key={section.id}
            href={section.href}
            className="ax-rise group rounded-lg border border-ax-line bg-ax-panel/70 p-4 transition-colors hover:border-ax-line-strong hover:bg-ax-panel-hi"
            style={{ animationDelay: `${0.04 * i}s` }}
          >
            <div className="flex items-start justify-between">
              <SectionIcon
                id={section.id}
                className="h-5 w-5 text-ax-accent transition-transform group-hover:scale-110"
              />
              {section.vaihe !== null && (
                <span className="rounded border border-ax-line px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ax-faint">
                  vaihe {section.vaihe}
                </span>
              )}
            </div>
            <h2 className="mt-3 text-[15px] font-medium text-ax-text">{section.label}</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-ax-faint">{section.description}</p>
          </Link>
        ))}
      </nav>

      {/* Pikanäkymä */}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Panel
          title="Hälytykset"
          meta="vaihe 2"
          delay={0.16}
          empty="Hälytykset tulevat käyttöön Trading-osion myötä."
        />
        <Panel
          title="Päivän uutiskooste"
          meta="vaihe 1"
          delay={0.2}
          empty="Koosteet haetaan neljästi päivässä, kun uutislähteet on kytketty."
        />
        <Panel
          title="Seuraavat tapahtumat"
          meta="vaihe 3"
          delay={0.24}
          empty="Kalenteri synkronoidaan Google Calendarista Personal-osiossa."
        />
        <Panel
          title="Markkinatilanne"
          meta="vaihe 2"
          delay={0.28}
          empty="Watchlistin instrumentit näkyvät tässä markkinadatan kytkennän jälkeen."
        />
      </div>
    </div>
  )
}
