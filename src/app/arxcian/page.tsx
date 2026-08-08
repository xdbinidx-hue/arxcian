import Link from 'next/link'
import { currentOwner } from '@/lib/session'
import { SECTIONS } from '@/lib/arxcian/nav'
import { SectionIcon } from '@/components/arxcian/icons'
import { AlertsSummary } from '@/components/arxcian/hub/AlertsSummary'
import { NewsDigest } from '@/components/arxcian/hub/NewsDigest'
import { MarketSnapshot } from '@/components/arxcian/hub/MarketSnapshot'
import { UpcomingEvents } from '@/components/arxcian/hub/UpcomingEvents'
import { DailyFocus } from '@/components/arxcian/hub/DailyFocus'
import { Globe } from '@/components/arxcian/hub/Globe'
import { GoalsProgress } from '@/components/arxcian/hub/GoalsProgress'
import { QuickActions } from '@/components/arxcian/hub/QuickActions'

export const dynamic = 'force-dynamic'

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
      <header className="ax-rise grid items-center gap-4 pb-6 pt-2 lg:grid-cols-[1fr_320px] lg:gap-8">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ax-faint">{date}</p>
          <h1 className="mt-1.5 text-2xl font-light tracking-tight text-ax-text sm:text-3xl">
            {greeting(hour)}, <span className="font-medium">{name}</span>
          </h1>
          <DailyFocus />
        </div>

        <div className="relative mx-auto w-52 sm:w-60 lg:w-[320px]">
          {/* Pehmeä ilmakehän hehku pallon takana */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full bg-ax-accent/15 blur-[70px]"
          />
          <Globe className="relative" />
        </div>
      </header>

      {/* Neljä pääosiota */}
      <nav aria-label="Pääosiot" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SECTIONS.map((section, i) => (
          <Link
            key={section.id}
            href={section.href}
            className="ax-rise group rounded-2xl border border-ax-line bg-ax-panel/70 p-4 transition-colors hover:border-ax-line-strong hover:bg-ax-panel-hi"
            style={{ animationDelay: `${0.04 * i}s` }}
          >
            <SectionIcon
              id={section.id}
              className="h-5 w-5 text-ax-accent transition-transform group-hover:scale-110"
            />
            <h2 className="mt-3 text-[15px] font-medium text-ax-text">{section.label}</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-ax-faint">{section.description}</p>
          </Link>
        ))}
      </nav>

      {/* Pikanäkymä */}
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <NewsDigest delay={0.16} />
        <UpcomingEvents delay={0.2} />
        <MarketSnapshot delay={0.24} />
        <GoalsProgress delay={0.28} />
        <AlertsSummary delay={0.32} />
        <QuickActions delay={0.36} />
      </div>
    </div>
  )
}
