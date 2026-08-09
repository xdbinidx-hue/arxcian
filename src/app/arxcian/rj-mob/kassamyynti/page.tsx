'use client'
import { useEffect, useState } from 'react'
import { RjMobNav } from '@/components/rjmob/RjMobNav'

interface KassamyyntiRow {
  kassakate: number
  huoltokate: number
  rescueKate: number
  ostorahdit: number
  rjmobOy: number
}

interface DriveFile { id: string; name: string; mimeType: string; year?: number | null }

interface MonthEntry {
  kuukausi: string
  year: number
  monthNum: number
  stores: Record<string, KassamyyntiRow>
}

function fmt(n: number) {
  return Math.round(n).toLocaleString('fi-FI') + ' €'
}

function monthNumOf(name: string): number {
  const m = name.match(/(\d{1,3})\./)
  return m ? Number(m[1]) : 0
}

// Varalähde jos api/receipts ei ole merkinnyt tiedostoa vuosikansion vuodella.
function inferYear(monthNum: number): number {
  const today = new Date()
  return monthNum <= today.getMonth() + 1 ? today.getFullYear() : today.getFullYear() - 1
}

const ZERO: KassamyyntiRow = { kassakate: 0, huoltokate: 0, rescueKate: 0, ostorahdit: 0, rjmobOy: 0 }

function sumRows(rows: KassamyyntiRow[]): KassamyyntiRow {
  return rows.reduce((acc, r) => ({
    kassakate: acc.kassakate + r.kassakate,
    huoltokate: acc.huoltokate + r.huoltokate,
    rescueKate: acc.rescueKate + r.rescueKate,
    ostorahdit: acc.ostorahdit + r.ostorahdit,
    rjmobOy: acc.rjmobOy + r.rjmobOy,
  }), { ...ZERO })
}

export default function KassamyyntiPage() {
  const [months, setMonths] = useState<MonthEntry[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [view, setView] = useState<'vuosi' | number>('vuosi')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/receipts').then(r => r.json()).then(async listRes => {
      if (listRes.error && !listRes.files?.length) { setError(listRes.error); setLoading(false); return }
      const files = (listRes.files ?? []) as DriveFile[]
      const results = await Promise.all(files.map(f => fetch(`/api/receipts?fileId=${f.id}`).then(r => r.json()).then(d => ({ f, d }))))

      const out: MonthEntry[] = []
      for (const { f, d } of results) {
        if (d.error || !d.kassamyynti) continue
        const monthNum = monthNumOf(f.name)
        const year = f.year ?? inferYear(monthNum)
        out.push({ kuukausi: d.kuukausi ?? f.name, year, monthNum, stores: d.kassamyynti })
      }
      out.sort((a, b) => (a.year - b.year) || (a.monthNum - b.monthNum))
      setMonths(out)
      setLoading(false)
    }).catch(e => { setError(String(e)); setLoading(false) })
  }, [])

  // Kuitteja voi olla usealta vuodelta — oletusvuodeksi valitaan uusin heti kun data on ladattu.
  const availableYears = Array.from(new Set(months.map(m => m.year))).sort((a, b) => b - a)
  useEffect(() => {
    if (selectedYear === null && availableYears.length > 0) setSelectedYear(availableYears[0])
  }, [availableYears, selectedYear])

  const monthsForYear = selectedYear !== null ? months.filter(m => m.year === selectedYear) : []
  const selectedMonth = typeof view === 'number' ? monthsForYear.find(m => m.monthNum === view) : null
  const storeNames = Array.from(new Set(monthsForYear.flatMap(m => Object.keys(m.stores))))

  const displayStores: Record<string, KassamyyntiRow> = {}
  for (const nimi of storeNames) {
    if (view === 'vuosi') {
      displayStores[nimi] = sumRows(monthsForYear.map(m => m.stores[nimi] ?? ZERO))
    } else {
      displayStores[nimi] = selectedMonth?.stores[nimi] ?? ZERO
    }
  }
  const grandTotal = sumRows(Object.values(displayStores))
  const displayLabel = view === 'vuosi' ? `koko vuosi ${selectedYear ?? ''} (${monthsForYear.length} kk)` : (selectedMonth?.kuukausi ?? '')

  const th = {fontSize:10,fontWeight:500,color:'#888',textAlign:'left' as const,padding:'5px 7px',borderBottom:'0.5px solid #eee',whiteSpace:'nowrap' as const}
  const thR = {...th, textAlign:'right' as const}
  const td = {padding:'6px 7px',borderBottom:'0.5px solid #f5f5f5',fontSize:12,whiteSpace:'nowrap' as const}
  const tdR = {...td, textAlign:'right' as const}

  return (
    <div>
      <RjMobNav activePage="/arxcian/rj-mob/kassamyynti" />
      <div style={{maxWidth:1000,margin:'0 auto',padding:'16px'}}>
        {error && <div style={{background:'#FCEBEB',border:'0.5px solid #F09595',borderRadius:10,padding:12,marginBottom:12,fontSize:13,color:'#A32D2D'}}><strong>Virhe:</strong> {error}</div>}
        {loading && <div style={{textAlign:'center',padding:60,color:'#888',fontSize:14}}>Ladataan kassamyyntidataa...</div>}

        {!loading && !error && (<>
          {availableYears.length > 1 && (
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,flexWrap:'wrap'}}>
              <span style={{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.5px'}}>Vuosi</span>
              {availableYears.map(y => (
                <button key={y} onClick={() => { setSelectedYear(y); setView('vuosi') }}
                  style={{
                    padding:'5px 12px',borderRadius:8,border:'0.5px solid #ddd',cursor:'pointer',fontSize:12,
                    fontWeight: selectedYear===y?500:400,
                    background: selectedYear===y?'#185FA5':'white',
                    color: selectedYear===y?'white':'#555',
                  }}>
                  {y}
                </button>
              ))}
            </div>
          )}
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,flexWrap:'wrap'}}>
            <span style={{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.5px'}}>Näkymä</span>
            <button onClick={() => setView('vuosi')}
              style={{
                padding:'5px 12px',borderRadius:8,border:'0.5px solid #ddd',cursor:'pointer',fontSize:12,
                fontWeight: view==='vuosi'?500:400,
                background: view==='vuosi'?'#185FA5':'white',
                color: view==='vuosi'?'white':'#555',
              }}>
              Koko vuosi
            </button>
            {monthsForYear.map(m => (
              <button key={m.monthNum} onClick={() => setView(m.monthNum)}
                style={{
                  padding:'5px 12px',borderRadius:8,border:'0.5px solid #ddd',cursor:'pointer',fontSize:12,
                  fontWeight: view===m.monthNum?500:400,
                  background: view===m.monthNum?'#185FA5':'white',
                  color: view===m.monthNum?'white':'#555',
                }}>
                {m.kuukausi}
              </button>
            ))}
          </div>

          <div style={{background:'white',border:'0.5px solid #eee',borderRadius:12,overflow:'hidden',marginBottom:12}}>
            <div style={{padding:'10px 14px',borderBottom:'0.5px solid #eee'}}>
              <span style={{fontWeight:500,fontSize:14}}>Kassamyynti myymälöittäin — {displayLabel}</span>
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr>
                  <th style={th}>Myymälä</th>
                  <th style={thR}>Kassakate</th>
                  <th style={thR}>Huoltokate</th>
                  <th style={thR}>Rescue kate</th>
                  <th style={thR}>Ostorahdit</th>
                  <th style={thR}>RJ-Mob Oy</th>
                </tr></thead>
                <tbody>
                  {storeNames.map(nimi => {
                    const s = displayStores[nimi]
                    return (
                      <tr key={nimi}>
                        <td style={{...td,fontWeight:500}}>{nimi}</td>
                        <td style={tdR}>{fmt(s.kassakate)}</td>
                        <td style={tdR}>{fmt(s.huoltokate)}</td>
                        <td style={tdR}>{fmt(s.rescueKate)}</td>
                        <td style={tdR}>{fmt(s.ostorahdit)}</td>
                        <td style={{...tdR,color:'#185FA5'}}>{fmt(s.rjmobOy)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{background:'#f8f8f6',borderTop:'1px solid #eee'}}>
                    <td style={{...td,fontWeight:600}}>Yhteensä</td>
                    <td style={{...tdR,fontWeight:600}}>{fmt(grandTotal.kassakate)}</td>
                    <td style={{...tdR,fontWeight:600}}>{fmt(grandTotal.huoltokate)}</td>
                    <td style={{...tdR,fontWeight:600}}>{fmt(grandTotal.rescueKate)}</td>
                    <td style={{...tdR,fontWeight:600}}>{fmt(grandTotal.ostorahdit)}</td>
                    <td style={{...tdR,fontWeight:600,color:'#185FA5'}}>{fmt(grandTotal.rjmobOy)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>)}
      </div>
    </div>
  )
}
