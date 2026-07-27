import Link from 'next/link'
import { getQuotes } from '@/lib/arxcian/trading/quotes'
import { HUB_SYMBOLS } from '@/lib/arxcian/trading/symbols'
import { Panel } from '@/components/arxcian/Panel'

function fmtPrice(n: number): string {
  const decimals = n >= 1000 ? 2 : n >= 1 ? 4 : 6
  return n.toLocaleString('fi-FI', {
    minimumFractionDigits: decimals > 4 ? 2 : decimals,
    maximumFractionDigits: decimals,
  })
}

/** Kuusi makrosymbolia hubin etusivulle. Koko watchlist on Trading-osiossa. */
export async function MarketSnapshot({ delay }: { delay?: number }) {
  const cached = await getQuotes()
  const quotes = cached?.data.quotes ?? {}
  const fetchedAt = cached?.data.fetchedAt

  return (
    <Panel
      title="Markkinatilanne"
      meta={
        fetchedAt
          ? new Date(fetchedAt).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
          : 'Yahoo Finance'
      }
      delay={delay}
      empty={cached ? undefined : 'Ei vielä kursseja — haetaan seuraavassa ajastetussa ajossa.'}
    >
      {cached ? (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
            {HUB_SYMBOLS.map(sym => {
              const q = quotes[sym.quoteSymbol]
              const up = q && q.change >= 0
              return (
                <div key={sym.quoteSymbol}>
                  <p className="text-[10px] uppercase tracking-wider text-ax-faint">{sym.label}</p>
                  <p className="font-mono text-[13px] tabular-nums text-ax-text">
                    {q ? fmtPrice(q.price) : '—'}
                  </p>
                  <p
                    className={`font-mono text-[11px] tabular-nums ${
                      !q ? 'text-ax-faint' : up ? 'text-ax-up' : 'text-ax-down'
                    }`}
                  >
                    {q ? `${up ? '+' : ''}${q.changePercent.toFixed(2)}%` : '—'}
                  </p>
                </div>
              )
            })}
          </div>
          <Link
            href="/arxcian/trading"
            className="mt-3 inline-block text-[11px] text-ax-faint transition-colors hover:text-ax-accent"
          >
            Koko watchlist →
          </Link>
        </>
      ) : null}
    </Panel>
  )
}
