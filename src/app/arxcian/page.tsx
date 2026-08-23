import { Suspense } from 'react'
import { currentOwner } from '@/lib/session'
import { MarketSnapshot } from '@/components/arxcian/hub/MarketSnapshot'
import { Globe } from '@/components/arxcian/globe/Globe'
import { hubData } from '@/lib/arxcian/globe/data'
import { QuickActions } from '@/components/arxcian/hub/QuickActions'
import { GlobeFrame } from '@/components/arxcian/hub/GlobeFrame'
import { HudClock } from '@/components/arxcian/hub/HudClock'
import { AssistantBar } from '@/components/arxcian/hub/AssistantBar'
import { SynapseField } from '@/components/arxcian/SynapseField'
import { TodayFocus } from '@/components/arxcian/hub/TodayFocus'
import { TodoPanel } from '@/components/arxcian/hub/TodoPanel'
import { CalendarMonth } from '@/components/arxcian/hub/CalendarMonth'
import { Channels } from '@/components/arxcian/hub/Channels'
import { WatchInbox } from '@/components/arxcian/hub/WatchInbox'
import { RjMobSummary } from '@/components/arxcian/hub/RjMobSummary'
import { MarketSessions } from '@/components/arxcian/hub/MarketSessions'
import { SunWeather } from '@/components/arxcian/hub/SunWeather'
import { PrayerTimes } from '@/components/arxcian/hub/PrayerTimes'
import { PanelSkeleton } from '@/components/arxcian/PanelSkeleton'

export const dynamic = 'force-dynamic'

export default async function ArxcianHub() {
  const user = await currentOwner()
  const name = user ? user[0].toUpperCase() + user.slice(1) : ''

  // Maapallon data kootaan palvelimella olemassa olevasta välimuistista —
  // maapallo ei koskaan hae dataa itse.
  const globe = await hubData()

  // Yksi kello koko renderöinnille, jotta istuntopaneelin lähtölaskenta alkaa
  // palvelimella samasta hetkestä johon selain jatkaa.
  const now = Date.now()

  return (
    <div className="relative mx-auto max-w-[1920px]">
      {/* Synapsikenttä on fixed ja -z-10, joten se jää koko näkymän taakse
          eikä vain tämän elementin. Sivun oma gradienttitausta tulee
          globals.css:n .arxcian-root -säännöstä sen alta. */}
      <SynapseField />

      {/*
        Ylärivi kolmessa osassa: kello vasemmalla, tervehdys keskellä,
        järjestelmän tila oikealla. Tervehdys on absoluuttisesti keskitetty
        koko riviin nähden eikä keskisarakkeeseen, jotta se osuu maapallon
        kohdalle myös kun reunimmaiset panelit ovat eri levyisiä.
      */}
      {/*
        Kolme yhtä leveää saraketta (1fr auto 1fr) eikä absoluuttista
        keskitystä: reunimmaiset paneelit ovat eri levyisiä, mutta yhtä suuret
        1fr-sarakkeet pitävät keskimmäisen silti rivin keskellä. Absoluuttinen
        keskitys näytti työpöydällä samalta, mutta mobiilissa reunapaneelit
        piiloutuvat, otsikkorivin korkeus romahti nollaan ja tervehdys valui
        maapallon päälle.
      */}
      <header className="mb-3 grid grid-cols-[1fr_auto_1fr] items-start gap-3 pt-1">
        <div className="ax-rise ax-glass hidden w-[250px] rounded-2xl p-4 md:block">
          <HudClock />
        </div>

        <div className="col-start-2 text-center">
          <p className="text-[13px] font-light text-ax-dim">Tervetuloa takaisin,</p>
          <h1 className="text-3xl font-light tracking-wide text-ax-text">
            {name}
            <span className="ml-1 text-ax-accent">_</span>
          </h1>
        </div>

        <div className="ax-rise ax-glass ml-auto hidden w-[170px] rounded-2xl px-4 py-3 text-right lg:block">
          <p className="font-mono text-[9px] uppercase tracking-widest text-ax-faint">
            System status
          </p>
          <p className="mt-1 flex items-center justify-end gap-2 font-mono text-[10px] uppercase text-ax-accent">
            Online
            <span className="ax-pulse h-2 w-2 rounded-full bg-ax-up shadow-[0_0_12px_rgb(var(--ax-up)/0.8)]" />
          </p>
        </div>
      </header>

      {/*
        Komentokeskus: maapallo keskellä, paneelit molemmin puolin.
        DOM-järjestys on maapallo → vasen → oikea, jotta kapealla näytöllä
        pallo tulee ensin; leveällä se asetetaan nimenomaisesti keskisarakkeeseen.
      */}
      <div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)_320px] xl:items-start">
        {/* Rukousajat ovat samassa keskisarakkeessa maapallon alla eivätkä
            reunapaneelien joukossa: vaakarivi viidestä kellonajasta on kartan
            levyisenä luettava, kapeassa sarakkeessa se murtuisi. */}
        <div className="grid content-start gap-3 xl:col-start-2 xl:row-start-1">
          <div className="relative">
            {/* Ei erillistä hehkukerrosta pallon takana — ilmakehän hohto tulee
                kohtauksen omasta shaderista, jolloin valo osuu siluettiin eikä
                jää leijumaan pallon ympärille sumeana kehänä. GlobeFrame lisää
                vain HUD-renkaat ja projektorin, ei toista hehkua pallon päälle. */}
            <GlobeFrame>
              <Globe data={globe} className="h-full w-full" />
            </GlobeFrame>
          </div>
          <div className="mx-auto w-full max-w-[520px] xl:max-w-[820px]">
            <Suspense fallback={<PanelSkeleton title="Rukousajat" delay={0.18} />}>
              <PrayerTimes delay={0.18} />
            </Suspense>
          </div>
        </div>

        <div className="grid content-start gap-3 xl:col-start-1 xl:row-start-1">
          <Suspense fallback={<PanelSkeleton title="Tänään" delay={0.12} />}>
            <TodayFocus delay={0.12} />
          </Suspense>
          <Suspense fallback={<PanelSkeleton title="Sää & aurinko" delay={0.16} />}>
            <SunWeather delay={0.16} />
          </Suspense>
          <Suspense fallback={<PanelSkeleton title="RJ-Mob" delay={0.2} />}>
            <RjMobSummary delay={0.2} />
          </Suspense>
          <Suspense fallback={<PanelSkeleton title="Kanavat" delay={0.24} />}>
            <Channels delay={0.24} />
          </Suspense>
          <Suspense fallback={<PanelSkeleton title="Uutta" delay={0.28} />}>
            <WatchInbox delay={0.28} />
          </Suspense>
        </div>

        <div className="grid content-start gap-3 xl:col-start-3 xl:row-start-1">
          <Suspense fallback={<PanelSkeleton title="Markkinat" delay={0.24} />}>
            <MarketSnapshot delay={0.24} />
          </Suspense>
          {/* Istunnot heti kurssien alle: molemmat vastaavat markkinaa
              koskevaan kysymykseen, ja "onko Lontoo auki" on se joka
              ratkaisee kannattaako kursseja edes katsoa juuri nyt. */}
          <MarketSessions now={now} delay={0.28} />
          <Suspense fallback={<PanelSkeleton title="Kalenteri" delay={0.32} />}>
            <CalendarMonth delay={0.32} />
          </Suspense>
          <Suspense fallback={<PanelSkeleton title="To-do" delay={0.36} />}>
            <TodoPanel delay={0.36} />
          </Suspense>
          <QuickActions delay={0.4} />
        </div>
      </div>

      {/* Palkki on fixed, joten se ei kuulu yllä olevaan ruudukkoon. Tilaa
          sen alle jää viimeisen paneelin jälkeen tästä paddingista. */}
      <div className="h-28" aria-hidden="true" />
      <AssistantBar name={name} />
    </div>
  )
}
