'use client'
import { useEffect, useState } from 'react'
import { DayInfo, StoreName, STORES, STORE_COLORS, ROSTER_COLUMNS, getAbsenceLabel, generateAugust2026 } from '@/lib/shiftSchedule'

const MONTH = '2026-08'
const WEEKDAY_SHORT = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la']

function TopBar({ activePage }: { activePage: string }) {
  return (
    <div style={{background:'white', borderBottom:'0.5px solid #eee', padding:'0 16px', display:'flex', alignItems:'center', height:48, position:'sticky', top:0, zIndex:10, gap:0}}>
      <a href="/arxcian" style={{fontWeight:700, fontSize:15, color:'#111', marginRight:24, whiteSpace:'nowrap', textDecoration:'none'}}>RJ-Mob</a>
      {[
        {label:'Tuottoseuranta', href:'/rj-mob/tuotto'},
        {label:'Trendit', href:'/rj-mob/trendit'},
        {label:'Kassamyynti', href:'/rj-mob/kassamyynti'},
        {label:'Myyntiseuranta', href:'/rj-mob/etela'},
        {label:'Tavoitteet ja Run Rate', href:'/rj-mob/tavoitteet'},
        {label:'Laskuri', href:'/rj-mob/laskuri'},
        {label:'Työvuorot', href:'/rj-mob/tyovuorot'},
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

function fmtTime(t: string): string {
  return t.endsWith(':00') ? t.slice(0, -3) : t.replace(':', '.')
}

function dateLabel(dateStr: string, weekday: number): string {
  const day = Number(dateStr.slice(-2))
  return `${WEEKDAY_SHORT[weekday]}.${day}.8.`
}

// Kolme erillistä saraketta per myyjä (Vuoro/Tunnit/Myymälä-kirjain),
// samaa mallia kuin käyttäjän omassa Sheets-vuorolistassa.
function ShiftCells({ seller, day }: { seller: string; day: DayInfo }) {
  const td = { padding:'4px 5px', fontSize:10, textAlign:'center' as const, borderBottom:'0.5px solid #f0f0f0' }
  const lastTd = { ...td, borderRight:'1px solid #eee' }

  if (day.closed) {
    return (
      <>
        <td style={{...td, background:'#fef2f2', color:'#e5b4b4'}}>—</td>
        <td style={{...td, background:'#fef2f2'}}></td>
        <td style={{...lastTd, background:'#fef2f2'}}></td>
      </>
    )
  }

  const absence = getAbsenceLabel(seller, day.date)
  if (absence) {
    return (
      <>
        <td style={{...td, background:'#f3f4f6', color:'#999', fontStyle:'italic'}}>{absence}</td>
        <td style={{...td, background:'#f3f4f6'}}></td>
        <td style={{...lastTd, background:'#f3f4f6'}}></td>
      </>
    )
  }

  const shift = day.shifts.find(s => s.seller === seller)
  if (!shift) {
    return (
      <>
        <td style={{...td, color:'#ddd'}}>·</td>
        <td style={{...td, color:'#ddd'}}></td>
        <td style={{...lastTd, color:'#ddd'}}></td>
      </>
    )
  }

  const cellStyle = { ...td, background: STORE_COLORS[shift.store], color:'#333', fontWeight:500 }
  return (
    <>
      <td style={{...cellStyle, whiteSpace:'nowrap'}}>{fmtTime(shift.start)}–{fmtTime(shift.end)}</td>
      <td style={cellStyle}>{shift.hours}</td>
      <td style={{...cellStyle, ...lastTd}}>{shift.store.charAt(0).toLowerCase()}</td>
    </>
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

  const th = { padding:'6px 5px', fontSize:10, fontWeight:600, color:'#555', textAlign:'center' as const, borderBottom:'1px solid #ddd', whiteSpace:'nowrap' as const, background:'#f8f8f6' }

  return (
    <div style={{minHeight:'100vh', background:'#f8f8f6', fontFamily:'system-ui,sans-serif'}}>
      <TopBar activePage="/rj-mob/tyovuorot" />
      <div style={{maxWidth:1500, margin:'0 auto', padding:'16px'}}>

        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
          <div style={{fontWeight:500, fontSize:16}}>Työvuorot PK-seutu — Elokuu 2026</div>
          <button onClick={generate} disabled={saving}
            style={{padding:'9px 18px', borderRadius:8, background:'#185FA5', color:'white', border:'none', fontSize:13, fontWeight:500, cursor:'pointer', opacity: saving?0.6:1}}>
            {saving ? 'Tallennetaan...' : days.length > 0 ? 'Generoi uudelleen' : 'Generoi elokuu 2026'}
          </button>
        </div>

        <div style={{display:'flex', gap:16, marginBottom:16, fontSize:12, flexWrap:'wrap'}}>
          {STORES.map(s => (
            <div key={s} style={{display:'flex', alignItems:'center', gap:6}}>
              <span style={{width:12, height:12, borderRadius:3, background: STORE_COLORS[s], display:'inline-block'}}></span>
              {s}
            </div>
          ))}
          <div style={{display:'flex', alignItems:'center', gap:6}}>
            <span style={{width:12, height:12, borderRadius:3, background:'#f3f4f6', display:'inline-block', border:'0.5px solid #ddd'}}></span>
            vapaa / loma
          </div>
          <div style={{display:'flex', alignItems:'center', gap:6}}>
            <span style={{width:12, height:12, borderRadius:3, background:'#fef2f2', display:'inline-block', border:'0.5px solid #ddd'}}></span>
            Suljettu
          </div>
        </div>

        {error && <div style={{background:'#FCEBEB', border:'0.5px solid #F09595', borderRadius:10, padding:12, marginBottom:12, fontSize:13, color:'#A32D2D'}}><strong>Virhe:</strong> {error}</div>}
        {loading && <div style={{textAlign:'center', padding:40, color:'#888', fontSize:14}}>Ladataan...</div>}

        {!loading && days.length === 0 && !error && (
          <div style={{textAlign:'center', padding:40, color:'#888', fontSize:14}}>Ei vielä tallennettua vuorolistaa — klikkaa &quot;Generoi elokuu 2026&quot;.</div>
        )}

        {!loading && days.length > 0 && (
          <div style={{background:'white', border:'0.5px solid #eee', borderRadius:12, overflow:'hidden'}}>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%', borderCollapse:'collapse'}}>
                <thead>
                  <tr>
                    <th style={{...th, textAlign:'left', position:'sticky', left:0, background:'#f8f8f6'}}>Pvm</th>
                    {ROSTER_COLUMNS.map(seller => (
                      <th key={seller} colSpan={3} style={{...th, borderRight:'1px solid #ddd'}}>{seller.split(' ')[0]}</th>
                    ))}
                    <th style={{...th, textAlign:'left', minWidth:180}}>Tapahtumat</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map(day => (
                    <tr key={day.date} style={{background: day.closed ? '#fef2f2' : 'white'}}>
                      <td style={{padding:'5px 8px', fontSize:11, fontWeight:600, color: day.closed?'#c99':'#333', whiteSpace:'nowrap', position:'sticky', left:0, background: day.closed ? '#fef2f2' : 'white'}}>
                        {dateLabel(day.date, day.weekday)}
                      </td>
                      {ROSTER_COLUMNS.map(seller => (
                        <ShiftCells key={seller} seller={seller} day={day} />
                      ))}
                      <td style={{padding:'5px 8px', fontSize:10, color:'#185FA5'}}>{day.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
