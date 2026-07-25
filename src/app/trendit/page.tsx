'use client'
import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, LabelList, Cell } from 'recharts'

interface ReceiptStore {
  liittymat: number; fsecEur: number; kassakate: number; huoltokate: number; rescueKate: number
}

interface ReceiptsMonth {
  year: number
  monthNum: number
  kuukausi: string
  totals: {
    liittymat: number; kassakate: number; huoltokate: number; rescueKate: number
    provisio: number; netto: number; fsecAsiakkuudet: number; fsecPassiivitulo: number
    tyontekijatKulu: number
  }
  stores: Record<string, ReceiptStore>
}

interface SalesStore {
  liittKpl: number; liittEur: number; fsecKpl: number; fsecEur: number; kassa: number; kassaRjmob: number; tunnit: number
}

interface SalesMonth {
  year: number
  monthNum: number
  stores: Record<string, SalesStore>
}

interface DriveFile {
  id: string; name: string; mimeType: string; year?: number | null
}

const FINNISH_MONTHS = ['Tammikuu','Helmikuu','Maaliskuu','Huhtikuu','Toukokuu','Kesäkuu','Heinäkuu','Elokuu','Syyskuu','Lokakuu','Marraskuu','Joulukuu']
const CANONICAL_STORES = ['Malmi', 'Easton', 'Kivistö', 'Holma', 'Syke']
const STORE_TOGGLE_OPTIONS = ['Kaikki myymälät', ...CANONICAL_STORES]
const STORE_COLORS: Record<string, string> = {
  Holma: '#22c55e', Syke: '#3b82f6', Malmi: '#ef4444', Easton: '#f97316', Kivistö: '#eab308', 'Muut myymälät': '#94a3b8',
}
// Payout-viive (verrattuna siihen kuukauteen kun myynti tehtiin myyntiseurannassa):
// liittymäprovisio maksetaan 3 kk myöhässä (myynti → aktivointi kuukausi myöhemmin →
// maksu vielä kuukausi siitä eteenpäin, esim. helmikuun myynti aktivoituu huhtikuussa ja
// maksetaan toukokuun maksukuitissa), kassakate ja F-Secure 1 kk myöhässä.
const PAYOUT_DELAY: Record<'liittymat' | 'kassakate' | 'fsecure', number> = { liittymat: 3, kassakate: 1, fsecure: 1 }

function parseMonthNum(name: string): number {
  const m = name.match(/(\d{1,2})\./)
  return m ? Number(m[1]) : 0
}

function parseYear(name: string): number | null {
  const m = name.match(/(\d{4})/)
  return m ? Number(m[1]) : null
}

// Maksukuittitiedostoissa ei ole vuotta nimessä — päätellään kuluvasta päivämäärästä:
// tulevaisuudessa oleva kuukausi (esim. joulukuu heinäkuussa katsottuna) on todennäköisesti viime vuodelta.
function inferYear(monthNum: number, explicitYear: number | null): number {
  if (explicitYear) return explicitYear
  const today = new Date()
  return monthNum <= today.getMonth() + 1 ? today.getFullYear() : today.getFullYear() - 1
}

function monthKey(year: number, monthNum: number): string {
  return `${year}-${monthNum}`
}

function shiftMonth(year: number, monthNum: number, delta: number): { year: number, monthNum: number } {
  const total = year * 12 + (monthNum - 1) - delta
  return { year: Math.floor(total / 12), monthNum: (((total % 12) + 12) % 12) + 1 }
}

// Onko b tarkalleen a:ta seuraava kalenterikuukausi (huomioi vuodenvaihde). Käytetään F-Secure-
// peruutuslaskennassa: jos kuukausien välissä on aukko (esim. maksukuitti puuttuu), laskentaa
// ei tehdä sille välille, koska erotus näyttäisi silloin virheellisesti usean kuukauden peruutukset.
function isNextMonth(a: { year: number, monthNum: number }, b: { year: number, monthNum: number }): boolean {
  return a.monthNum === 12 ? (b.year === a.year + 1 && b.monthNum === 1) : (b.year === a.year && b.monthNum === a.monthNum + 1)
}

function monthLabel(year: number, monthNum: number, showYear: boolean): string {
  const name = FINNISH_MONTHS[monthNum - 1] ?? '?'
  return showYear ? `${monthNum}. ${name} ${year}` : `${monthNum}. ${name}`
}

// Sallii sekä täsmällisen ("Malmi") että kaupunkietuliitteellisen ("Helsinki, Malmi") avaimen.
function findStoreKey(stores: Record<string, unknown> | undefined, canonical: string): string | undefined {
  if (!stores) return undefined
  return Object.keys(stores).find(k => k.toLowerCase().includes(canonical.toLowerCase()))
}

function sumOrPick<T extends object>(stores: Record<string, T> | undefined, field: keyof T, storeFilter: string): number | undefined {
  if (!stores) return undefined
  const pick = (v: T) => Number(v[field]) || 0
  if (storeFilter === 'Kaikki myymälät') {
    return Object.values(stores).reduce((s, v) => s + pick(v), 0)
  }
  const key = findStoreKey(stores, storeFilter)
  return key ? pick(stores[key]) : undefined
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

interface AreaTrendPoint {
  kuukausi: string
  todellinen?: number
  brutto?: number
  viimeVuosi?: number
}

function TrendAreaChart({ title, data, fmt, showBrutto = true }: { title: string; data: AreaTrendPoint[]; fmt: (n: number) => string; showBrutto?: boolean }) {
  return (
    <div style={{background:'white', border:'0.5px solid #eee', borderRadius:12, padding:'16px'}}>
      <div style={{fontSize:11, fontWeight:500, color:'#888', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:12}}>{title}</div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="kuukausi" tick={{fontSize:11}} />
          <YAxis tick={{fontSize:11}} />
          <Tooltip formatter={(v: number) => fmt(v)} />
          <Legend wrapperStyle={{fontSize:11}} />
          <Line type="monotone" dataKey="todellinen" name="Todellinen" stroke="#185FA5" strokeWidth={2} dot={{r:4}} connectNulls />
          {showBrutto && <Line type="monotone" dataKey="brutto" name="Brutto" stroke="#EF9F27" strokeWidth={1.5} strokeDasharray="5 3" dot={{r:3}} connectNulls />}
          <Line type="monotone" dataKey="viimeVuosi" name="Viime vuosi" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="2 2" dot={{r:3}} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function TrendPage() {
  const [receiptsMonths, setReceiptsMonths] = useState<ReceiptsMonth[]>([])
  const [salesMonths, setSalesMonths] = useState<SalesMonth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [storeFilter, setStoreFilter] = useState('Kaikki myymälät')

  useEffect(() => {
    Promise.all([
      fetch('/api/receipts').then(r => r.json()),
      fetch('/api/files').then(r => r.json()),
    ]).then(async ([receiptsListRes, salesListRes]) => {
      if (receiptsListRes.error && !receiptsListRes.files?.length) { setError(receiptsListRes.error); setLoading(false); return }

      const receiptFiles = (receiptsListRes.files ?? []) as DriveFile[]
      const salesFiles = (salesListRes.files ?? []) as DriveFile[]

      const [receiptResults, salesResults] = await Promise.all([
        Promise.all(receiptFiles.map(f => fetch(`/api/receipts?fileId=${f.id}`).then(r => r.json()).then(d => ({ f, d })))),
        Promise.all(salesFiles.map(f => fetch(`/api/sheets?fileId=${f.id}`).then(r => r.json()).then(d => ({ f, d })))),
      ])

      const rMonths: ReceiptsMonth[] = []
      for (const { f, d } of receiptResults) {
        if (d.error || !d.totals) continue
        const monthNum = parseMonthNum(f.name)
        // Vuosi tulee ensisijaisesti Drive-vuosikansion nimestä (api/receipts merkitsee sen
        // jokaiseen tiedostoon) — arvaus kuukausinumerosta on vain varalähde jos sitä ei löydy.
        const year = f.year ?? inferYear(monthNum, parseYear(f.name))
        rMonths.push({
          year, monthNum,
          kuukausi: monthLabel(year, monthNum, false),
          totals: d.totals,
          stores: d.stores ?? {},
        })
      }
      rMonths.sort((a, b) => (a.year - b.year) || (a.monthNum - b.monthNum))

      const sMonths: SalesMonth[] = []
      for (const { f, d } of salesResults) {
        if (d.error || !d.stores) continue
        const monthNum = parseMonthNum(f.name)
        const year = inferYear(monthNum, parseYear(f.name))
        sMonths.push({ year, monthNum, stores: d.stores })
      }

      setReceiptsMonths(rMonths)
      setSalesMonths(sMonths)
      setLoading(false)
    }).catch(e => { setError(String(e)); setLoading(false) })
  }, [])

  const fmt = (n: number) => Math.round(n).toLocaleString('fi-FI') + ' €'
  const fmtN = (n: number) => Math.round(n).toLocaleString('fi-FI')

  const salesByKey = new Map(salesMonths.map(m => [monthKey(m.year, m.monthNum), m]))
  const receiptsByKey = new Map(receiptsMonths.map(m => [monthKey(m.year, m.monthNum), m]))

  // "Tämä vuosi" tarkoittaa uusinta vuotta jolta on maksukuittidataa (ei kalenterin
  // todellista vuotta) — kuiteista voi nyt olla useampi vuosi yhtä aikaa, ja sivun pääkäyrät
  // näyttävät vain uusimman vuoden, "Viime vuosi" -vertailu hakee vanhemmat vuodet erikseen.
  const currentYear = receiptsMonths.length ? Math.max(...receiptsMonths.map(m => m.year)) : new Date().getFullYear()
  const currentYearMonths = receiptsMonths.filter(m => m.year === currentYear)
  const totalNettoThisYear = currentYearMonths.reduce((s, m) => s + m.totals.netto, 0)
  const latestMonth = receiptsMonths.length ? receiptsMonths[receiptsMonths.length - 1] : null
  const fsecLicensesNow = latestMonth?.totals.fsecAsiakkuudet ?? 0
  // F-Secure passiivitulo tämä vuosi: summataan jokaisen maksukuitin oma passiivitulo (ei
  // ekstrapoloida viimeisintä kuukautta × 12, koska joka kuukaudelta on jo oma todellinen luku).
  const fsecPassiiviThisYear = currentYearMonths.reduce((s, m) => s + m.totals.fsecPassiivitulo, 0)

  // Myynti (money in) vs Kulut (money out) — Myynti = Liittymät + Kassakate + F-Secure
  // passiivinen tulo (Yhteenveto-taulukosta). Kulut = työntekijäkulut (Yhteenveto-taulukon
  // TYÖNTEKIJÄT-sarake, tai varalähteenä sellers-taulukon sivukulut yhteensä).
  const moneyIn = (m: ReceiptsMonth) => m.totals.liittymat + m.totals.kassakate + m.totals.fsecPassiivitulo
  const moneyOut = (m: ReceiptsMonth) => m.totals.tyontekijatKulu

  // Nettomyynti-ennuste: koko vuoden todellinen netto (money in - money out) jaettuna
  // havaittujen kuukausien määrällä ja kerrottuna 12:lla (run rate) — ei keskiarvoa
  // "paras kuukausi pois laskuista" -menetelmällä, joka vääristyy pahasti kun mukana on
  // vain muutama kuukausi ja niistä osa poikkeuksellisen negatiivisia.
  const nettoForecast = currentYearMonths.length
    ? Math.round((currentYearMonths.reduce((s, m) => s + (moneyIn(m) - moneyOut(m)), 0) / currentYearMonths.length) * 12)
    : 0

  const myyntiKuluData = currentYearMonths.map((m, i) => {
    const prev = i > 0 ? currentYearMonths[i - 1] : null
    const pctChange = (curr: number, prevVal: number | undefined) =>
      prevVal === undefined || prevVal === 0 ? undefined : Math.round((curr - prevVal) / Math.abs(prevVal) * 100)
    const myyntiPct = prev ? pctChange(moneyIn(m), moneyIn(prev)) : undefined
    const kuluPct = prev ? pctChange(moneyOut(m), moneyOut(prev)) : undefined
    return {
      kuukausi: m.kuukausi,
      myynti: Math.round(moneyIn(m)),
      kulut: Math.round(moneyOut(m)),
      myyntiLabel: myyntiPct !== undefined ? `${myyntiPct >= 0 ? '+' : ''}${myyntiPct}%` : '',
      kuluLabel: kuluPct !== undefined ? `${kuluPct >= 0 ? '+' : ''}${kuluPct}%` : '',
    }
  })
  const totalMyyntiAll = currentYearMonths.reduce((s, m) => s + moneyIn(m), 0)
  const totalKulutAll = currentYearMonths.reduce((s, m) => s + moneyOut(m), 0)
  const totalNettoAll = totalMyyntiAll - totalKulutAll
  const nettoMarginPct = totalMyyntiAll > 0 ? Math.round(totalNettoAll / totalMyyntiAll * 100) : 0

  // Liittymät/Kassakate/F-Secure trendit: Todellinen (maksukuitti), Brutto (myyntiseuranta,
  // siirretty payout-viiveen verran taaksepäin) ja Viime vuosi (sama kuukausi, maksukuitista).
  function buildAreaTrend(area: 'liittymat' | 'kassakate' | 'fsecure'): AreaTrendPoint[] {
    const delay = PAYOUT_DELAY[area]
    return currentYearMonths.map(m => {
      const todellinen = area === 'liittymat'
        ? sumOrPick(m.stores, 'liittymat', storeFilter)
        : area === 'kassakate'
        ? sumOrPick(m.stores, 'kassakate', storeFilter)
        : sumOrPick(m.stores, 'fsecEur', storeFilter)

      const shifted = shiftMonth(m.year, m.monthNum, delay)
      const salesMonth = salesByKey.get(monthKey(shifted.year, shifted.monthNum))
      const brutto = area === 'liittymat'
        ? sumOrPick(salesMonth?.stores, 'liittEur', storeFilter)
        : area === 'kassakate'
        ? sumOrPick(salesMonth?.stores, 'kassaRjmob', storeFilter)
        : sumOrPick(salesMonth?.stores, 'fsecEur', storeFilter)

      const lastYear = receiptsByKey.get(monthKey(m.year - 1, m.monthNum))
      const viimeVuosi = lastYear
        ? (area === 'liittymat' ? sumOrPick(lastYear.stores, 'liittymat', storeFilter)
          : area === 'kassakate' ? sumOrPick(lastYear.stores, 'kassakate', storeFilter)
          : sumOrPick(lastYear.stores, 'fsecEur', storeFilter))
        : undefined

      return { kuukausi: m.kuukausi, todellinen, brutto, viimeVuosi }
    })
  }
  const liittTrend = buildAreaTrend('liittymat')
  const kassaTrend = buildAreaTrend('kassakate')
  const fsecTrend = buildAreaTrend('fsecure')

  // Myymäläkohtainen kokonaisnetto (liittymät + kassakate + rescue kate + huoltokate, EI f-secure).
  const storeNettoData = currentYearMonths.map(m => {
    const point: Record<string, string | number> = { kuukausi: m.kuukausi }
    for (const store of CANONICAL_STORES) {
      const key = findStoreKey(m.stores, store)
      const s = key ? m.stores[key] : undefined
      if (s) point[store] = Math.round(s.liittymat + s.kassakate + s.rescueKate + s.huoltokate)
    }
    return point
  })

  // F-Secure peruutukset: kuukauden maksukuitin lisenssimäärä + saman kuukauden myyntiseurannan
  // uudet F-Secure-myynnit (kaikki myymälät) on odotettu lisenssimäärä seuraavalle kuukaudelle.
  // Jos seuraavan kuukauden maksukuitissa on vähemmän lisenssejä kuin odotettu, erotus on
  // peruutettuja lisenssejä (esim. kesäkuu 1500 kpl + 150 kpl myyty kesäkuussa = odotettu 1650
  // heinäkuulle; jos heinäkuun kuitissa on 1640, 10 lisenssiä on peruutettu). Käytetään koko
  // maksukuittihistoriaa peräkkäisyyden tarkistamiseen (isNextMonth), mutta näytetään vain
  // tämän vuoden havaintokuukaudet muiden käyrien tapaan.
  const fsecPeruutuksetData = receiptsMonths.flatMap((m, i) => {
    const next = receiptsMonths[i + 1]
    if (!next || !isNextMonth(m, next) || next.year !== currentYear) return []
    const salesForM = salesByKey.get(monthKey(m.year, m.monthNum))
    const uudetLisenssit = sumOrPick(salesForM?.stores, 'fsecKpl', 'Kaikki myymälät') ?? 0
    const odotettu = m.totals.fsecAsiakkuudet + uudetLisenssit
    const peruutukset = Math.round(odotettu - next.totals.fsecAsiakkuudet)
    return [{ kuukausi: next.kuukausi, peruutukset }]
  })
  const totalPeruutukset = fsecPeruutuksetData.reduce((s, d) => s + d.peruutukset, 0)

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

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:8,marginBottom:16}}>
          {[
            {l:`Tämän vuoden total netto (${currentYear})`, v: fmt(totalNettoThisYear), s:'kaikki kuukaudet yhteensä'},
            {l:'Total F-Secure lisenssit', v: `${fmtN(fsecLicensesNow)} kpl`, s: latestMonth ? `viimeisin: ${latestMonth.kuukausi}` : '-', c:'#0F6E56'},
            {l:'F-Secure passiivitulo tämä vuosi', v: fmt(fsecPassiiviThisYear), s:'kuukausien todelliset passiivitulot yhteensä', c:'#0F6E56'},
          ].map((k,i) => (
            <div key={i} style={{background:'#f1f0ee',borderRadius:10,padding:'12px 14px'}}>
              <div style={{fontSize:11,color:'#888',marginBottom:3}}>{k.l}</div>
              <div style={{fontSize:18,fontWeight:500,color:k.c ?? '#111'}}>{k.v}</div>
              <div style={{fontSize:11,color:'#aaa',marginTop:2}}>{k.s}</div>
            </div>
          ))}
        </div>

        <div style={{background:'white',border:'0.5px solid #eee',borderRadius:12,padding:'16px',marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:12}}>Vuosiennuste <span style={{textTransform:'none',fontWeight:400}}>— todellinen kk-keskiarvo × 12 (run rate), maksukuittidatasta</span></div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:8}}>
            {[
              {l:'Nettomyynti', v: fmt(nettoForecast), c:'#185FA5', s:'12 kk'},
              {l:'Passiivitulo (viimeisin kk)', v: fmt(latestMonth?.totals.fsecPassiivitulo ?? 0), c:'#0F6E56', s: latestMonth ? latestMonth.kuukausi : '-'},
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
            <div style={{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.5px'}}>Myynti vs Kulut — money in / money out (todellinen)</div>
            <div style={{fontSize:12,fontWeight:500,color:nettoMarginPct>=0?'#3B6D11':'#A32D2D'}}>
              Netto {fmt(totalNettoAll)} ({nettoMarginPct>=0?'+':''}{nettoMarginPct} % myynnistä)
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={myyntiKuluData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="kuukausi" tick={{fontSize:11}} />
              <YAxis tick={{fontSize:11}} tickFormatter={v => v/1000+'k'} />
              <Tooltip formatter={(v:number) => fmt(v)} />
              <Legend wrapperStyle={{fontSize:11}} />
              <Bar dataKey="myynti" name="Myynti (money in)" fill="#185FA5" radius={[4,4,0,0]}>
                <LabelList dataKey="myyntiLabel" position="top" style={{fontSize:9,fill:'#185FA5'}} />
              </Bar>
              <Bar dataKey="kulut" name="Kulut (money out)" fill="#e5e7eb" radius={[4,4,0,0]}>
                <LabelList dataKey="kuluLabel" position="top" style={{fontSize:9,fill:'#999'}} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,flexWrap:'wrap'}}>
          <span style={{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.5px'}}>Myymälä</span>
          {STORE_TOGGLE_OPTIONS.map(opt => (
            <button key={opt} onClick={() => setStoreFilter(opt)}
              style={{
                padding:'5px 12px',borderRadius:8,border:'0.5px solid #ddd',cursor:'pointer',fontSize:12,
                fontWeight: storeFilter===opt?500:400,
                background: storeFilter===opt?'#185FA5':'white',
                color: storeFilter===opt?'white':'#555',
              }}>
              {opt}
            </button>
          ))}
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:12,marginBottom:12}}>
          <TrendAreaChart title="Liittymät (€) — Todellinen / Brutto / Viime vuosi" data={liittTrend} fmt={fmt} />
          <TrendAreaChart title="Kassakate (€) — Todellinen / Viime vuosi" data={kassaTrend} fmt={fmt} showBrutto={false} />
          <TrendAreaChart title="F-Secure (€) — Todellinen / Viime vuosi" data={fsecTrend} fmt={fmt} showBrutto={false} />
        </div>

        <div style={{background:'white',border:'0.5px solid #eee',borderRadius:12,padding:'16px',marginBottom:12}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.5px'}}>
              F-Secure peruutukset <span style={{textTransform:'none',fontWeight:400}}>— (edellisen kk lisenssit + kk:n uudet myynnit) − todelliset lisenssit</span>
            </div>
            <div style={{fontSize:12,fontWeight:500,color:totalPeruutukset<=0?'#3B6D11':'#A32D2D'}}>
              Yhteensä {fmtN(totalPeruutukset)} kpl
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={fsecPeruutuksetData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="kuukausi" tick={{fontSize:11}} />
              <YAxis tick={{fontSize:11}} />
              <Tooltip formatter={(v:number) => `${fmtN(v)} kpl`} />
              <Bar dataKey="peruutukset" name="Peruutukset (kpl)" radius={[4,4,0,0]}>
                <LabelList dataKey="peruutukset" position="top" style={{fontSize:10,fill:'#666'}} formatter={(v: number) => fmtN(v)} />
                {fsecPeruutuksetData.map((d, i) => (
                  <Cell key={i} fill={d.peruutukset > 0 ? '#E24B4A' : '#639922'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{background:'white',border:'0.5px solid #eee',borderRadius:12,padding:'16px',marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:12}}>Myymäläkohtainen trendi — kokonaisnetto (liittymät + kassakate + rescue kate + huoltokate)</div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={storeNettoData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="kuukausi" tick={{fontSize:11}} />
              <YAxis tick={{fontSize:11}} />
              <Tooltip formatter={(v:number) => fmt(v)} />
              <Legend wrapperStyle={{fontSize:11}} />
              {CANONICAL_STORES.map(nimi => (
                <Line key={nimi} type="monotone" dataKey={nimi} name={nimi} stroke={STORE_COLORS[nimi]} strokeWidth={2} dot={{r:3}} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
