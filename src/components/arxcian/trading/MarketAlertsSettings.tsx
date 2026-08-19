'use client'

import { useEffect, useState } from 'react'
import { Panel } from '@/components/arxcian/Panel'
import { SESSIONS } from '@/lib/arxcian/trading/sessions'
import { tradingTimeOccurrences } from '@/lib/arxcian/trading/marketEvents'
import { countdown } from '@/lib/arxcian/time'
import { CALENDAR_CURRENCIES } from '@/lib/arxcian/trading/types'
import type { NotifySettings, TradingTime } from '@/lib/arxcian/trading/types'
import {
  notifyPermission,
  requestNotifyPermission,
  unlockChime,
  type NotifyPermission,
} from '@/lib/arxcian/notify'
import {
  MARKET_ALERTS_EVENT,
  MARKET_ALERTS_TEST_EVENT,
  type MarketAlertsUpdate,
} from './MarketAlerts'

type Props = {
  initialSettings: NotifySettings
  initialTimes: TradingTime[]
  /** Kirjautunut käyttäjä. Uusi aika on oletuksena hänen omansa. */
  user: string
}

/**
 * Vyöhykkeet joissa treidausaika voi olla.
 *
 * Lista on lyhyt eikä täydellinen IANA-valikoima: aika määritellään aina
 * suhteessa johonkin markkinaan, ja neljä vaihtoehtoa kattaa ne. Rajapinta
 * hyväksyy minkä tahansa kelvollisen vyöhykkeen, joten lista voi kasvaa
 * ilman että tallennettu data muuttuu.
 */
const ZONES = [
  { value: 'Europe/Helsinki', label: 'Suomen aika' },
  { value: 'America/New_York', label: 'New York' },
  { value: 'Europe/London', label: 'Lontoo' },
  { value: 'Asia/Tokyo', label: 'Tokio' },
]

const DAYS = [
  { iso: 1, label: 'ma' },
  { iso: 2, label: 'ti' },
  { iso: 3, label: 'ke' },
  { iso: 4, label: 'to' },
  { iso: 5, label: 'pe' },
  { iso: 6, label: 'la' },
  { iso: 7, label: 'su' },
]

const LEADS = [0, 1, 5, 15, 30, 60]

const WEEKDAYS = [1, 2, 3, 4, 5]

function minutesToHhmm(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}.${String(m).padStart(2, '0')}`
}

function hhmmToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

const inputClass =
  'rounded-md border border-ax-line bg-ax-panel-hi px-2.5 py-1.5 text-[12px] text-ax-text placeholder:text-ax-faint focus:border-ax-line-strong focus:outline-none'

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[rgb(var(--ax-accent))]"
      />
      <span className="min-w-0">
        <span className="block text-[12px] leading-snug text-ax-text">{label}</span>
        {hint && <span className="block text-[10px] leading-relaxed text-ax-faint">{hint}</span>}
      </span>
    </label>
  )
}

/**
 * Ilmoitusasetukset ja omat treidausajat.
 *
 * Molemmat samassa komponentissa vaikka ne ovat kaksi paneelia: ajastin
 * tarvitsee asetukset ja ajat yhtenä pakettina, ja kahteen komponenttiin
 * jaettuna kumpikin lähettäisi päivityksen vanhentuneella toisikolla.
 */
export function MarketAlertsSettings({ initialSettings, initialTimes, user }: Props) {
  const [settings, setSettings] = useState(initialSettings)
  const [times, setTimes] = useState(initialTimes)
  const [permission, setPermission] = useState<NotifyPermission>('default')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Lupatila luetaan vasta selaimessa: palvelimella `Notification` ei ole
  // olemassa, ja suora luku renderöinnissä tuottaisi hydraatioeron.
  useEffect(() => setPermission(notifyPermission()), [])

  const [label, setLabel] = useState('')
  const [clock, setClock] = useState('09:30')
  const [zone, setZone] = useState('America/New_York')
  const [days, setDays] = useState<number[]>(WEEKDAYS)
  const [leadMinutes, setLeadMinutes] = useState(0)
  const [shared, setShared] = useState(false)

  // Ajastin elää layoutissa, joten muutos kerrotaan ikkunatapahtumalla.
  // Vaihtoehto olisi sivun uudelleenlataus, mikä katkaisisi juuri sen
  // ajastimen jonka asetusta muutettiin.
  const broadcast = (update: MarketAlertsUpdate) => {
    window.dispatchEvent(new CustomEvent<MarketAlertsUpdate>(MARKET_ALERTS_EVENT, { detail: update }))
  }

  const patchSettings = async (patch: Partial<NotifySettings>) => {
    const optimistic = { ...settings, ...patch }
    setSettings(optimistic)
    broadcast({ settings: optimistic, times })

    try {
      const res = await fetch('/api/arxcian/trading/notify', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (data.settings) {
        setSettings(data.settings)
        broadcast({ settings: data.settings, times })
      }
    } catch {
      setError('Asetuksen tallennus epäonnistui.')
    }
  }

  const askPermission = async () => {
    // Ääni avataan samasta painalluksesta: selain päästää AudioContextin
    // käyntiin vain käyttäjän eleestä, eikä lupakyselyn jälkeinen hetki enää
    // kelpaa eleeksi.
    unlockChime()
    setPermission(await requestNotifyPermission())
  }

  const sendTest = () => {
    unlockChime()
    const at = Date.now()
    window.dispatchEvent(
      new CustomEvent(MARKET_ALERTS_TEST_EVENT, {
        detail: {
          key: `test:${at}`,
          kind: 'trading-time',
          sourceId: 'test',
          title: 'Testi-ilmoitus',
          body: 'Näin markkinailmoitus näyttää ja kuulostaa.',
          at,
          notifyAt: at,
        },
      }),
    )
  }

  const toggleSession = (id: string, on: boolean) => {
    const next = on ? [...settings.sessions, id] : settings.sessions.filter(s => s !== id)
    void patchSettings({ sessions: next })
  }

  const toggleCurrency = (currency: string, on: boolean) => {
    const next = on
      ? [...settings.calendarCurrencies, currency]
      : settings.calendarCurrencies.filter(c => c !== currency)
    void patchSettings({ calendarCurrencies: next })
  }

  const toggleDay = (iso: number) => {
    setDays(current =>
      current.includes(iso) ? current.filter(d => d !== iso) : [...current, iso].sort(),
    )
  }

  const addTime = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const minutes = hhmmToMinutes(clock)
    if (!label.trim()) return setError('Anna ajalle nimi.')
    if (minutes === null) return setError('Kellonaika on virheellinen.')
    if (days.length === 0) return setError('Valitse vähintään yksi viikonpäivä.')

    setBusy(true)
    try {
      const res = await fetch('/api/arxcian/trading/times', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          zone,
          minutes,
          days,
          leadMinutes,
          owner: shared ? 'shared' : user,
        }),
      })
      const data = await res.json()
      if (data.error) return setError(data.error)
      if (data.times) {
        setTimes(data.times)
        broadcast({ settings, times: data.times })
        setLabel('')
      }
    } catch {
      setError('Tallennus epäonnistui.')
    } finally {
      setBusy(false)
    }
  }

  const mutateTime = async (id: string, method: 'PATCH' | 'DELETE') => {
    try {
      const res = await fetch(`/api/arxcian/trading/times?id=${encodeURIComponent(id)}`, { method })
      const data = await res.json()
      if (data.times) {
        setTimes(data.times)
        broadcast({ settings, times: data.times })
      }
    } catch {
      setError('Muutos epäonnistui.')
    }
  }

  const permissionMeta =
    permission === 'granted'
      ? 'sallittu'
      : permission === 'denied'
        ? 'estetty'
        : permission === 'unsupported'
          ? 'ei tuettu'
          : 'kysymättä'

  return (
    <>
      <Panel title="Ilmoitukset" meta={permissionMeta}>
        {permission !== 'granted' && (
          <div className="mb-3 rounded-md border border-ax-line bg-ax-panel-hi/50 p-3">
            {permission === 'denied' ? (
              <p className="text-[11px] leading-relaxed text-ax-faint">
                Selain estää ilmoitukset. Salli ne selaimen sivukohtaisista asetuksista — banneri ja
                äänimerkki toimivat siitä huolimatta.
              </p>
            ) : permission === 'unsupported' ? (
              <p className="text-[11px] leading-relaxed text-ax-faint">
                Tämä selain ei tue ilmoituksia. iPhonella ne vaativat arxcianin asentamisen
                kotiruudulle. Banneri ja äänimerkki toimivat silti.
              </p>
            ) : (
              <button
                onClick={askPermission}
                className="rounded-md bg-ax-accent/15 px-3 py-1.5 text-[12px] font-medium text-ax-accent transition-colors hover:bg-ax-accent/25"
              >
                Salli ilmoitukset
              </button>
            )}
          </div>
        )}

        <div className="space-y-0.5">
          <Toggle
            checked={settings.push}
            onChange={v => patchSettings({ push: v })}
            label="Selainilmoitus"
          />
          <Toggle
            checked={settings.banner}
            onChange={v => patchSettings({ banner: v })}
            label="Banneri sovelluksessa"
          />
          <Toggle
            checked={settings.sound}
            onChange={v => {
              unlockChime()
              void patchSettings({ sound: v })
            }}
            label="Äänimerkki"
          />
        </div>

        <div className="ax-glass-divide mt-3 space-y-0.5 border-t pt-3">
          <Toggle
            checked={settings.sessionOpen}
            onChange={v => patchSettings({ sessionOpen: v })}
            label="Istunnon avautuminen"
          />
          <Toggle
            checked={settings.sessionClose}
            onChange={v => patchSettings({ sessionClose: v })}
            label="Istunnon sulkeutuminen"
          />
          {/* Oma kytkin eikä istuntojen alla: lähde on eri ja epäluotettavampi,
              joten tämän saa pois ilman että istunnot lakkaavat. */}
          <Toggle
            checked={settings.calendarHigh}
            onChange={v => patchSettings({ calendarHigh: v })}
            label="Talouskalenterin punaiset (15 min ennen)"
          />
        </div>

        {settings.calendarHigh && (
          <div className="mt-2">
            <div className="mb-1.5 text-[10px] text-ax-faint">
              Valuutat — Aasian julkaisut osuvat Suomen yöhön
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CALENDAR_CURRENCIES.map(currency => {
                const on = settings.calendarCurrencies.includes(currency)
                return (
                  <button
                    key={currency}
                    onClick={() => toggleCurrency(currency, !on)}
                    aria-pressed={on}
                    className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
                      on
                        ? 'border-ax-accent/40 bg-ax-accent/10 text-ax-accent'
                        : 'border-ax-line text-ax-faint hover:text-ax-dim'
                    }`}
                  >
                    {currency}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {SESSIONS.map(session => {
            const on = settings.sessions.includes(session.id)
            return (
              <button
                key={session.id}
                onClick={() => toggleSession(session.id, !on)}
                aria-pressed={on}
                className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
                  on
                    ? 'border-ax-accent/40 bg-ax-accent/10 text-ax-accent'
                    : 'border-ax-line text-ax-faint hover:text-ax-dim'
                }`}
              >
                {session.label}
              </button>
            )
          })}
        </div>

        <label className="mt-3 flex items-center gap-2 text-[11px] text-ax-dim">
          Ennakko
          <select
            value={settings.leadMinutes}
            onChange={e => patchSettings({ leadMinutes: Number(e.target.value) })}
            className={inputClass}
          >
            {LEADS.map(m => (
              <option key={m} value={m}>
                {m === 0 ? 'tasan silloin' : `${m} min ennen`}
              </option>
            ))}
          </select>
        </label>

        <div className="ax-glass-divide mt-3 flex items-center justify-between gap-3 border-t pt-3">
          <button
            onClick={sendTest}
            className="rounded-md border border-ax-line px-3 py-1.5 text-[12px] text-ax-dim transition-colors hover:border-ax-line-strong hover:text-ax-text"
          >
            Testaa
          </button>
          {error && <span className="text-[11px] text-ax-down">{error}</span>}
        </div>

        {/* Rajoitus kerrotaan käyttöliittymässä eikä vain koodikommentissa:
            käyttäjä ei voi päätellä ilmoituksen puuttumisesta oliko syynä
            suljettu sovellus vai rikki mennyt ominaisuus. */}
        <p className="mt-3 text-[10px] leading-relaxed text-ax-faint">
          Ilmoitus tulee vain kun arxcian on auki — välilehtenä tai kotiruudulta avattuna. Taustalla
          oleva välilehti riittää.
        </p>
      </Panel>

      <Panel title="Omat treidausajat" meta={`${times.length} kpl`}>
        <form onSubmit={addTime} className="mb-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Nimi, esim. NY killzone"
              className={`${inputClass} min-w-[9rem] flex-1`}
            />
            <input
              type="time"
              value={clock}
              onChange={e => setClock(e.target.value)}
              className={`${inputClass} w-[7rem]`}
            />
            <select value={zone} onChange={e => setZone(e.target.value)} className={inputClass}>
              {ZONES.map(z => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {DAYS.map(day => {
              const on = days.includes(day.iso)
              return (
                <button
                  key={day.iso}
                  type="button"
                  onClick={() => toggleDay(day.iso)}
                  aria-pressed={on}
                  className={`w-8 rounded-md border py-1 text-[11px] transition-colors ${
                    on
                      ? 'border-ax-accent/40 bg-ax-accent/10 text-ax-accent'
                      : 'border-ax-line text-ax-faint hover:text-ax-dim'
                  }`}
                >
                  {day.label}
                </button>
              )
            })}
            <select
              value={leadMinutes}
              onChange={e => setLeadMinutes(Number(e.target.value))}
              className={`${inputClass} ml-auto`}
            >
              {LEADS.map(m => (
                <option key={m} value={m}>
                  {m === 0 ? 'tasan' : `${m} min ennen`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-ax-dim">
              <input
                type="checkbox"
                checked={shared}
                onChange={e => setShared(e.target.checked)}
                className="h-3.5 w-3.5 accent-[rgb(var(--ax-accent))]"
              />
              Näkyy molemmille
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-ax-accent/15 px-3 py-1.5 text-[12px] font-medium text-ax-accent transition-colors hover:bg-ax-accent/25 disabled:opacity-40"
            >
              Lisää
            </button>
          </div>
        </form>

        {times.length === 0 ? (
          <p className="py-3 text-center text-[13px] text-ax-faint">
            Ei omia aikoja. Lisää esimerkiksi killzone tai päivän katsaus.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {times.map(time => (
              <TimeRow key={time.id} time={time} onToggle={mutateTime} onRemove={mutateTime} />
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}

function TimeRow({
  time,
  onToggle,
  onRemove,
}: {
  time: TradingTime
  onToggle: (id: string, method: 'PATCH') => void
  onRemove: (id: string, method: 'DELETE') => void
}) {
  // Seuraava esiintymä lasketaan vasta selaimessa: palvelimen ja selaimen
  // kellon ero näkyisi muuten hydraatiovirheenä juuri tässä rivissä.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const next = now === null ? null : tradingTimeOccurrences(time, now).find(at => at > now)
  const zoneLabel = ZONES.find(z => z.value === time.zone)?.label ?? time.zone
  const dayLabels = DAYS.filter(d => time.days.includes(d.iso))
    .map(d => d.label)
    .join(' ')

  return (
    <li
      className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
        time.enabled ? 'border-ax-line' : 'border-ax-line opacity-50'
      }`}
    >
      <button
        onClick={() => onToggle(time.id, 'PATCH')}
        aria-label={time.enabled ? 'Poista käytöstä' : 'Ota käyttöön'}
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          time.enabled ? 'ax-pulse bg-ax-up' : 'bg-ax-faint'
        }`}
      />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] text-ax-text">
          {time.label}
          {time.owner === 'shared' && <span className="ml-1.5 text-[10px] text-ax-faint">jaettu</span>}
        </div>
        <div className="truncate font-mono text-[10px] text-ax-faint">
          {minutesToHhmm(time.minutes)} {zoneLabel} · {dayLabels}
          {time.leadMinutes > 0 && ` · ${time.leadMinutes} min ennen`}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="font-mono text-[10px] text-ax-dim">
          {next && now !== null ? countdown(next - now) : '—'}
        </div>
        <button
          onClick={() => onRemove(time.id, 'DELETE')}
          className="text-[10px] text-ax-faint transition-colors hover:text-ax-down"
        >
          Poista
        </button>
      </div>
    </li>
  )
}
