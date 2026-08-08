import Link from 'next/link'
import { currentOwner } from '@/lib/session'
import { SECTIONS } from '@/lib/arxcian/nav'
import { SectionIcon } from '@/components/arxcian/icons'
import { AlertsSummary } from '@/components/arxcian/hub/AlertsSummary'
import { NewsDigest } from '@/components/arxcian/hub/NewsDigest'
import { MarketSnapshot } from '@/components/arxcian/hub/MarketSnapshot'
import { UpcomingEvents } from '@/components/arxcian/hub/UpcomingEvents'
import { DailyFocus } from '@/components/arxcian/hub/DailyFocus'
import { Globe } from '@/components/arxcian/globe/Globe'
import { worldLayer, marketsLayer } from '@/lib/arxcian/globe/layers'
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

  // Kerrokset kootaan palvelimella olemassa olevasta välimuistista — maapallo
  // ei koskaan hae dataa itse.
  const layers = [worldLayer(), await marketsLayer()]

  return (
    <div className="mx-auto max-w-[1600px]">
      <header className="ax-rise pb-5 pt-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ax-faint">{date}</p>
        <h1 className="mt-1.5 text-2xl font-light tracking-tight text-ax-text sm:text-3xl">
          {greeting(hour)}, <span className="font-medium">{name}</span>
        </h1>
        <DailyFocus />
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

      {/*
        Komentokeskus: maapallo keskellä, paneelit molemmin puolin.
        DOM-järjestys on maapallo → vasen → oikea, jotta kapealla näytöllä
        pallo tulee ensin; leveällä se asetetaan nimenomaisesti keskisarakkeeseen.
      */}
      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(420px,560px)_minmax(0,1fr)] xl:items-start">
        <div className="relative xl:col-start-2 xl:row-start-1">
          {/* Ilmakehän hehku pallon takana */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-[12%] rounded-full bg-ax-accent/20 blur-[100px]"
          />
          <Globe layers={layers} className="relative mx-auto w-full max-w-[560px]" />
        </div>

        <div className="grid content-start gap-3 xl:col-start-1 xl:row-start-1">
          <NewsDigest delay={0.16} />
          <UpcomingEvents delay={0.2} />
          <GoalsProgress delay={0.24} />
        </div>

        <div className="grid content-start gap-3 xl:col-start-3 xl:row-start-1">
          <MarketSnapshot delay={0.28} />
          <AlertsSummary delay={0.32} />
          <QuickActions delay={0.36} />
        </div>
      </div>
    </div>
  )
}
