'use client'
import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, LabelList } from 'recharts'

interface ReceiptStore {
  liittymat: number; fsecEur: number; bonus: number; kassakate: number; huoltokate: number; rescueKate: number
}

interface KassamyyntiRow {
  kassakate: number; huoltokate: number; rescueKate: number; ostorahdit: number; rjmobOy: number
}

interface ReceiptsMonth {
  year: number
  monthNum: number
  kuukausi: string
  totals: {
    liittymat: number; kassakate: number; huoltokate: number; rescueKate: number
    provisio: number; netto: number; fsecAsiakkuudet: number; fsecPassiivitulo: number
    fsecEur: number; bonus: number; maksettavaSumma: number; alv0: number; tyontekijatKulu: number
  }
  stores: Record<string, ReceiptStore>
  kassamyynti: Record<string, KassamyyntiRow>
}

interface SalesStore {
  liittKpl: number; liittEur: number; fsecKpl: number; fsecEur: number; kassa: number; kassaRjmob: number; tunnit: number
}

interface SalesMonth {
  year: number
  monthNum: number
  kuukausi: string
  stores: Record<string, SalesStore>
}

interface DriveFile {
  id: string; name: string; mimeType: string; year?: number | null
}

const FINNISH_MONTHS = ['Tammikuu','Helmikuu','Maaliskuu','Huhtikuu','Toukokuu','Kesäkuu','Heinäkuu','Elokuu','Syyskuu','Lokakuu','Marraskuu','Joulukuu']
const CANONICAL_STORES = ['Malmi', 'Easton', 'Kivistö', 'Holma', 'Syke']
const STORE_DISPLAY_NAME: Record<string, string> = {
  Malmi: 'Helsinki Malmi', Easton: 'Helsinki Easton', Kivistö: 'Vantaa Kivistö', Holma: 'Lahti Holma', Syke: 'Lahti Syke',
}
const STORE_COLORS: Record<string, string> = {
  Malmi: '#ef4444', Easton: '#f97316', Kivistö: '#eab308', Holma: '#22c55e', Syke: '#3b82f6',
}

function parseMonthNum(name: string): number {
  const m = name.match(/(\d{1,2})\./)
  return m ? Number(m[1]) : 0
}

function parseYear(name: string): number | null {
  const m = name.match(/(\d{4})/)
  return m ? Number(m[1]) : null
}

// Maksukuitti-/myyntiseurantatiedostoissa ei aina ole vuotta nimessä — päätellään kuluvasta
// päivämäärästä: tulevaisuudessa oleva kuukausi (esim. joulukuu heinäkuussa katsottuna) on
// todennäköisesti viime vuodelta. Drive-vuosikansion nimi (api/receipts) on ensisijainen lähde.
function inferYear(monthNum: number, explicitYear: number | null): number {
  if (explicitYear) return explicitYear
  const today = new Date()
  return monthNum <= today.getMonth() + 1 ? today.getFullYear() : today.getFullYear() - 1
}

function monthKey(year: number, monthNum: number): string {
  return `${year}-${monthNum}`
}

function monthLabel(monthNum: number): string {
  return `${monthNum}. ${FINNISH_MONTHS[monthNum - 1] ?? '?'}`
}

// Sallii sekä täsmällisen ("Malmi") että kaupunkietuliitteellisen ("Helsinki, Malmi") avaimen —
// maksukuitit ja myyntiseurannat nimeävät myymälät hieman eri tavalla.
function findStoreKey(stores: Record<string, unknown> | undefined, canonical: string): string | undefined {
  if (!stores) return undefined
  return Object.keys(stores).find(k => k.toLowerCase().includes(canonical.toLowerCase()))
}

function TopBar({ activePage }: { activePage: string }) {
  return (
    <div style={{background:'white', borderBottom:'0.5px solid #eee', padding:'0 16px', display:'flex', alignItems:'center', height:48, position:'sticky', top:0, zIndex:10, gap:0}}>
      <a href="/" style={{fontWeight:700, fontSize:15, color:'#111', marginRight:24, whiteSpace:'nowrap', textDecoration:'none'}}>RJ-Mob</a>
      {[
        {label:'Tuottoseuranta', href:'/tuotto'},
        {label:'Trendit', href:'/trendit'},
        {label:'Kassamyynti', href:'/kassamyynti'},
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

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div style={{background:'white', border:'0.5px solid #eee', borderRadius:12, padding:'16px', marginBottom:12}}>
      <div style={{fontSize:11, fontWeight:500, color:'#888', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:12}}>
        {title} {note && <span style={{textTransform:'none', fontWeight:400}}>{note}</span>}
      </div>
      {children}
    </div>
  )
}

export default function TrendPage() {
  const [receiptsMonths, setReceiptsMonths] = useState<ReceiptsMonth[]>([])
  const [salesMonths, setSalesMonths] = useState<SalesMonth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [view4, setView4] = useState<'maksukuitit' | 'myyntiseurannat'>('maksukuitit')

  // Kaikki maksukuitit ja myyntiseurannat ladataan kerralla sivun latautuessa (ei yksitellen
  // toggle-painikkeiden mukaan) — yksittäisen kuukauden virhe ohitetaan ja muut näytetään silti.
  useEffect(() => {
    Promise.all([
      fetch('/api/receipts').then(r => r.json()),
      fetch('/api/files').then(r => r.json()),
    ]).then(async ([receiptsListRes, salesListRes]) => {
      if (receiptsListRes.error && !receiptsListRes.files?.length) { setError(receiptsListRes.error); setLoading(false); return }

      const receiptFiles = (receiptsListRes.files ?? []) as DriveFile[]
      const salesFiles = (salesListRes.files ?? []) as DriveFile[]

      const [receiptResults, salesResults] = await Promise.all([
        Promise.all(receiptFiles.map(f => fetch(`/api/receipts?fileId=${f.id}`).then(r => r.json()).then(d => ({ f, d })).catch(() => ({ f, d: { error: 'fetch failed' } })))),
        Promise.all(salesFiles.map(f => fetch(`/api/sheets?fileId=${f.id}`).then(r => r.json()).then(d => ({ f, d })).catch(() => ({ f, d: { error: 'fetch failed' } })))),
      ])

      const rMonths: ReceiptsMonth[] = []
      for (const { f, d } of receiptResults) {
        if (d.error || !d.totals) continue // yksittäinen epäonnistunut kuukausi ohitetaan
        const monthNum = parseMonthNum(f.name)
        const year = f.year ?? inferYear(monthNum, parseYear(f.name))
        rMonths.push({
          year, monthNum,
          kuukausi: monthLabel(monthNum),
          totals: d.totals,
          stores: d.stores ?? {},
          kassamyynti: d.kassamyynti ?? {},
        })
      }
      rMonths.sort((a, b) => (a.year - b.year) || (a.monthNum - b.monthNum))

      const sMonths: SalesMonth[] = []
      for (const { f, d } of salesResults) {
        if (d.error || !d.stores) continue
        const monthNum = parseMonthNum(f.name)
        const year = inferYear(monthNum, parseYear(f.name))
        sMonths.push({ year, monthNum, kuukausi: monthLabel(monthNum), stores: d.stores })
      }
      sMonths.sort((a, b) => (a.year - b.year) || (a.monthNum - b.monthNum))

      setReceiptsMonths(rMonths)
      setSalesMonths(sMonths)
      setLoading(false)
    }).catch(e => { setError(String(e)); setLoading(false) })
  }, [])

  const fmt = (n: number) => Math.round(n).toLocaleString('fi-FI') + ' €'
  const fmtN = (n: number) => Math.round(n).toLocaleString('fi-FI')

  const receiptsByKey = new Map(receiptsMonths.map(m => [monthKey(m.year, m.monthNum), m]))
  const salesByKey = new Map(salesMonths.map(m => [monthKey(m.year, m.monthNum), m]))

  const availableYears = Array.from(new Set(receiptsMonths.map(m => m.year))).sort((a, b) => b - a)
  useEffect(() => {
    if (selectedYear === null && availableYears.length > 0) setSelectedYear(availableYears[0])
  }, [availableYears, selectedYear]) // eslint-disable-line react-hooks/exhaustive-deps

  const yearMonths = selectedYear !== null ? receiptsMonths.filter(m => m.year === selectedYear) : []
  const latestMonth = yearMonths.length ? yearMonths[yearMonths.length - 1] : null

  const salesYearMonths = selectedYear !== null ? salesMonths.filter(m => m.year === selectedYear) : []
  const latestSalesMonth = salesYearMonths.length ? salesYearMonths[salesYearMonths.length - 1] : null

  // ---- OSIO 1 + OSIO 2: kaikki RJ-Mob tulot yhteensä (Yhteenveto-taulukosta) — sama kaava
  // molemmissa osioissa (Osio 1 = vuoden summa, Osio 2 = kuukausittain).
  const moneyIn = (m: ReceiptsMonth) => m.totals.liittymat + m.totals.kassakate + m.totals.fsecEur + m.totals.fsecPassiivitulo + m.totals.bonus
  const moneyOut = (m: ReceiptsMonth) => m.totals.tyontekijatKulu

  const liikevaihto = yearMonths.reduce((s, m) => s + moneyIn(m), 0)
  const liiketulos = yearMonths.reduce((s, m) => s + m.totals.maksettavaSumma, 0)
  const fsecPassiiviVuosi = yearMonths.reduce((s, m) => s + m.totals.fsecPassiivitulo, 0)
  const fsecLisenssitNyt = latestMonth?.totals.fsecAsiakkuudet ?? 0
  const arvioLoppuvuodesta = yearMonths.length ? (liikevaihto / yearMonths.length) * 12 : 0

  // ---- OSIO 2: Money In vs Money Out kuukausittain, %-muutos edelliseen kuukauteen ----
  const moneyData = yearMonths.map((m, i) => {
    const prev = i > 0 ? yearMonths[i - 1] : null
    const pctChange = (curr: number, prevVal: number | undefined) =>
      prevVal === undefined || prevVal === 0 ? undefined : Math.round((curr - prevVal) / Math.abs(prevVal) * 100)
    const inPct = prev ? pctChange(moneyIn(m), moneyIn(prev)) : undefined
    const outPct = prev ? pctChange(moneyOut(m), moneyOut(prev)) : undefined
    return {
      kuukausi: m.kuukausi,
      moneyIn: Math.round(moneyIn(m)),
      moneyOut: Math.round(moneyOut(m)),
      inLabel: inPct !== undefined ? `${inPct >= 0 ? '+' : ''}${inPct}%` : '',
      outLabel: outPct !== undefined ? `${outPct >= 0 ? '+' : ''}${outPct}%` : '',
    }
  })

  // ---- OSIO 3: kokonaistulos per myymälä (liittymät+kassamyynti+F-Secure+bonukset, EI passiivi/kulut) ----
  const tulosSeurantaData = yearMonths.map(m => {
    const point: Record<string, string | number> = { kuukausi: m.kuukausi }
    for (const store of CANONICAL_STORES) {
      const key = findStoreKey(m.stores, store)
      const s = key ? m.stores[key] : undefined
      if (s) point[store] = Math.round(s.liittymat + s.kassakate + s.fsecEur + s.bonus)
    }
    return point
  })

  // ---- OSIO 4: myymäläkohtainen trendiseuranta — viimeisin kk vs sama kk viime vuonna ----
  const lastYearReceipts = latestMonth ? receiptsByKey.get(monthKey(latestMonth.year - 1, latestMonth.monthNum)) : undefined
  const lastYearSales = latestSalesMonth ? salesByKey.get(monthKey(latestSalesMonth.year - 1, latestSalesMonth.monthNum)) : undefined

  // Kaavio A — Liittymät per myymälä: viimeisin kk vs sama kk viime vuonna
  const kaavioA = CANONICAL_STORES.map(store => {
    const key = findStoreKey(latestMonth?.stores, store)
    const lastKey = findStoreKey(lastYearReceipts?.stores, store)
    return {
      myymala: STORE_DISPLAY_NAME[store],
      tamaKk: key && latestMonth ? latestMonth.stores[key].liittymat : undefined,
      viimeVuosi: lastKey && lastYearReceipts ? lastYearReceipts.stores[lastKey].liittymat : undefined,
    }
  })

  // Kaavio B — Kassakate per myymälä (Kassakate / Rescue kate / Huoltokate), viimeisin kk
  const kaavioB = CANONICAL_STORES.map(store => {
    const key = findStoreKey(latestMonth?.kassamyynti, store)
    const row = key && latestMonth ? latestMonth.kassamyynti[key] : undefined
    return {
      myymala: STORE_DISPLAY_NAME[store],
      kassakate: row?.kassakate,
      rescueKate: row?.rescueKate,
      huoltokate: row?.huoltokate,
    }
  })

  // Kaavio C — F-Secure (koko yritys, ei myymäläkohtainen): Passiivitulo € ja Lisenssit kpl kuukausittain
  const kaavioC = yearMonths.map(m => ({
    kuukausi: m.kuukausi,
    passiivitulo: Math.round(m.totals.fsecPassiivitulo),
    lisenssit: m.totals.fsecAsiakkuudet,
  }))

  // Myyntiseurannat-näkymä: samat vertailut (viimeisin kk vs sama kk viime vuonna) myyntiseuranta-datasta
  const kaavioD = CANONICAL_STORES.map(store => {
    const key = findStoreKey(latestSalesMonth?.stores, store)
    const lastKey = findStoreKey(lastYearSales?.stores, store)
    return {
      myymala: STORE_DISPLAY_NAME[store],
      tamaKk: key && latestSalesMonth ? latestSalesMonth.stores[key].liittEur : undefined,
      viimeVuosi: lastKey && lastYearSales ? lastYearSales.stores[lastKey].liittEur : undefined,
    }
  })
  const kaavioE = CANONICAL_STORES.map(store => {
    const key = findStoreKey(latestSalesMonth?.stores, store)
    const lastKey = findStoreKey(lastYearSales?.stores, store)
    return {
      myymala: STORE_DISPLAY_NAME[store],
      tamaKk: key && latestSalesMonth ? latestSalesMonth.stores[key].kassa : undefined,
      viimeVuosi: lastKey && lastYearSales ? lastYearSales.stores[lastKey].kassa : undefined,
    }
  })
  const kaavioF = CANONICAL_STORES.map(store => {
    const key = findStoreKey(latestSalesMonth?.stores, store)
    const lastKey = findStoreKey(lastYearSales?.stores, store)
    return {
      myymala: STORE_DISPLAY_NAME[store],
      tamaKk: key && latestSalesMonth ? latestSalesMonth.stores[key].fsecKpl : undefined,
      viimeVuosi: lastKey && lastYearSales ? lastYearSales.stores[lastKey].fsecKpl : undefined,
    }
  })

  if (loading) return (
    <div style={{minHeight:'100vh',background:'#f8f8f6',fontFamily:'system-ui,sans-serif'}}>
      <TopBar activePage="/trendit" />
      <div style={{textAlign:'center',padding:60,color:'#888',fontSize:14}}>Ladataan kuukausidataa...</div>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:'#f8f8f6',fontFamily:'system-ui,sans-serif'}}>
      <TopBar activePage="/trendit" />
      <div style={{maxWidth:1000,margin:'0 auto',padding:'16px'}}>
        {error && <div style={{background:'#FCEBEB',border:'0.5px solid #F09595',borderRadius:10,padding:12,marginBottom:12,fontSize:13,color:'#A32D2D'}}><strong>Virhe:</strong> {error}</div>}

        {availableYears.length > 1 && (
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,flexWrap:'wrap'}}>
            <span style={{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.5px'}}>Vuosi</span>
            {availableYears.map(y => (
              <button key={y} onClick={() => setSelectedYear(y)}
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

        {/* OSIO 1 — Yhteenveto */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:8,marginBottom:16}}>
          {[
            {l:`Liikevaihto (${selectedYear ?? ''})`, v: fmt(liikevaihto), s:'liittymät + kassamyynti + F-Secure + bonukset + passiivitulo'},
            {l:`Liiketulos (${selectedYear ?? ''})`, v: fmt(liiketulos), s:'maksutaulukosta, koko vuosi', c:'#185FA5'},
            {l:'F-Secure passiivitulo, koko vuosi', v: fmt(fsecPassiiviVuosi), s:'passiivitulo-taulukosta', c:'#0F6E56'},
            {l:'F-Secure lisenssit', v: `${fmtN(fsecLisenssitNyt)} kpl`, s: latestMonth ? `viimeisin: ${latestMonth.kuukausi}` : '-', c:'#0F6E56'},
            {l:'Arvio loppuvuodesta', v: fmt(arvioLoppuvuodesta), s:`${yearMonths.length} kk → koko vuosi (run rate)`, c:'#185FA5'},
          ].map((k,i) => (
            <div key={i} style={{background:'#f1f0ee',borderRadius:10,padding:'12px 14px'}}>
              <div style={{fontSize:11,color:'#888',marginBottom:3}}>{k.l}</div>
              <div style={{fontSize:18,fontWeight:500,color:k.c ?? '#111'}}>{k.v}</div>
              <div style={{fontSize:11,color:'#aaa',marginTop:2}}>{k.s}</div>
            </div>
          ))}
        </div>

        {/* OSIO 2 — Money In vs Money Out */}
        <Card title="Money in vs Money out" note="— kuukausittain, maksukuitista">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={moneyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="kuukausi" tick={{fontSize:11}} />
              <YAxis tick={{fontSize:11}} tickFormatter={v => v/1000+'k'} />
              <Tooltip formatter={(v:number) => fmt(v)} />
              <Legend wrapperStyle={{fontSize:11}} />
              <Bar dataKey="moneyIn" name="Money in" fill="#185FA5" radius={[4,4,0,0]}>
                <LabelList dataKey="inLabel" position="top" style={{fontSize:9,fill:'#185FA5'}} />
              </Bar>
              <Bar dataKey="moneyOut" name="Money out" fill="#9ca3af" radius={[4,4,0,0]}>
                <LabelList dataKey="outLabel" position="top" style={{fontSize:9,fill:'#666'}} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* OSIO 3 — Tulos seuranta myymälöittäin */}
        <Card title="Tulos seuranta myymälöittäin" note="— liittymät + kassamyynti + F-Secure + bonukset (ei passiivituloa, ei työntekijäkuluja)">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={tulosSeurantaData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="kuukausi" tick={{fontSize:11}} />
              <YAxis tick={{fontSize:11}} tickFormatter={v => v/1000+'k'} />
              <Tooltip formatter={(v:number) => fmt(v)} />
              <Legend wrapperStyle={{fontSize:11}} />
              {CANONICAL_STORES.map(store => (
                <Line key={store} type="monotone" dataKey={store} name={STORE_DISPLAY_NAME[store]} stroke={STORE_COLORS[store]} strokeWidth={2} dot={{r:3}} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* OSIO 4 — Myymäläkohtainen trendiseuranta */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
          <span style={{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.5px'}}>Trendiseuranta</span>
          {(['maksukuitit', 'myyntiseurannat'] as const).map(opt => (
            <button key={opt} onClick={() => setView4(opt)}
              style={{
                padding:'5px 12px',borderRadius:8,border:'0.5px solid #ddd',cursor:'pointer',fontSize:12,
                fontWeight: view4===opt?500:400,
                background: view4===opt?'#185FA5':'white',
                color: view4===opt?'white':'#555',
                textTransform:'capitalize',
              }}>
              {opt === 'maksukuitit' ? 'Maksukuitit' : 'Myyntiseurannat'}
            </button>
          ))}
        </div>

        {view4 === 'maksukuitit' ? (<>
          <Card title="Liittymät per myymälä" note={`— ${latestMonth?.kuukausi ?? ''} vs sama kk viime vuonna`}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={kaavioA}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="myymala" tick={{fontSize:11}} />
                <YAxis tick={{fontSize:11}} />
                <Tooltip formatter={(v:number) => fmt(v)} />
                <Legend wrapperStyle={{fontSize:11}} />
                <Line type="monotone" dataKey="tamaKk" name="Tämä kk" stroke="#185FA5" strokeWidth={2} dot={{r:4}} connectNulls />
                <Line type="monotone" dataKey="viimeVuosi" name="Viime vuosi" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 3" dot={{r:3}} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Kassakate per myymälä" note={`— ${latestMonth?.kuukausi ?? ''}`}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={kaavioB}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="myymala" tick={{fontSize:11}} />
                <YAxis tick={{fontSize:11}} />
                <Tooltip formatter={(v:number) => fmt(v)} />
                <Legend wrapperStyle={{fontSize:11}} />
                <Line type="monotone" dataKey="kassakate" name="Kassakate" stroke="#185FA5" strokeWidth={2} dot={{r:3}} connectNulls />
                <Line type="monotone" dataKey="rescueKate" name="Rescue kate" stroke="#0F6E56" strokeWidth={2} dot={{r:3}} connectNulls />
                <Line type="monotone" dataKey="huoltokate" name="Huoltokate" stroke="#EF9F27" strokeWidth={2} dot={{r:3}} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card title="F-Secure" note="— passiivitulo € ja lisenssit kpl, koko yritys">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={kaavioC}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="kuukausi" tick={{fontSize:11}} />
                <YAxis yAxisId="eur" tick={{fontSize:11}} tickFormatter={v => v/1000+'k'} />
                <YAxis yAxisId="kpl" orientation="right" tick={{fontSize:11}} />
                <Tooltip formatter={(v:number, name: string) => name === 'Lisenssit (kpl)' ? `${fmtN(v)} kpl` : fmt(v)} />
                <Legend wrapperStyle={{fontSize:11}} />
                <Line yAxisId="eur" type="monotone" dataKey="passiivitulo" name="Passiivitulo (€)" stroke="#185FA5" strokeWidth={2} dot={{r:3}} connectNulls />
                <Line yAxisId="kpl" type="monotone" dataKey="lisenssit" name="Lisenssit (kpl)" stroke="#0F6E56" strokeWidth={2} dot={{r:3}} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </>) : (<>
          <Card title="Liittymät brutto € per myymälä" note={`— ${latestSalesMonth?.kuukausi ?? ''} vs sama kk viime vuonna`}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={kaavioD}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="myymala" tick={{fontSize:11}} />
                <YAxis tick={{fontSize:11}} />
                <Tooltip formatter={(v:number) => fmt(v)} />
                <Legend wrapperStyle={{fontSize:11}} />
                <Line type="monotone" dataKey="tamaKk" name="Tämä kk" stroke="#185FA5" strokeWidth={2} dot={{r:4}} connectNulls />
                <Line type="monotone" dataKey="viimeVuosi" name="Viime vuosi" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 3" dot={{r:3}} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Kassakate per myymälä" note={`— ${latestSalesMonth?.kuukausi ?? ''} vs sama kk viime vuonna`}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={kaavioE}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="myymala" tick={{fontSize:11}} />
                <YAxis tick={{fontSize:11}} />
                <Tooltip formatter={(v:number) => fmt(v)} />
                <Legend wrapperStyle={{fontSize:11}} />
                <Line type="monotone" dataKey="tamaKk" name="Tämä kk" stroke="#185FA5" strokeWidth={2} dot={{r:4}} connectNulls />
                <Line type="monotone" dataKey="viimeVuosi" name="Viime vuosi" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 3" dot={{r:3}} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card title="F-Secure kpl per myymälä" note={`— ${latestSalesMonth?.kuukausi ?? ''} vs sama kk viime vuonna`}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={kaavioF}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="myymala" tick={{fontSize:11}} />
                <YAxis tick={{fontSize:11}} />
                <Tooltip formatter={(v:number) => `${fmtN(v)} kpl`} />
                <Legend wrapperStyle={{fontSize:11}} />
                <Line type="monotone" dataKey="tamaKk" name="Tämä kk" stroke="#185FA5" strokeWidth={2} dot={{r:4}} connectNulls />
                <Line type="monotone" dataKey="viimeVuosi" name="Viime vuosi" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 3" dot={{r:3}} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </>)}
      </div>
    </div>
  )
}
