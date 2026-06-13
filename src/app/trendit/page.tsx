'use client'
import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'

interface MonthData {
  kuukausi: string
  netto: number
  brutto: number
  liittKpl: number
  fsecKpl: number
  tyokulu: number
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

function TopBar({ activePage }: { activePage: string }) {
  return (
    <div style={{background:'white', borderBottom:'0.5px solid #eee', padding:'0 16px', display:'flex', alignItems:'center', height:48, position:'sticky', top:0, zIndex:10, gap:0}}>
      <a href="/" style={{fontWeight:700, fontSize:15, color:'#111', marginRight:24, whiteSpace:'nowrap', textDecoration:'none'}}>RJ-Mob</a>
      {[
        {label:'Tuottoseuranta', href:'/tuotto'},
        {label:'Trendit', href:'/trendit'},
        {label:'Myyntiseuranta', href:'/etela'},
        {label:'Run Rate', href:'/runrate'},
        {label:'Laskuri', href:'/laskuri'},
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
            results.push({
              kuukausi: f.name.replace('Myyntiseuranta ', '').replace(' 2026', ''),
              netto: Math.round(data.totals.netto),
              brutto: Math.round(data.totals.rjmobTulo),
              liittKpl: data.totals.liittKpl,
              fsecKpl: data.totals.fsecKpl,
              tyokulu: Math.round(data.totals.tyokulu),
            })
          }
        }
        setMonths(results)
        setLoading(false)
      })
  }, [])

  const fmt = (n: number) => Math.round(n).toLocaleString('fi-FI') + ' €'
  const avgNetto = months.length ? Math.round(months.reduce((s,m) => s+m.netto, 0) / months.length) : 0
  const totalNetto = months.reduce((s,m) => s+m.netto, 0)
  const yearEstimate = Math.round(avgNetto * 12)
  const bestMonth = months.length ? months.reduce((a,b) => a.netto > b.netto ? a : b) : null

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
            {l:'Vuosiennuste', v: fmt(yearEstimate), c:'#185FA5', s:`perustuu ${months.length} kk`},
            {l:`Yhteensä ${months.length} kk`, v: fmt(totalNetto), s:'kumulatiivinen'},
          ].map((k,i) => (
            <div key={i} style={{background:'#f1f0ee',borderRadius:10,padding:'12px 14px'}}>
              <div style={{fontSize:11,color:'#888',marginBottom:3}}>{k.l}</div>
              <div style={{fontSize:18,fontWeight:500,color:k.c??'#111'}}>{k.v}</div>
              <div style={{fontSize:11,color:'#aaa',marginTop:2}}>{k.s}</div>
            </div>
          ))}
        </div>
        <div style={{background:'white',border:'0.5px solid #eee',borderRadius:12,padding:'16px',marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:12}}>Netto vs Työkulu</div>
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
        <div style={{background:'white',border:'0.5px solid #eee',borderRadius:12,padding:'16px',marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:12}}>Liittymät & F-Secure trendi</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={months}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="kuukausi" tick={{fontSize:11}} />
              <YAxis tick={{fontSize:11}} />
              <Tooltip />
              <Legend wrapperStyle={{fontSize:11}} />
              <Line type="monotone" dataKey="liittKpl" name="Liittymät" stroke="#185FA5" strokeWidth={2} dot={{r:4}} />
              <Line type="monotone" dataKey="fsecKpl" name="F-Secure" stroke="#0F6E56" strokeWidth={2} dot={{r:4}} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{background:'white',border:'0.5px solid #eee',borderRadius:12,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{borderBottom:'0.5px solid #eee'}}>
                {['Kuukausi','Liitt','F-Sec','Brutto','Työkulu','Netto'].map(h=>(
                  <th key={h} style={{textAlign: h==='Kuukausi'?'left':'right',padding:'8px 12px',color:'#888',fontWeight:500,fontSize:11}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map(m=>(
                <tr key={m.kuukausi} style={{borderBottom:'0.5px solid #f5f5f5'}}>
                  <td style={{padding:'7px 12px',fontWeight:500}}>{m.kuukausi}</td>
                  <td style={{padding:'7px 12px',textAlign:'right'}}>{m.liittKpl}</td>
                  <td style={{padding:'7px 12px',textAlign:'right',color:'#0F6E56'}}>{m.fsecKpl}</td>
                  <td style={{padding:'7px 12px',textAlign:'right'}}>{fmt(m.brutto)}</td>
                  <td style={{padding:'7px 12px',textAlign:'right',color:'#888'}}>{fmt(m.tyokulu)}</td>
                  <td style={{padding:'7px 12px',textAlign:'right',fontWeight:500,color:m.netto>0?'#3B6D11':'#A32D2D'}}>{fmt(m.netto)}</td>
                </tr>
              ))}
              <tr style={{background:'#f8f8f6',borderTop:'1px solid #eee'}}>
                <td style={{padding:'7px 12px',fontWeight:600}}>Yhteensä</td>
                <td style={{padding:'7px 12px',textAlign:'right',fontWeight:600}}>{months.reduce((s,m)=>s+m.liittKpl,0)}</td>
                <td style={{padding:'7px 12px',textAlign:'right',fontWeight:600,color:'#0F6E56'}}>{months.reduce((s,m)=>s+m.fsecKpl,0)}</td>
                <td style={{padding:'7px 12px',textAlign:'right',fontWeight:600}}>{fmt(months.reduce((s,m)=>s+m.brutto,0))}</td>
                <td style={{padding:'7px 12px',textAlign:'right',fontWeight:600,color:'#888'}}>{fmt(months.reduce((s,m)=>s+m.tyokulu,0))}</td>
                <td style={{padding:'7px 12px',textAlign:'right',fontWeight:600,color:'#3B6D11'}}>{fmt(totalNetto)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
