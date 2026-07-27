import { getQuotes } from '@/lib/arxcian/trading/quotes'
import { WATCHLIST } from '@/lib/arxcian/trading/symbols'
import { Panel } from '@/components/arxcian/Panel'

function fmtPrice(n: number): string {
  const decimals = n >= 1000 ? 2 : n >= 1 ? 4 : 6
  return n.toLocaleString('fi-FI', { minimumFractionDigits: decimals > 4 ? 2 : decimals, maximumFractionDigits: decimals })
}

export async function WatchlistTable() {
  const cached = await getQuotes()
  const quotes = cached?.data.quotes ?? {}
  const fetchedAt = cached?.data.fetchedAt

  return (
    <Panel
      title="Watchlist"
      meta={fetchedAt ? new Date(fetchedAt).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }) : 'Yahoo Finance'}
    >
      {!cached ? (
        <p className="py-6 text-center text-[13px] text-ax-faint">
          Ei vielä dataa — ensimmäinen haku ajetaan seuraavassa ajastetussa ajossa.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-ax-faint">
                <th className="pb-2 pr-3 font-normal">Symboli</th>
                <th className="pb-2 pr-3 text-right font-normal">Hinta</th>
                <th className="pb-2 text-right font-normal">Muutos</th>
              </tr>
            </thead>
            <tbody>
              {WATCHLIST.map(sym => {
                const q = quotes[sym.quoteSymbol]
                const up = q && q.change >= 0
                return (
                  <tr key={sym.quoteSymbol} className="border-t border-ax-line/60">
                    <td className="py-1.5 pr-3 text-ax-text">{sym.label}</td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-ax-text">
                      {q ? fmtPrice(q.price) : '—'}
                    </td>
                    <td className={`py-1.5 text-right font-mono tabular-nums ${!q ? 'text-ax-faint' : up ? 'text-ax-up' : 'text-ax-down'}`}>
                      {q ? `${up ? '+' : ''}${q.changePercent.toFixed(2)}%` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-ax-faint">
            Data Yahoo Financen dokumentoimattomasta rajapinnasta — ei virallista tukea eikä SLA:ta.
          </p>
        </div>
      )}
    </Panel>
  )
}
