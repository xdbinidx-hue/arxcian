'use client'
import { useEffect, useState } from 'react'
import { RJ_MOB_SELLERS } from '@/lib/rjmob'
import { RjMobNav } from '@/components/rjmob/RjMobNav'

const STORAGE_KEY = 'rjmob_tyovuorot_v1'
const ROSTER_KEY = 'rjmob_tyovuoro_roster_v1'
const DAYS = ['Ma','Ti','Ke','To','Pe','La','Su']

const DEFAULT_ROSTER = Array.from(new Set(
  RJ_MOB_SELLERS.filter((_, i) => i % 2 === 0)
))

type WeekShifts = Record<string, number[]>

function mondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function weekKey(monday: Date): string {
  return monday.toISOString().slice(0, 10)
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function fmtDate(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}.`
}

function weekLabel(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return `Viikko ${getISOWeek(monday)} — ${fmtDate(monday)}–${fmtDate(sunday)}${sunday.getFullYear()}`
}

export default function TyovuoroPage() {
  const [ready, setReady] = useState(false)
  const [currentMonday, setCurrentMonday] = useState<Date>(() => mondayOf(new Date()))
  const [allData, setAllData] = useState<Record<string, WeekShifts>>({})
  const [roster, setRoster] = useState<string[]>(DEFAULT_ROSTER)
  const [newSeller, setNewSeller] = useState('')

  useEffect(() => {
    try {
      const rawData = localStorage.getItem(STORAGE_KEY)
      if (rawData) setAllData(JSON.parse(rawData))
      const rawRoster = localStorage.getItem(ROSTER_KEY)
      if (rawRoster) setRoster(JSON.parse(rawRoster))
    } catch {}
    setReady(true)
  }, [])

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(allData))
  }, [allData, ready])

  useEffect(() => {
    if (ready) localStorage.setItem(ROSTER_KEY, JSON.stringify(roster))
  }, [roster, ready])

  const wk = weekKey(currentMonday)
  const weekData = allData[wk] ?? {}

  const setHours = (seller: string, dayIdx: number, value: number) => {
    setAllData(prev => {
      const week = { ...(prev[wk] ?? {}) }
      const hours = [...(week[seller] ?? [0,0,0,0,0,0,0])]
      hours[dayIdx] = value
      week[seller] = hours
      return { ...prev, [wk]: week }
    })
  }

  const addSeller = () => {
    const name = newSeller.trim()
    if (name && !roster.includes(name)) setRoster([...roster, name])
    setNewSeller('')
  }

  const removeSeller = (name: string) => setRoster(roster.filter(n => n !== name))

  const rowTotal = (seller: string) => (weekData[seller] ?? [0,0,0,0,0,0,0]).reduce((a,b)=>a+b, 0)
  const dayTotal = (dayIdx: number) => roster.reduce((s,seller) => s + ((weekData[seller]?.[dayIdx]) ?? 0), 0)
  const weekTotal = roster.reduce((s,seller) => s + rowTotal(seller), 0)

  const inputStyle = {width:52, padding:'5px 4px', fontSize:12, textAlign:'center' as const, border:'0.5px solid #ddd', borderRadius:6}

  return (
    <div>
      <RjMobNav activePage="/arxcian/rj-mob/tyovuoro" />
      <div style={{maxWidth:900,margin:'0 auto',padding:'16px'}}>

        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
          <button onClick={() => setCurrentMonday(d => { const n = new Date(d); n.setDate(n.getDate()-7); return n })}
            style={{padding:'8px 14px',borderRadius:8,border:'0.5px solid #ddd',background:'white',cursor:'pointer',fontSize:13,color:'#333'}}>
            ← Edellinen
          </button>
          <div style={{textAlign:'center'}}>
            <div style={{fontWeight:500,fontSize:14}}>{weekLabel(currentMonday)}</div>
            <button onClick={() => setCurrentMonday(mondayOf(new Date()))}
              style={{marginTop:4,fontSize:11,color:'#185FA5',background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}>
              Tämä viikko
            </button>
          </div>
          <button onClick={() => setCurrentMonday(d => { const n = new Date(d); n.setDate(n.getDate()+7); return n })}
            style={{padding:'8px 14px',borderRadius:8,border:'0.5px solid #ddd',background:'white',cursor:'pointer',fontSize:13,color:'#333'}}>
            Seuraava →
          </button>
        </div>

        <div style={{background:'white',border:'0.5px solid #eee',borderRadius:12,overflow:'hidden',marginBottom:16}}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{borderBottom:'0.5px solid #eee'}}>
                  <th style={{textAlign:'left',padding:'8px 12px',color:'#888',fontWeight:500,fontSize:11}}>Myyjä</th>
                  {DAYS.map(d => (
                    <th key={d} style={{textAlign:'center',padding:'8px 6px',color:'#888',fontWeight:500,fontSize:11}}>{d}</th>
                  ))}
                  <th style={{textAlign:'right',padding:'8px 12px',color:'#888',fontWeight:500,fontSize:11}}>Yht.</th>
                  <th style={{width:32}}></th>
                </tr>
              </thead>
              <tbody>
                {roster.map((seller,i) => (
                  <tr key={seller} style={{background: i%2===0?'white':'#fafafa',borderBottom:'0.5px solid #f5f5f5'}}>
                    <td style={{padding:'6px 12px',fontWeight:500,whiteSpace:'nowrap'}}>{seller}</td>
                    {DAYS.map((_,dayIdx) => (
                      <td key={dayIdx} style={{padding:'4px 6px',textAlign:'center'}}>
                        <input type="number" min={0} max={24} step={0.5}
                          value={weekData[seller]?.[dayIdx] ?? ''}
                          onChange={e => setHours(seller, dayIdx, e.target.value === '' ? 0 : Number(e.target.value))}
                          style={inputStyle} />
                      </td>
                    ))}
                    <td style={{padding:'6px 12px',textAlign:'right',fontWeight:500}}>{rowTotal(seller)} h</td>
                    <td style={{textAlign:'center'}}>
                      <button onClick={() => removeSeller(seller)} title="Poista myyjä"
                        style={{background:'none',border:'none',color:'#bbb',cursor:'pointer',fontSize:14,padding:'2px 6px'}}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
                <tr style={{background:'#f8f8f6',borderTop:'1px solid #eee'}}>
                  <td style={{padding:'7px 12px',fontWeight:600}}>Yhteensä</td>
                  {DAYS.map((_,dayIdx) => (
                    <td key={dayIdx} style={{padding:'7px 6px',textAlign:'center',fontWeight:600}}>{dayTotal(dayIdx)}</td>
                  ))}
                  <td style={{padding:'7px 12px',textAlign:'right',fontWeight:600,color:'#185FA5'}}>{weekTotal} h</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{display:'flex',gap:8,padding:'12px 14px',borderTop:'0.5px solid #eee'}}>
            <input value={newSeller} onChange={e => setNewSeller(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addSeller() }}
              placeholder="Lisää myyjä..."
              style={{flex:1,padding:'8px 10px',fontSize:12,border:'0.5px solid #ddd',borderRadius:8}} />
            <button onClick={addSeller}
              style={{padding:'8px 16px',borderRadius:8,background:'#185FA5',color:'white',border:'none',fontSize:12,fontWeight:500,cursor:'pointer'}}>
              Lisää
            </button>
          </div>
        </div>

        <div style={{fontSize:11,color:'#aaa'}}>Tiedot tallennetaan selaimen localStorageen — vain tällä laitteella ja selaimella näkyvissä.</div>

      </div>
    </div>
  )
}
