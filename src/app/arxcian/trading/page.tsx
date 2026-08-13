import { currentOwner } from '@/lib/session'
import { getAlerts } from '@/lib/arxcian/trading/alerts'
import { getCalendar, highImpactEvents } from '@/lib/arxcian/trading/calendar'
import { SentimentGauge } from '@/components/arxcian/trading/SentimentGauge'
import { IctFeed } from '@/components/arxcian/trading/IctFeed'
import { AlertsPanel } from '@/components/arxcian/trading/AlertsPanel'
import { EconomicCalendar } from '@/components/arxcian/trading/EconomicCalendar'
import { MarketSessions } from '@/components/arxcian/trading/MarketSessions'
import { ChartPanel } from '@/components/arxcian/trading/ChartPanel'
import { WatchlistTable } from '@/components/arxcian/trading/WatchlistTable'

export const metadata = { title: 'Trading · arxcian' }
export const dynamic = 'force-dynamic'

export default async function TradingPage() {
  await currentOwner()
  const [alerts, calendar] = await Promise.all([getAlerts(), getCalendar()])

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

      <AlertsPanel initialAlerts={alerts} />
    </div>
  )
}
