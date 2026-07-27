import { currentOwner } from '@/lib/session'
import { getAlerts } from '@/lib/arxcian/trading/alerts'
import { SentimentGauge } from '@/components/arxcian/trading/SentimentGauge'
import { IctFeed } from '@/components/arxcian/trading/IctFeed'
import { AlertsPanel } from '@/components/arxcian/trading/AlertsPanel'
import { ChartPanel } from '@/components/arxcian/trading/ChartPanel'
import { WatchlistTable } from '@/components/arxcian/trading/WatchlistTable'

export const metadata = { title: 'Trading · arxcian' }
export const dynamic = 'force-dynamic'

export default async function TradingPage() {
  await currentOwner()
  const alerts = await getAlerts()

  return (
    <div className="mx-auto max-w-6xl">
      <header className="ax-rise pb-6 pt-2">
        <h1 className="text-2xl font-light tracking-tight text-ax-text">Trading</h1>
        <p className="mt-1 text-[13px] text-ax-dim">Markkinat, watchlist ja ICT</p>
      </header>

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
