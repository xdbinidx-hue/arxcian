'use client'

import { useEffect, useRef, useState } from 'react'
import type { State } from '@/lib/arxcian/checklist/protocol'

type View = Omit<State, 'pending'> & { pending: { id: string; op: string } | null }
const API = '/api/arxcian/personal/checklist'
const DRAFT = 'arxcian:albin:checklist:submission'
type Draft = { id: string; op: 'pair' | 'add'; text?: string; revision?: number }

export function ChecklistPanel() {
  const [state, setState] = useState<View | null>(null)
  const [text, setText] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [sending, setSending] = useState(false)
  const [retry, setRetry] = useState<Draft | null>(null)
  const alive = useRef(true)
  const locked = useRef(false)
  useEffect(() => {
    alive.current = true
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    try {
      const saved = JSON.parse(sessionStorage.getItem(DRAFT) || 'null')
      if (saved?.id && ['pair', 'add'].includes(saved.op)) setRetry(saved)
    } catch { /* Vioittunut luonnos ei lähetä pyyntöä. */ }
    const poll = async () => {
      try {
        const r = await fetch(API, { cache: 'no-store', signal: controller.signal })
        if (!r.ok) throw new Error('Tehtävän tilaa ei saatu. Yhteyttä yritetään uudelleen.')
        const next: View = await r.json()
        if (alive.current) { setState(next); setLoadError('') }
      } catch (e) {
        if (alive.current) setLoadError(e instanceof Error ? e.message : 'Yhteys katkesi.')
      } finally { if (alive.current) timer = setTimeout(poll, 2000) }
    }
    void poll()
    return () => { alive.current = false; controller.abort(); clearTimeout(timer) }
  }, [])

  async function send(op: 'pair' | 'add', previous?: Draft) {
    if (locked.current) return
    locked.current = true
    setSending(true)
    setError('')
    const draft: Draft = previous ?? (op === 'pair' ? { id: crypto.randomUUID(), op } : { id: crypto.randomUUID(), op, text: text.trim(), revision: state?.snapshot?.revision })
    try {
      sessionStorage.setItem(DRAFT, JSON.stringify(draft))
      setRetry(draft)
      const response = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })
      const result = await response.json()
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) { sessionStorage.removeItem(DRAFT); setRetry(null) }
        throw new Error(result.error || 'Tallennus ei onnistunut.')
      }
      if (result.token) setToken(result.token)
      sessionStorage.removeItem(DRAFT)
      setRetry(null)
      if (op === 'add') setText('')
      // Estä toinen muutos ennen palvelimen tuoretta tilaa.
      setState(s => s ? { ...s, pending: { id: result.id, op } } : s)
    } catch (e) { setError(e instanceof Error ? e.message : 'Lähetys katkesi. Uusi sama pyyntö.') }
    finally { locked.current = false; if (alive.current) setSending(false) }
  }

  const task = state?.snapshot
  const stale = !state?.syncedAt || Date.now() - state.syncedAt > 15000
  const busy = sending || !!state?.pending || !!retry
  const status = task?.status === 'completed' ? 'Valmis' : task?.status === 'waiting_input' ? 'Odottaa seuraavaa kohtaa' : 'Ei aloitettu'
  return <main className="mx-auto max-w-2xl space-y-5 py-6">
    <a href="/arxcian/personal" className="text-sm text-ax-dim">← Personal</a>
    <h1 className="text-2xl text-ax-text">Käyttötestilista</h1>
    <p className="text-ax-dim">Albinin yksityinen tehtävä · Hermes</p>
    <section className="rounded-xl border border-white/10 p-5 space-y-3">
      <h2 className="text-lg">Tavoite: laadi kolmen kohdan Arxcian-käyttötestilista</h2>
      <p>Tila: {status}</p>
      {task?.id && <p className="text-sm text-ax-dim">Tehtävä: {task.id}</p>}
      <h3>Tulos ({task?.items.length ?? 0}/3)</h3>
      {task?.items.length ? <ol className="list-decimal pl-5">{task.items.map((item, i) => <li key={i}>{item}</li>)}</ol> : <p>Ei vielä kohtia.</p>}
      <p>Seuraava askel: {task?.nextStep ?? 'Odotetaan tehtäväyhteyttä.'}</p>
      {task?.id && task.status !== 'completed' && <form onSubmit={e => { e.preventDefault(); void send('add') }} className="space-y-2">
        <label htmlFor="checklist-item">Seuraava käyttötestikohta</label>
        <textarea id="checklist-item" value={text} onChange={e => setText(e.target.value)} maxLength={500} required className="w-full rounded bg-white/5 p-3" />
        <button disabled={busy || stale || !text.trim()} className="rounded bg-white/10 px-4 py-2 disabled:opacity-40">Lisää kohta</button>
      </form>}
    </section>
    {!task?.paired && <section className="space-y-3 rounded-xl border border-white/10 p-5">
      <h2>Liitä oma Telegram</h2>
      <p>Avaa Hermeksen yksityinen keskustelu. Kertakäyttöinen koodi liittää sen tähän Albinin tehtävään.</p>
      <button disabled={busy || stale} onClick={() => void send('pair')} className="rounded bg-white/10 px-4 py-2 disabled:opacity-40">Luo kytkentäkoodi</button>
      {token && <><p>Lähetä tämä yksityisesti Hermekselle 10 minuutin kuluessa, kun alla ei enää lue ”Odottaa käsittelyä”:</p><code className="block break-all select-all">/arxcian_tehtava liita {token}</code></>}
    </section>}
    {task?.paired && <p>Telegramissa: <code>/arxcian_tehtava</code> näyttää tai aloittaa saman tehtävän. Lisää kohta komennolla <code>/arxcian_tehtava lisaa oma käyttötestikohta</code>.</p>}
    <div aria-live="polite">
      {state?.pending && <p>Odottaa käsittelyä. Voit sulkea selaimen.</p>}
      {stale && <p>Tehtäväyhteys ei ole ajan tasalla. Näytetään viimeisin saatu tila.</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {error && <p role="alert">{error}</p>}
      {state?.last?.error && <p role="alert">{state.last.error}</p>}
      {retry && <button disabled={sending} onClick={() => void send(retry.op, retry)}>Tarkista / uusi sama lähetys</button>}
    </div>
  </main>
}
