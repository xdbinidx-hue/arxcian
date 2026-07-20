'use client'
import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'

interface MonthData {
  kuukausi: string
  netto: number
  brutto: number
  liittKpl: number
  liittEur: number
  fsecKpl: number
  fsecPassiivi: number
  kassa: number
  tyokulu: number
  erotusPct: number
}

interface DriveFile {
  id: string; name: string; mimeType: string
}

function parsePrefix(name: string): number {
  const yearMatch = name.match(/(\d{4})/)
  const numMatch = name.match(/(\d{1,3})\./)
  const year = yearMatch ? Number(yearMatch[1]) : 0
  const month = numMatch ? Number(numMatch[1]) : 0
  return year * 100 + month
}

function linearTrend(ys: number[]) {
  const n = ys.length
  if (n === 0) return { slope: 0, intercept: 0 }
  const xs = ys.map((_, i) => i)
  const sumX = xs.reduce((a, b) => a + b, 0)
  const sumY = ys.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0)
  const sumX2 = xs.reduce((s, x) => s + x * x, 0)
  const denom = n * sumX2 - sumX * sumX
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

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

export default function TrendPage() {
  const [months, setMonths] = useState<MonthData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/files')
      .then(r => r.json())
      .then(async d => {
        const sheets = ((d.files ?? []).filter((f: DriveFile) =>
          f.mimeType === 'application/vnd.google-apps.spreadsheet'
        )).sort((a: DriveFile, b: DriveFile) => parsePrefix(a.name) - parsePrefix(b.name))

        const results: MonthData[] = []
        for (const f of sheets) {
          const res = await fetch(`/api/sheets?fileId=${f.id}`)
          const data = await res.json()
          if (data.totals) {
            const netto = Math.round(data.totals.netto)
            const tyokulu = Math.round(data.totals.tyokulu)
            results.push({
              kuukausi: f.name.replace('Myyntiseuranta ', '').replace(' 2026', ''),
              netto,
              brutto: Math.round(data.totals.rjmobTulo),
              liittKpl: data.totals.liittKpl,
              liittEur: Math.round(data.totals.liittEur),
              fsecKpl: data.totals.fsecKpl,
              fsecPassiivi: Math.round(data.totals.fsecKpl * 1.5),
              kassa: Math.round(data.totals.kassa),
              tyokulu,
              erotusPct: tyokulu > 0 ? Math.round((netto - tyokulu) / tyokulu * 100) : 0,
            })
          }
        }
        setMonths(results)
        setLoading(false)
      })
  }, [])

  const fmt = (n: number) => Math.round(n).toLocaleString('fi-FI') + ' €'
  const fmtN = (n: number) => Math.round(n).toLocaleString('fi-FI')
  const avgNetto = months.length ? Math.round(months.reduce((s,m) => s+m.netto, 0) / months.length) : 0
  const totalNetto = months.reduce((s,m) => s+m.netto, 0)
  const bestMonth = months.length ? months.reduce((a,b) => a.netto > b.netto ? a : b) : null
  const avgErotusPct = months.length ? Math.round(months.reduce((s,m) => s+m.erotusPct, 0) / months.length) : 0

  const monthsExclBest = bestMonth ? months.filter(m => m.kuukausi !== bestMonth.kuukausi) : months
  const avg = (arr: number[]) => arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : 0
  const nettoForecast = Math.round(avg(monthsExclBest.map(m=>m.netto)) * 12)
  const fsecKplForecast = Math.round(avg(monthsExclBest.map(m=>m.fsecKpl)) * 12)
  const fsecPassiiviForecast = Math.round(avg(monthsExclBest.map(m=>m.fsecPassiivi)))

  const liittTrendCoef = linearTrend(months.map(m=>m.liittKpl))
  const fsecTrendCoef = linearTrend(months.map(m=>m.fsecKpl))
  const monthsWithTrend = months.map((m,i) => ({
    ...m,
    liittTrendi: Math.round(liittTrendCoef.intercept + liittTrendCoef.slope * i),
    fsecTrendi: Math.round(fsecTrendCoef.intercept + fsecTrendCoef.slope * i),
  }))

  if (loading) return (
    <div style={{minHeight:'100vh',background:'#f8f8f6',fontFamily:'system-ui,sans-serif'}}>
      <TopBar activePage="/trendit" />
      <div style={{textAlign:'center',padding:60,color:'#888',fontSize:14}}>Ladataan kuukausidataa...</div>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:'#f8f8f6',fontFamily:'system-ui,sans-serif'}}>
      <TopBar activePage="/trendit" />
      <div style={{maxWidth:900,margin:'0 auto',padding:'16px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:8,marginBottom:16}}>
          {[
            {l:'Paras kuukausi', v: bestMonth?.kuukausi ?? '-', s: fmt(bestMonth?.netto ?? 0)},
            {l:'Keskiarvo/kk', v: fmt(avgNetto), s:'netto'},
            {l:`Yhteensä ${months.length} kk`, v: fmt(totalNetto), s:'kumulatiivinen'},
          ].map((k,i) => (
            <div key={i} style={{background:'#f1f0ee',borderRadius:10,padding:'12px 14px'}}>
              <div style={{fontSize:11,color:'#888',marginBottom:3}}>{k.l}</div>
              <div style={{fontSize:18,fontWeight:500,color:'#111'}}>{k.v}</div>
              <div style={{fontSize:11,color:'#aaa',marginTop:2}}>{k.s}</div>
            </div>
          ))}
        </div>
        <div style={{background:'white',border:'0.5px solid #eee',borderRadius:12,padding:'16px',marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:12}}>Vuosiennuste <span style={{textTransform:'none',fontWeight:400}}>— keskiarvo/kk, paras kuukausi pois laskuista</span></div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:8}}>
            {[
              {l:'Nettomyynti', v: fmt(nettoForecast), c:'#185FA5', s:'12 kk'},
              {l:'F-Secure asiakkuudet', v: `${fmtN(fsecKplForecast)} kpl`, c:'#0F6E56', s:'12 kk'},
              {l:'Kk-passiivitulo', v: fmt(fsecPassiiviForecast), c:'#0F6E56', s:'kuukaudessa'},
            ].map((k,i) => (
              <div key={i} style={{background:'#f8f8f6',borderRadius:10,padding:'12px 14px'}}>
                <div style={{fontSize:11,color:'#888',marginBottom:3}}>{k.l}</div>
                <div style={{fontSize:18,fontWeight:500,color:k.c}}>{k.v}</div>
                <div style={{fontSize:11,color:'#aaa',marginTop:2}}>{k.s}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{background:'white',border:'0.5px solid #eee',borderRadius:12,padding:'16px',marginBottom:12}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.5px'}}>Netto vs Työkulu</div>
            <div style={{fontSize:12,fontWeight:500,color:avgErotusPct>=0?'#3B6D11':'#A32D2D'}}>
              Netto {avgErotusPct>=0?'+':''}{avgErotusPct} % työkuluun nähden (ka.)
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={months}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="kuukausi" tick={{fontSize:11}} />
              <YAxis tick={{fontSize:11}} tickFormatter={v => v/1000+'k'} />
              <Tooltip formatter={(v:number) => fmt(v)} />
              <Legend wrapperStyle={{fontSize:11}} />
              <Bar dataKey="netto" name="Netto" fill="#185FA5" radius={[4,4,0,0]} />
              <Bar dataKey="tyokulu" name="Työkulu" fill="#e5e7eb" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(360px,1fr))',gap:12,marginBottom:12}}>
          <div style={{background:'white',border:'0.5px solid #eee',borderRadius:12,padding:'16px'}}>
            <div style={{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:12}}>Liittymät trendi</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthsWithTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="kuukausi" tick={{fontSize:11}} />
                <YAxis tick={{fontSize:11}} />
                <Tooltip />
                <Legend wrapperStyle={{fontSize:11}} />
                <Line type="monotone" dataKey="liittKpl" name="Liittymät" stroke="#185FA5" strokeWidth={2} dot={{r:4}} />
                <Line type="linear" dataKey="liittTrendi" name="Trendi (lineaarinen)" stroke="#185FA5" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{background:'white',border:'0.5px solid #eee',borderRadius:12,padding:'16px'}}>
            <div style={{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:12}}>F-Secure trendi</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthsWithTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="kuukausi" tick={{fontSize:11}} />
                <YAxis tick={{fontSize:11}} />
                <Tooltip />
                <Legend wrapperStyle={{fontSize:11}} />
                <Line type="monotone" dataKey="fsecKpl" name="F-Secure" stroke="#0F6E56" strokeWidth={2} dot={{r:4}} />
                <Line type="linear" dataKey="fsecTrendi" name="Trendi (lineaarinen)" stroke="#0F6E56" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={{background:'white',border:'0.5px solid #eee',borderRadius:12,overflow:'hidden'}}>
          <div style={{padding:'10px 14px',borderBottom:'0.5px solid #eee'}}>
            <span style={{fontWeight:500,fontSize:14}}>Kuukausipalkki</span>
          </div>
          <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{borderBottom:'0.5px solid #eee'}}>
                {['Kuukausi','Liitt kpl','Provisio','F-Sec kpl','F-Sec passiivitulo','Kassakate','Työkulu','Netto'].map(h=>(
                  <th key={h} style={{textAlign: h==='Kuukausi'?'left':'right',padding:'8px 12px',color:'#888',fontWeight:500,fontSize:11,whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map(m=>(
                <tr key={m.kuukausi} style={{borderBottom:'0.5px solid #f5f5f5'}}>
                  <td style={{padding:'7px 12px',fontWeight:500}}>{m.kuukausi}</td>
                  <td style={{padding:'7px 12px',textAlign:'right'}}>{m.liittKpl}</td>
                  <td style={{padding:'7px 12px',textAlign:'right',color:'#185FA5'}}>{fmt(m.liittEur)}</td>
                  <td style={{padding:'7px 12px',textAlign:'right',color:'#0F6E56'}}>{m.fsecKpl}</td>
                  <td style={{padding:'7px 12px',textAlign:'right',color:'#0F6E56'}}>{fmt(m.fsecPassiivi)}</td>
                  <td style={{padding:'7px 12px',textAlign:'right'}}>{fmt(m.kassa)}</td>
                  <td style={{padding:'7px 12px',textAlign:'right',color:'#888'}}>{fmt(m.tyokulu)}</td>
                  <td style={{padding:'7px 12px',textAlign:'right',fontWeight:500,color:m.netto>0?'#3B6D11':'#A32D2D'}}>{fmt(m.netto)}</td>
                </tr>
              ))}
              <tr style={{background:'#f8f8f6',borderTop:'1px solid #eee'}}>
                <td style={{padding:'7px 12px',fontWeight:600}}>Yhteensä</td>
                <td style={{padding:'7px 12px',textAlign:'right',fontWeight:600}}>{months.reduce((s,m)=>s+m.liittKpl,0)}</td>
                <td style={{padding:'7px 12px',textAlign:'right',fontWeight:600,color:'#185FA5'}}>{fmt(months.reduce((s,m)=>s+m.liittEur,0))}</td>
                <td style={{padding:'7px 12px',textAlign:'right',fontWeight:600,color:'#0F6E56'}}>{months.reduce((s,m)=>s+m.fsecKpl,0)}</td>
                <td style={{padding:'7px 12px',textAlign:'right',fontWeight:600,color:'#0F6E56'}}>{fmt(months.reduce((s,m)=>s+m.fsecPassiivi,0))}</td>
                <td style={{padding:'7px 12px',textAlign:'right',fontWeight:600}}>{fmt(months.reduce((s,m)=>s+m.kassa,0))}</td>
                <td style={{padding:'7px 12px',textAlign:'right',fontWeight:600,color:'#888'}}>{fmt(months.reduce((s,m)=>s+m.tyokulu,0))}</td>
                <td style={{padding:'7px 12px',textAlign:'right',fontWeight:600,color:'#3B6D11'}}>{fmt(totalNetto)}</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  )
}
