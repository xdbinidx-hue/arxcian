import Link from 'next/link'
import { getQuotes } from '@/lib/arxcian/trading/quotes'
import { HUB_SYMBOLS } from '@/lib/arxcian/trading/symbols'
import { panelFetchState } from '@/lib/arxcian/panelStatus'
import { UI_REFRESH_JOBS } from '@/lib/arxcian/cronAccess'
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
  // Kurssien oma fetchedAt on kurssidatan sisällä eikä välimuistin
  // kirjekuoressa, joten se annetaan varaksi nimenomaisesti.
  const status = await panelFetchState('trading:quotes', cached?.data.fetchedAt)

  // Ei lähdenimeä metassa: hakuaika ja nappi täyttävät otsikkorivin 320 px:n
  // sarakkeessa, ja "Yahoo Finance" työnsi rivin kahdelle riville. Aika on se
  // tieto jota tästä paneelista haetaan; lähde lukee Trading-osiossa.
  return (
    <Panel
      title="Markkinat"
      refresh={{ job: UI_REFRESH_JOBS.markkinat, state: status }}
      delay={delay}
      empty={cached ? undefined : 'Ei vielä kursseja — haetaan seuraavassa ajastetussa ajossa.'}
    >
      {cached ? (
        <>
          {/* Rivimuoto sarakkeiden sijaan: nimi vasemmalle, kurssi ja muutos
              oikeaan reunaan tasattuina. Silmä lukee muutosprosentit yhtenä
              pystyrivinä, mikä on hubissa se mitä niistä halutaan — ei
              yksittäisen instrumentin tarkka arvo. */}
          <div className="divide-y divide-ax-line/10">
            {HUB_SYMBOLS.map(sym => {
              const q = quotes[sym.quoteSymbol]
              const up = q && q.change >= 0
              return (
                <div
                  key={sym.quoteSymbol}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-2.5"
                >
                  <span className="truncate text-[11px] uppercase tracking-wider text-ax-dim">
                    {sym.label}
                  </span>
                  <span className="font-mono text-[12px] tabular-nums text-ax-text">
                    {q ? fmtPrice(q.price) : '—'}
                  </span>
                  <span
                    className={`w-[54px] text-right font-mono text-[12px] tabular-nums ${
                      !q ? 'text-ax-faint' : up ? 'text-ax-up' : 'text-ax-down'
                    }`}
                  >
                    {q ? `${up ? '+' : ''}${q.changePercent.toFixed(2)}%` : '—'}
                  </span>
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
