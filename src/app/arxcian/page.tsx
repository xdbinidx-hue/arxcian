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
import { hubData } from '@/lib/arxcian/globe/data'
import { GoalsProgress } from '@/components/arxcian/hub/GoalsProgress'
import { QuickActions } from '@/components/arxcian/hub/QuickActions'
import { GlobeFrame } from '@/components/arxcian/hub/GlobeFrame'
import { HudClock } from '@/components/arxcian/hub/HudClock'
import { AssistantBar } from '@/components/arxcian/hub/AssistantBar'
import { SynapseField } from '@/components/arxcian/SynapseField'

export const dynamic = 'force-dynamic'

const TZ = 'Europe/Helsinki'

function helsinki(now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat('fi-FI', { hour: 'numeric', hour12: false, timeZone: TZ }).format(now),
  )
  return { hour }
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
  const { hour } = helsinki(new Date())

  // Maapallon data kootaan palvelimella olemassa olevasta välimuistista —
  // maapallo ei koskaan hae dataa itse.
  const globe = await hubData()

  return (
    <div className="relative mx-auto max-w-[1920px]">
      {/* Synapsikenttä on fixed ja -z-10, joten se jää koko näkymän taakse
          eikä vain tämän elementin. Sivun oma gradienttitausta tulee
          globals.css:n .arxcian-root -säännöstä sen alta. */}
      <SynapseField />

      {/*
        Ylärivi kolmessa osassa: kello vasemmalla, tervehdys keskellä,
        järjestelmän tila oikealla. Reunimmaiset piiloutuvat kapealla
        näytöllä, jolloin tervehdys jää keskelle yksin.
      */}
      <header className="mb-4 grid grid-cols-[1fr_auto_1fr] items-start gap-3 pt-2">
        <div className="hidden md:block">
          <div className="ax-rise ax-glass w-[250px] rounded-2xl p-4">
            <HudClock />
          </div>
        </div>

        <div className="col-start-2 text-center">
          <p className="text-[13px] font-light text-ax-dim">{greeting(hour)},</p>
          <h1 className="text-3xl font-light tracking-wide text-ax-text">
            {name}
            <span className="ml-2 text-ax-accent">_</span>
          </h1>
        </div>

        <div className="hidden justify-end lg:flex">
          <div className="ax-rise ax-glass w-[170px] rounded-2xl px-4 py-3 text-right">
            <p className="font-mono text-[9px] uppercase tracking-widest text-ax-faint">
              System status
            </p>
            <p className="mt-1 flex items-center justify-end gap-2 font-mono text-[10px] uppercase text-ax-accent">
              Online
              <span className="ax-pulse h-2 w-2 rounded-full bg-ax-up shadow-[0_0_12px_rgb(var(--ax-up)/0.8)]" />
            </p>
          </div>
        </div>
      </header>

      <DailyFocus />

      {/* Neljä pääosiota */}
      <nav aria-label="Pääosiot" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SECTIONS.map((section, i) => (
          <Link
            key={section.id}
            href={section.href}
            className="ax-rise ax-glass ax-glass-hover group relative overflow-hidden rounded-2xl p-4 transition-colors"
            style={{ animationDelay: `${0.04 * i}s` }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ax-accent/45 to-transparent"
            />
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
      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,300px)_minmax(560px,1fr)_minmax(0,320px)] xl:items-start">
        <div className="relative xl:col-start-2 xl:row-start-1">
          {/* Ei erillistä hehkukerrosta pallon takana — ilmakehän hohto tulee
              kohtauksen omasta shaderista, jolloin valo osuu siluettiin eikä
              jää leijumaan pallon ympärille sumeana kehänä. GlobeFrame lisää
              vain HUD-renkaat ja projektorin, ei toista hehkua pallon päälle. */}
          <GlobeFrame>
            <Globe data={globe} className="h-full w-full" />
          </GlobeFrame>
        </div>

        <div className="grid content-start gap-3 xl:col-start-1 xl:row-start-1">
          <GoalsProgress delay={0.16} />
          <NewsDigest delay={0.2} />
        </div>

        <div className="grid content-start gap-3 xl:col-start-3 xl:row-start-1">
          <MarketSnapshot delay={0.24} />
          <UpcomingEvents delay={0.28} />
          <AlertsSummary delay={0.32} />
          <QuickActions delay={0.36} />
        </div>
      </div>

      {/* Palkki on fixed, joten se ei kuulu yllä olevaan ruudukkoon. Tilaa
          sen alle jää viimeisen paneelin jälkeen tästä paddingista. */}
      <div className="h-24" aria-hidden="true" />
      <AssistantBar name={name} />
    </div>
  )
}
