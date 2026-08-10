'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CALENDAR_VIEWS,
  CALENDAR_VIEW_LABELS,
  accountAccent,
  accountLabel,
  type CalendarAccountStatus,
  type CalendarStatus,
  type CalendarView,
} from '@/lib/arxcian/personal/calendar/types'
import { AgendaView, DayView, MonthView, WeekView, YearView, rangeLabel, shiftAnchor } from './views'

type Props = {
  status: CalendarStatus
  /** Osoiterivin ?kalenteri=-parametri callbackin jäljiltä */
  notice?: string
}

const NOTICES: Record<string, { text: string; tone: 'ok' | 'warn' }> = {
  yhdistetty: { text: 'Kalenteri yhdistetty.', tone: 'ok' },
  peruutettu: { text: 'Valtuutus peruutettiin.', tone: 'warn' },
  virhe: { text: 'Yhdistäminen epäonnistui. Yritä uudelleen.', tone: 'warn' },
  'ei-konfiguroitu': { text: 'Google-tunnukset puuttuvat ympäristömuuttujista.', tone: 'warn' },
}

/** Liitettyjen tilien lista: väri, nimi, tapahtumamäärä ja tilikohtainen poisto. */
function AccountList({
  accounts,
  onDisconnect,
  busyAccountId,
}: {
  accounts: CalendarAccountStatus[]
  onDisconnect: (accountId: string) => void
  busyAccountId: string | null
}) {
  return (
    <ul className="flex flex-1 flex-col gap-1.5">
      {accounts.map(account => {
        const accent = accountAccent(account.colorIndex)
        return (
          <li
            key={account.id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-ax-line px-2.5 py-1.5 text-[11px]"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent.solid }} />
            <span className="text-ax-text">{accountLabel(account)}</span>
            <span className="font-mono text-[10px] text-ax-faint">{account.eventCount} tapahtumaa</span>
            {account.stale && <span className="text-[10px] text-ax-warn">vanhentunutta dataa</span>}
            {account.state === 'reauth' && (
              <span className="flex items-center gap-1.5 text-[10px] text-ax-warn">
                valtuutus vanhentunut
                <a
                  href="/api/arxcian/personal/calendar/connect"
                  className="rounded border border-ax-line px-1.5 py-0.5 text-ax-accent transition-colors hover:bg-ax-accent/10"
                >
                  Liitä uudelleen
                </a>
              </span>
            )}
            {account.state === 'error' && account.message && (
              <span className="text-[10px] text-ax-faint">{account.message}</span>
            )}
            <button
              onClick={() => onDisconnect(account.id)}
              disabled={busyAccountId === account.id}
              className="ml-auto shrink-0 rounded border border-ax-line px-2 py-0.5 text-[10px] text-ax-faint hover:text-ax-down disabled:opacity-40"
            >
              Poista
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function CalendarPanel({ status, notice }: Props) {
  const [view, setView] = useState<CalendarView>('agenda')
  const [anchor, setAnchor] = useState(() => new Date())
  const [busy, setBusy] = useState(false)
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null)
  const router = useRouter()

  const disconnect = async () => {
    setBusy(true)
    try {
      await fetch('/api/arxcian/personal/calendar/disconnect', { method: 'POST' })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const disconnectAccount = async (accountId: string) => {
    setBusyAccountId(accountId)
    try {
      await fetch('/api/arxcian/personal/calendar/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })
      router.refresh()
    } finally {
      setBusyAccountId(null)
    }
  }

  const message = notice ? NOTICES[notice] : undefined

  const header = (right?: React.ReactNode) => (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ax-line px-4 py-2.5">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ax-dim">Kalenteri</h2>
      {right}
    </header>
  )

  if (status.state === 'not-configured') {
    return (
      <div className="ax-glass rounded-2xl">
        {header(<span className="font-mono text-[10px] uppercase text-ax-faint">Google Calendar</span>)}
        <p className="px-4 py-6 text-center text-[13px] text-ax-faint">
          Google-tunnukset puuttuvat. Lisää <code className="text-ax-dim">GOOGLE_OAUTH_CLIENT_ID</code> ja{' '}
          <code className="text-ax-dim">GOOGLE_OAUTH_CLIENT_SECRET</code> ympäristömuuttujiin.
        </p>
      </div>
    )
  }

  if (status.state === 'disconnected') {
    const { accounts } = status

    if (accounts.length === 0) {
      return (
        <div className="ax-glass rounded-2xl">
          {header(<span className="font-mono text-[10px] uppercase text-ax-faint">Google Calendar</span>)}
          <div className="px-4 py-6 text-center">
            {message && (
              <p className={`mb-3 text-[12px] ${message.tone === 'ok' ? 'text-ax-up' : 'text-ax-warn'}`}>
                {message.text}
              </p>
            )}
            <p className="mb-3 text-[13px] text-ax-faint">Kalenteria ei ole yhdistetty.</p>
            <a
              href="/api/arxcian/personal/calendar/connect"
              className="inline-block rounded-md bg-ax-accent/15 px-4 py-2 text-[12px] font-medium text-ax-accent transition-colors hover:bg-ax-accent/25"
            >
              Yhdistä Google-kalenteri
            </a>
          </div>
        </div>
      )
    }

    return (
      <div className="ax-glass rounded-2xl">
        {header(<span className="font-mono text-[10px] uppercase text-ax-faint">Google Calendar</span>)}
        <div className="px-4 py-4">
          {message && (
            <p className={`mb-3 text-[12px] ${message.tone === 'ok' ? 'text-ax-up' : 'text-ax-warn'}`}>
              {message.text}
            </p>
          )}
          <p className="mb-2 text-[12px] text-ax-faint">
            Liitetyt tilit vaativat uudelleenvaltuutuksen ennen kuin tapahtumat näkyvät.
          </p>
          <AccountList accounts={accounts} onDisconnect={disconnectAccount} busyAccountId={busyAccountId} />
          <a
            href="/api/arxcian/personal/calendar/connect"
            className="mt-3 inline-block rounded-md border border-ax-line px-3 py-1.5 text-[11px] text-ax-accent transition-colors hover:bg-ax-accent/10"
          >
            + Lisää tili
          </a>
        </div>
      </div>
    )
  }

  if (status.state === 'error') {
    return (
      <div className="ax-glass rounded-2xl">
        {header()}
        <p className="px-4 py-6 text-center text-[13px] text-ax-down">
          Kalenterin haku epäonnistui: {status.message}
        </p>
      </div>
    )
  }

  const { events, fetchedAt, accounts } = status
  const showAccounts = accounts.length > 1
  const viewProps = { events, anchor, showAccounts }

  return (
    <div className="ax-glass rounded-2xl">
      {header(
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-ax-faint">
            {new Date(fetchedAt).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {accounts.length > 1 && (
            <button
              onClick={disconnect}
              disabled={busy}
              className="rounded border border-ax-line px-2 py-0.5 text-[10px] text-ax-faint hover:text-ax-down disabled:opacity-40"
            >
              Katkaise kaikki
            </button>
          )}
        </div>,
      )}

      {accounts.length > 0 && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-ax-line px-4 py-2.5">
          <AccountList accounts={accounts} onDisconnect={disconnectAccount} busyAccountId={busyAccountId} />
          <a
            href="/api/arxcian/personal/calendar/connect"
            className="shrink-0 rounded-md border border-ax-line px-2.5 py-1 text-[10px] text-ax-accent transition-colors hover:bg-ax-accent/10"
          >
            + Lisää tili
          </a>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ax-line px-4 py-2">
        <div className="flex gap-1">
          {CALENDAR_VIEWS.map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                view === v ? 'bg-ax-panel-hi text-ax-accent' : 'text-ax-dim hover:text-ax-text'
              }`}
            >
              {CALENDAR_VIEW_LABELS[v]}
            </button>
          ))}
        </div>

        {view !== 'agenda' && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setAnchor(shiftAnchor(view, anchor, -1))}
              aria-label="Edellinen"
              className="rounded border border-ax-line px-2 py-0.5 text-[11px] text-ax-faint hover:text-ax-text"
            >
              ‹
            </button>
            <span className="min-w-[150px] text-center text-[11px] text-ax-dim">{rangeLabel(view, anchor)}</span>
            <button
              onClick={() => setAnchor(shiftAnchor(view, anchor, 1))}
              aria-label="Seuraava"
              className="rounded border border-ax-line px-2 py-0.5 text-[11px] text-ax-faint hover:text-ax-text"
            >
              ›
            </button>
            <button
              onClick={() => setAnchor(new Date())}
              className="rounded border border-ax-line px-2 py-0.5 text-[11px] text-ax-faint hover:text-ax-text"
            >
              Tänään
            </button>
          </div>
        )}
      </div>

      <div className="p-4">
        {message && (
          <p className={`mb-3 text-[12px] ${message.tone === 'ok' ? 'text-ax-up' : 'text-ax-warn'}`}>
            {message.text}
          </p>
        )}
        {view === 'agenda' && <AgendaView {...viewProps} />}
        {view === 'paiva' && <DayView {...viewProps} />}
        {view === 'viikko' && <WeekView {...viewProps} />}
        {view === 'kuukausi' && <MonthView {...viewProps} />}
        {view === 'vuosi' && <YearView {...viewProps} />}
      </div>
    </div>
  )
}
