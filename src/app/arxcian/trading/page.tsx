import { redirect } from 'next/navigation'
import { currentOwner } from '@/lib/session'
import { getNotifySettings, getTradingTimes } from '@/lib/arxcian/trading/notifyStore'
import { getAlerts } from '@/lib/arxcian/trading/alerts'
import { getCalendar, highImpactEvents } from '@/lib/arxcian/trading/calendar'
import { SentimentGauge } from '@/components/arxcian/trading/SentimentGauge'
import { IctFeed } from '@/components/arxcian/trading/IctFeed'
import { AlertsPanel } from '@/components/arxcian/trading/AlertsPanel'
import { EconomicCalendar } from '@/components/arxcian/trading/EconomicCalendar'
import { MarketSessions } from '@/components/arxcian/trading/MarketSessions'
import { ChartPanel } from '@/components/arxcian/trading/ChartPanel'
import { WatchlistTable } from '@/components/arxcian/trading/WatchlistTable'
import { MarketAlertsSettings } from '@/components/arxcian/trading/MarketAlertsSettings'
import { PushDevices } from '@/components/arxcian/trading/PushDevices'

export const metadata = { title: 'Trading · arxcian' }
export const dynamic = 'force-dynamic'

export default async function TradingPage() {
  // Käyttäjä tarvitaan tällä sivulla: uusi treidausaika tallennetaan hänen
  // omakseen. Layout on jo ohjannut kirjautumattoman pois, joten tämä on
  // kaventamista varten eikä toinen suojaus.
  const user = await currentOwner()
  if (!user) redirect('/login')
  const [alerts, calendar, notifySettings, tradingTimes] = await Promise.all([
    getAlerts(),
    getCalendar(),
    getNotifySettings(user),
    getTradingTimes(user),
  ])

  // Yksi kello koko renderöinnille: suodatus ja selaimen lähtölaskennan
  // aloitus katsovat samaa hetkeä, jolloin listalta ei putoa tapahtumaa
  // jonka lähtölaskenta on juuri renderöity.
  const now = Date.now()

  return (
    <div className="mx-auto max-w-6xl">
      <header className="ax-rise pb-6 pt-2">
        <h1 className="text-2xl font-light tracking-tight text-ax-text">Trading</h1>
        <p className="mt-1 text-[13px] text-ax-dim">Markkinat, watchlist ja ICT</p>
      </header>

      {/* Milloin-paneelit ensimmäisenä: hälytys jonka luo pitää vierittää ei
          ehdi vaikuttaa siihen mitä käyttäjä tekee ennen julkaisua. Kalenteri
          saa kaksi kolmasosaa, koska sen rivit ovat leveitä (aika, valuutta,
          nimi, ennuste); istunnoille riittää kapea sarake. */}
      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <EconomicCalendar
            events={calendar ? highImpactEvents(calendar.data, now) : []}
            now={now}
            fetchedAt={calendar?.fetchedAt ?? null}
          />
        </div>
        <MarketSessions now={now} />
      </div>

      <div className="mb-4">
        <ChartPanel />
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <SentimentGauge />
        <WatchlistTable />
      </div>

      <div className="mb-4">
        <IctFeed />
      </div>

      {/* Ilmoitusasetukset ja omat ajat kurssihälytysten viereen: molemmat
          vastaavat samaan kysymykseen "milloin minua herätetään", vaikka
          toinen katsoo hintaa ja toinen kelloa. */}
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <MarketAlertsSettings
          initialSettings={notifySettings}
          initialTimes={tradingTimes}
          user={user}
        />
        <PushDevices />
      </div>

      <AlertsPanel initialAlerts={alerts} />
    </div>
  )
}
