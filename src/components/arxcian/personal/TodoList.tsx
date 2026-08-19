import { useCallback, useEffect, useRef, useState } from 'react'
import {
  GROUP_LABELS,
  GROUP_ORDER,
  dueToday,
  groupOf,
  localDate,
  reminderMs,
  shiftDays,
  type Group,
} from '@/lib/arxcian/personal/todoGroups'
import type { Todo } from '@/lib/arxcian/personal/types'
import type { Owner } from '@/lib/session'

type Props = {
  initialTodos: Todo[]
  currentUser: Owner
}

const GROUP_COLORS: Record<Group, string> = {
  myohassa: 'text-ax-down',
  tanaan: 'text-ax-accent',
  huomenna: 'text-ax-dim',
  myohemmin: 'text-ax-dim',
  joskus: 'text-ax-faint',
}

// Kuitatut muistutukset selaimen muistiin: ilman tätä sivun lataus laukaisisi
// saman muistutuksen aina uudelleen. Tieto on selainkohtainen tarkoituksella —
// se ei ole tehtävän tilaa vaan tämän laitteen ilmoitushistoriaa.
const REMINDED_KEY = 'arxcian:tehtavat-muistutettu'

function loadReminded(): Set<string> {
  try {
    const raw = localStorage.getItem(REMINDED_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveReminded(ids: Set<string>): void {
  try {
    localStorage.setItem(REMINDED_KEY, JSON.stringify(Array.from(ids).slice(-200)))
  } catch {
    // Yksityinen selaustila voi estää kirjoituksen — muistutus toimii silti,
    // se vain uusiutuu seuraavalla latauksella.
  }
}

/** Vain tuoreesta muistutuksesta kilautetaan; vanhat näkyvät pelkkänä palkkina. */
const NOTIFY_WINDOW_MS = 15 * 60 * 1000

export function TodoList({ initialTodos, currentUser }: Props) {
  const [todos, setTodos] = useState<Todo[]>(initialTodos)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [remindAt, setRemindAt] = useState('')
  const [shared, setShared] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showDone, setShowDone] = useState(false)

  // Päivä ratkeaa vasta selaimessa: palvelin renderöi UTC:ssa, joten
  // ryhmittely palvelimella eroaisi selaimen näkemästä päivästä.
  const [today, setToday] = useState<string | null>(null)
  const [dueNow, setDueNow] = useState<Todo[]>([])
  const [notifyState, setNotifyState] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const remindedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setToday(localDate(new Date()))
    setDate(localDate(new Date()))
    remindedRef.current = loadReminded()
    if (typeof Notification !== 'undefined') setNotifyState(Notification.permission)
  }, [])

  // Muistutusten tarkistus puolen minuutin välein. Tämä ei ole push-ilmoitus:
  // se toimii vain kun sivu on auki, mutta ei vaadi ulkoista palvelua.
  useEffect(() => {
    const check = () => {
      const now = Date.now()
      const fresh = todos.filter(t => {
        if (t.done || remindedRef.current.has(t.id)) return false
        const ms = reminderMs(t)
        return ms !== null && ms <= now
      })
      if (fresh.length === 0) return

      for (const t of fresh) remindedRef.current.add(t.id)
      saveReminded(remindedRef.current)
      setDueNow(prev => [...prev, ...fresh])

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        for (const t of fresh) {
          const ms = reminderMs(t)
          if (ms !== null && now - ms < NOTIFY_WINDOW_MS) {
            new Notification('Muistutus', { body: t.title, tag: t.id })
          }
        }
      }
    }

    check()
    const timer = setInterval(check, 30_000)
    return () => clearInterval(timer)
  }, [todos])

  const askNotifyPermission = async () => {
    if (typeof Notification === 'undefined') return
    setNotifyState(await Notification.requestPermission())
  }

  const send = useCallback(async (init: RequestInit, query = '') => {
    const res = await fetch(`/api/arxcian/personal/todos${query}`, init)
    const data = (await res.json()) as { todos?: Todo[] }
    if (data.todos) setTodos(data.todos)
    return Boolean(data.todos)
  }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      await send({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          owner: shared ? 'shared' : currentUser,
          date: date || null,
          remindAt: remindAt || null,
        }),
      })
      setTitle('')
      setRemindAt('')
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (id: string) => {
    setTodos(ts => ts.map(t => (t.id === id ? { ...t, done: !t.done } : t)))
    await send({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'toggle' }),
    })
  }

  /** Siirtää tehtävän huomiselle ja säilyttää kellonajan. */
  const pushToTomorrow = async (todo: Todo) => {
    const base = todo.date ?? today
    if (!base) return
    remindedRef.current.delete(todo.id)
    saveReminded(remindedRef.current)
    setDueNow(prev => prev.filter(t => t.id !== todo.id))
    await send({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: todo.id,
        action: 'schedule',
        date: shiftDays(base, 1),
        remindAt: todo.remindAt,
      }),
    })
  }

  const remove = async (id: string) => {
    const previous = todos
    setTodos(ts => ts.filter(t => t.id !== id))
    const ok = await send({ method: 'DELETE' }, `?id=${encodeURIComponent(id)}`)
    if (!ok) setTodos(previous)
  }

  const clearDone = async () => {
    setBusy(true)
    try {
      await send({ method: 'DELETE' }, '?tehdyt=1')
    } finally {
      setBusy(false)
    }
  }

  const pending = todos.filter(t => !t.done)
  const done = todos.filter(t => t.done)
  const openToday = today ? dueToday(pending, today).length : 0

  const groups = today
    ? GROUP_ORDER.map(g => ({ id: g, items: pending.filter(t => groupOf(t, today) === g) })).filter(
        section => section.items.length > 0,
      )
    : [{ id: 'joskus' as Group, items: pending }]

  const row = (t: Todo) => (
    <li key={t.id} className="flex items-center gap-2 rounded-md border border-ax-line px-3 py-2 text-[12px]">
      <input
        type="checkbox"
        checked={t.done}
        onChange={() => toggle(t.id)}
        aria-label={t.done ? 'Merkitse kesken' : 'Merkitse tehdyksi'}
      />
      <span className={`flex-1 ${t.done ? 'text-ax-faint line-through' : 'text-ax-text'}`}>{t.title}</span>
      {t.remindAt && (
        <span className="shrink-0 rounded border border-ax-line px-1.5 py-0.5 text-[9px] text-ax-warn">
          {t.remindAt}
        </span>
      )}
      {t.owner === 'shared' && (
        <span className="shrink-0 rounded border border-ax-line px-1.5 py-0.5 text-[9px] text-ax-faint">jaettu</span>
      )}
      {!t.done && (
        <button
          onClick={() => pushToTomorrow(t)}
          title="Siirrä huomiselle"
          className="shrink-0 text-ax-faint hover:text-ax-accent"
        >
          →
        </button>
      )}
      <button onClick={() => remove(t.id)} className="shrink-0 text-ax-faint hover:text-ax-down">
        Poista
      </button>
    </li>
  )

  return (
    <div className="ax-glass rounded-2xl">
      <header className="flex items-center justify-between border-b border-ax-line px-4 py-2.5">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ax-dim">Tehtävät</h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-ax-faint">
            {openToday > 0 ? `${openToday} tänään` : 'ei tämän päivän tehtäviä'}
          </span>
          {notifyState === 'default' && (
            <button
              onClick={askNotifyPermission}
              className="rounded border border-ax-line px-2 py-0.5 text-[10px] text-ax-faint hover:text-ax-text"
            >
              Salli muistutukset
            </button>
          )}
        </div>
      </header>

      <div className="p-4">
        {dueNow.length > 0 && (
          <div className="mb-4 rounded-md border border-ax-warn/40 px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-ax-warn">Muistutus</p>
                <ul className="mt-1 space-y-0.5">
                  {dueNow.map(t => (
                    <li key={t.id} className="text-[12px] text-ax-text">
                      {t.title}
                      {t.remindAt && <span className="ml-2 text-[10px] text-ax-faint">klo {t.remindAt}</span>}
                    </li>
                  ))}
                </ul>
              </div>
              <button onClick={() => setDueNow([])} className="shrink-0 text-[12px] text-ax-faint hover:text-ax-text">
                Kuittaa
              </button>
            </div>
          </div>
        )}

        <form onSubmit={add} className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Uusi tehtävä…"
            className="min-w-[180px] flex-1 rounded-md border border-ax-line bg-ax-panel-hi px-2.5 py-1.5 text-[12px] text-ax-text placeholder:text-ax-faint focus:border-ax-line-strong focus:outline-none"
          />
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="rounded-md border border-ax-line bg-ax-panel-hi px-2 py-1.5 text-[12px] text-ax-text focus:outline-none"
          />
          <input
            type="time"
            value={remindAt}
            onChange={e => setRemindAt(e.target.value)}
            disabled={!date}
            title={date ? 'Muistutuksen kellonaika' : 'Valitse ensin päivä'}
            className="rounded-md border border-ax-line bg-ax-panel-hi px-2 py-1.5 text-[12px] text-ax-text focus:outline-none disabled:opacity-40"
          />
          <label className="flex items-center gap-1.5 text-[11px] text-ax-dim">
            <input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} />
            Jaettu
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-ax-accent/15 px-3 py-1.5 text-[12px] font-medium text-ax-accent transition-colors hover:bg-ax-accent/25 disabled:opacity-40"
          >
            Lisää
          </button>
        </form>

        {pending.length === 0 ? (
          <p className="py-3 text-center text-[13px] text-ax-faint">Ei avoimia tehtäviä.</p>
        ) : (
          groups.map(section => (
            <section key={section.id} className="mb-3 last:mb-0">
              <h3
                className={`mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] ${GROUP_COLORS[section.id]}`}
              >
                {GROUP_LABELS[section.id]}
              </h3>
              <ul className="space-y-1.5">{section.items.map(row)}</ul>
            </section>
          ))
        )}

        {done.length > 0 && (
          <div className="mt-4 border-t border-ax-line pt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <button
                onClick={() => setShowDone(v => !v)}
                className="text-[10px] font-medium uppercase tracking-[0.14em] text-ax-faint hover:text-ax-text"
              >
                {showDone ? '▾' : '▸'} Tehdyt ({done.length})
              </button>
              <button
                onClick={clearDone}
                disabled={busy}
                className="text-[10px] text-ax-faint hover:text-ax-down disabled:opacity-40"
              >
                Siivoa tehdyt
              </button>
            </div>
            {showDone && <ul className="space-y-1.5">{done.map(row)}</ul>}
          </div>
        )}
      </div>
    </div>
  )
}
