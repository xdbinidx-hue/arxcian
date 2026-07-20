'use client'
import { useEffect, useState } from 'react'
import { DayInfo, StoreName, STORES, STORE_COLORS, generateAugust2026 } from '@/lib/shiftSchedule'

const MONTH = '2026-08'
const WEEKDAY_LABELS = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su']

function TopBar({ activePage }: { activePage: string }) {
  return (
    <div style={{background:'white', borderBottom:'0.5px solid #eee', padding:'0 16px', display:'flex', alignItems:'center', height:48, position:'sticky', top:0, zIndex:10, gap:0}}>
      <a href="/" style={{fontWeight:700, fontSize:15, color:'#111', marginRight:24, whiteSpace:'nowrap', textDecoration:'none'}}>RJ-Mob</a>
      {[
        {label:'Tuottoseuranta', href:'/tuotto'},
        {label:'Trendit', href:'/trendit'},
        {label:'Myyntiseuranta', href:'/etela'},
        {label:'Tavoitteet ja Run Rate', href:'/tavoitteet'},
        {label:'Laskuri', href:'/laskuri'},
        {label:'Työvuorot', href:'/tyovuorot'},
      ].map(item => (
        <a key={item.href} href={item.href}
          style={{
            fontSize:13, fontWeight: activePage === item.href ? 500 : 400,
            color: activePage === item.href ? '#185FA5' : '#666',
            textDecoration:'none', padding:'0 14px', height:48,
            display:'flex', alignItems:'center',
            borderBottom: activePage === item.href ? '2px solid #185FA5' : '2px solid transparent',
            whiteSpace:'nowrap'
          }}>
          {item.label}
        </a>
      ))}
    </div>
  )
}

function DayCell({ day }: { day: DayInfo }) {
  const dayNum = Number(day.date.slice(-2))
  const shiftsByStore: Record<StoreName, typeof day.shifts> = { Malmi: [], Easton: [], Kivistö: [] }
  for (const s of day.shifts) shiftsByStore[s.store].push(s)

  return (
    <div style={{background: day.closed ? '#f5f5f5' : 'white', border:'0.5px solid #eee', borderRadius:8, padding:'6px 7px', minHeight:120, display:'flex', flexDirection:'column', gap:4}}>
      <div style={{fontSize:12, fontWeight:600, color: day.closed ? '#bbb' : '#333'}}>{dayNum}</div>
      {day.note && <div style={{fontSize:9, color:'#185FA5', lineHeight:1.3}}>{day.note}</div>}
      {day.closed ? (
        <div style={{fontSize:10, color:'#bbb', fontStyle:'italic'}}>Suljettu</div>
      ) : (
        STORES.map(store => shiftsByStore[store].length > 0 && (
          <div key={store} style={{background: STORE_COLORS[store], borderRadius:5, padding:'3px 5px'}}>
            <div style={{fontSize:9, fontWeight:600, color:'#444', marginBottom:1}}>{store}</div>
            {shiftsByStore[store].map((s,i) => (
              <div key={i} style={{fontSize:9, color:'#333', whiteSpace:'nowrap'}}>
                {s.seller.split(' ')[0]} {s.start}–{s.end}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}

export default function TyovuorotPage() {
  const [days, setDays] = useState<DayInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true); setError('')
    fetch(`/api/shifts?month=${MONTH}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setDays(d.days ?? []) })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const generate = async () => {
    const generated = generateAugust2026()
    setDays(generated)
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: MONTH, days: generated }),
      })
      const d = await res.json()
      if (d.error) setError(d.error)
    } catch (e) {
      setError(String(e))
    }
    setSaving(false)
  }

  // Elokuu 2026 alkaa lauantaina (viikko alkaa maanantaista)
  const leadingBlanks = days.length > 0 ? (new Date(days[0].date).getDay() + 6) % 7 : 0

  return (
    <div style={{minHeight:'100vh', background:'#f8f8f6', fontFamily:'system-ui,sans-serif'}}>
      <TopBar activePage="/tyovuorot" />
      <div style={{maxWidth:1300, margin:'0 auto', padding:'16px'}}>

        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
          <div style={{fontWeight:500, fontSize:16}}>Työvuorot — Elokuu 2026</div>
          <button onClick={generate} disabled={saving}
            style={{padding:'9px 18px', borderRadius:8, background:'#185FA5', color:'white', border:'none', fontSize:13, fontWeight:500, cursor:'pointer', opacity: saving?0.6:1}}>
            {saving ? 'Tallennetaan...' : days.length > 0 ? 'Generoi uudelleen' : 'Generoi elokuu 2026'}
          </button>
        </div>

        <div style={{display:'flex', gap:16, marginBottom:16, fontSize:12}}>
          {STORES.map(s => (
            <div key={s} style={{display:'flex', alignItems:'center', gap:6}}>
              <span style={{width:12, height:12, borderRadius:3, background: STORE_COLORS[s], display:'inline-block'}}></span>
              {s}
            </div>
          ))}
        </div>

        {error && <div style={{background:'#FCEBEB', border:'0.5px solid #F09595', borderRadius:10, padding:12, marginBottom:12, fontSize:13, color:'#A32D2D'}}><strong>Virhe:</strong> {error}</div>}
        {loading && <div style={{textAlign:'center', padding:40, color:'#888', fontSize:14}}>Ladataan...</div>}

        {!loading && days.length === 0 && !error && (
          <div style={{textAlign:'center', padding:40, color:'#888', fontSize:14}}>Ei vielä tallennettua vuorolistaa — klikkaa &quot;Generoi elokuu 2026&quot;.</div>
        )}

        {!loading && days.length > 0 && (
          <div style={{background:'white', border:'0.5px solid #eee', borderRadius:12, padding:14}}>
            <div style={{display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6, marginBottom:6}}>
              {WEEKDAY_LABELS.map(w => (
                <div key={w} style={{fontSize:11, fontWeight:500, color:'#888', textAlign:'center'}}>{w}</div>
              ))}
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6}}>
              {Array.from({length: leadingBlanks}).map((_,i) => <div key={'b'+i} />)}
              {days.map(day => <DayCell key={day.date} day={day} />)}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
