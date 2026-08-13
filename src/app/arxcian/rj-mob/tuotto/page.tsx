'use client'
import { useEffect, useState, useCallback } from 'react'
import { SellerResult, getTuntipalkka, LAPIMENO } from '@/lib/rjmob'
import { RjMobNav } from '@/components/rjmob/RjMobNav'

interface DashData {
  kuukausi: string
  sellers: SellerResult[]
  totals: {
    liittKpl: number; liittEur: number; fsecKpl: number
    kassa: number; rjmobTulo: number; tyokulu: number
    netto: number; fsecFV: number
  }
  standiInfo: { nimi: string; liittKpl: number; liittEur: number }[]
  stores: Record<string, { liittKpl: number; liittEur: number; fsecKpl: number; fsecEur: number; kassa: number; kassaRjmob: number; tunnit: number }>
}

interface DriveFile {
  id: string; name: string; mimeType: string; year?: number | null
}

interface ReceiptsData {
  kuukausi: string
  sellers: {
    nimi: string; tuntipalkka: number; provisio: number; liittymat: number; fsecEur: number
    palkka: number; verottomat: number; sivukulut: number; rjmobTulo: number; netto: number
  }[]
  stores: Record<string, { liittymat: number; fsecEur: number; kassakate: number; huoltokate: number; rescueKate: number }>
  totals: {
    liittymat: number; kassakate: number; huoltokate: number; rescueKate: number
    provisio: number; netto: number; fsecAsiakkuudet: number; fsecPassiivitulo: number
  }
}

interface YearSeller {
  nimi: string
  liittymat: number
  kassakate: number
  fsecEur: number
  tyokulu: number
  netto: number
  roi: number
  isOwner: boolean
}

interface YearStore {
  liittymat: number; fsecEur: number; kassakate: number; huoltokate: number; rescueKate: number
}

interface MonthEntry {
  kuukausi: string
  year: number
  monthNum: number
  sellers: YearSeller[]
  stores: Record<string, YearStore>
}

function fmt(n: number, decimals = 0) {
  return n.toLocaleString('fi-FI', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function parsePrefix(name: string): number {
  const yearMatch = name.match(/(\d{4})/)
  const numMatch = name.match(/(\d{1,3})\./)
  const year = yearMatch ? Number(yearMatch[1]) : 0
  const month = numMatch ? Number(numMatch[1]) : 0
  return year * 100 + month
}

function monthNumOf(name: string): number {
  const m = name.match(/(\d{1,3})\./)
  return m ? Number(m[1]) : 0
}

// Varalähde jos api/receipts ei ole merkinnyt tiedostoa vuosikansion vuodella (esim. vanhempi
// juurikansiorakenne ilman vuosikansioita) — arvataan kuluvasta päivämäärästä samalla logiikalla
// kuin trendit-sivulla.
function inferYear(monthNum: number): number {
  const today = new Date()
  return monthNum <= today.getMonth() + 1 ? today.getFullYear() : today.getFullYear() - 1
}

function TehoLabel({ teho, tyyppi }: { teho: number; tyyppi: string }) {
  if (tyyppi === 'owner') return <span style={{color:'#185FA5',fontWeight:500}}>Owner</span>
  // Krenarilla ei ole enää omaa neutraalia väriään: hänen tehonsa arvioidaan
  // samalla portaikolla kuin muidenkin.
  if (teho >= 9) return <span style={{color:'#3B6D11',fontWeight:500}}>{fmt(teho, 1)}</span>
  if (teho >= 7) return <span style={{color:'#854F0B',fontWeight:500}}>{fmt(teho, 1)}</span>
  return <span style={{color:'#A32D2D',fontWeight:500}}>{fmt(teho, 1)}</span>
}

function StatusBadge({ r }: { r: SellerResult }) {
  const s = {fontSize:10,fontWeight:500,padding:'2px 6px',borderRadius:4,display:'inline-block' as const}
  if (r.tyyppi === 'owner') return <span style={{...s,background:'#E6F1FB',color:'#185FA5'}}>Owner</span>
  if (r.tyyppi === 'krenar') return <span style={{...s,background:'#E6F1FB',color:'#185FA5'}}>Erityis</span>
  if (r.netto > 0 && r.tehoStatus === 'green') return <span style={{...s,background:'#EAF3DE',color:'#3B6D11'}}>Hyvä</span>
  if (r.netto < 0) return <span style={{...s,background:'#FCEBEB',color:'#A32D2D'}}>Tappiolla</span>
  return <span style={{...s,background:'#FAEEDA',color:'#854F0B'}}>OK</span>
}

function Alert({ type, children }: { type: 'red'|'amber'|'green'; children: React.ReactNode }) {
  const cls = {red:'#FCEBEB #E24B4A #A32D2D',amber:'#FAEEDA #EF9F27 #854F0B',green:'#EAF3DE #639922 #3B6D11'}[type].split(' ')
  return <div style={{background:cls[0],borderLeft:`2px solid ${cls[1]}`,borderRadius:'0 8px 8px 0',padding:'8px 12px',color:cls[2],fontSize:13,marginBottom:6}}>{children}</div>
}

function generateAlerts(data: DashData) {
  const alerts: {type:'red'|'amber'|'green',text:string}[] = []
  const active = data.sellers.filter(r => r.tyyppi !== 'ref' && r.tyyppi !== 'standi')
  const negative = active.filter(r => r.tyyppi === 'normal' && r.netto < 0)
  if (negative.length > 0) alerts.push({type:'red',text:`${negative.length} myyjää tappiollisia: ${negative.map(r=>`${r.nimi} (${fmt(r.netto)} €)`).join(', ')}`})
  const belowMin = active.filter(r => r.tyyppi === 'normal' && r.teho < 7)
  if (belowMin.length > 0) alerts.push({type:'red',text:`Alle 7 €/h: ${belowMin.map(r=>`${r.nimi} (${fmt(r.teho,1)} €/h)`).join(', ')}`})
  const krenar = active.find(r => r.tyyppi === 'krenar')
  if (krenar && krenar.netto < 0) alerts.push({type:'amber',text:`Krenar: ${krenar.liittKpl} liittymää mutta netto ${fmt(krenar.netto)} €`})
  return alerts
}

export default function TuottoPage() {
  const [files, setFiles] = useState<DriveFile[]>([])
  const [selectedFile, setSelectedFile] = useState('')
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(false)
  const [filesLoading, setFilesLoading] = useState(true)
  const [error, setError] = useState('')

  const [mode, setMode] = useState<'arvio'|'todellinen'>('arvio')
  const [receiptFiles, setReceiptFiles] = useState<DriveFile[]>([])
  const [monthEntries, setMonthEntries] = useState<MonthEntry[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [todellinenView, setTodellinenView] = useState<'vuosi' | number>('vuosi')
  const [yearLoaded, setYearLoaded] = useState(false)
  const [yearLoading, setYearLoading] = useState(false)
  const [yearError, setYearError] = useState('')

  useEffect(() => {
    fetch('/api/files').then(r=>r.json()).then(d => {
      const sheets = ((d.files??[]).filter((f:DriveFile)=>f.mimeType==='application/vnd.google-apps.spreadsheet'))
        .sort((a:DriveFile,b:DriveFile) => parsePrefix(b.name) - parsePrefix(a.name))
      setFiles(sheets)
      if (sheets.length>0) setSelectedFile(sheets[0].id)
    }).finally(()=>setFilesLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/receipts').then(r=>r.json()).then(d => setReceiptFiles(d.files ?? []))
  }, [])

  const loadData = useCallback(() => {
    if (!selectedFile) return
    setLoading(true); setError('')
    fetch(`/api/sheets?fileId=${selectedFile}`).then(r=>r.json()).then(d=>{
      if (d.error) setError(d.error); else setData(d)
    }).catch(e=>setError(String(e))).finally(()=>setLoading(false))
  }, [selectedFile])

  useEffect(() => { if (selectedFile) loadData() }, [selectedFile, loadData])

  // Todellinen-näkymä: koko vuoden maksukuitit summattuna per myyjä. Kassakate haetaan
  // samalta kuukaudelta myyntiseurannasta (100% läpimeno, ei maksukuitissa myyjäkohtaisesti).
  useEffect(() => {
    if (mode !== 'todellinen' || yearLoaded || receiptFiles.length === 0) return
    setYearLoading(true); setYearError('')
    ;(async () => {
      try {
        const salesListRes = await fetch('/api/files').then(r => r.json())
        const salesFiles = ((salesListRes.files ?? []) as DriveFile[]).filter(f => f.mimeType === 'application/vnd.google-apps.spreadsheet')

        const [receiptResults, salesResults] = await Promise.all([
          Promise.all(receiptFiles.map(f => fetch(`/api/receipts?fileId=${f.id}`).then(r => r.json()).then(d => ({ f, d })))),
          Promise.all(salesFiles.map(f => fetch(`/api/sheets?fileId=${f.id}`).then(r => r.json()).then(d => ({ f, d })))),
        ])

        const salesKassaByMonth: Record<number, Record<string, number>> = {}
        for (const { f, d } of salesResults) {
          if (d.error) continue
          const map: Record<string, number> = {}
          for (const s of (d.sellers ?? []) as SellerResult[]) map[s.nimi] = (map[s.nimi] ?? 0) + s.kassa
          salesKassaByMonth[monthNumOf(f.name)] = map
        }

        // Kuukausikohtainen data kerätään sellaisenaan (vuosi mukana) — "koko vuosi"
        // -summaus lasketaan erikseen valitulle vuodelle (ks. yearSellers/yearStores alla),
        // koska maksukuitteja voi nyt olla usealta vuodelta yhtä aikaa.
        const months: MonthEntry[] = []

        for (const { f, d } of receiptResults) {
          if (d.error || !d.totals) continue
          const monthNum = monthNumOf(f.name)
          const year = f.year ?? inferYear(monthNum)
          const kassaBySeller = salesKassaByMonth[monthNum] ?? {}

          const monthSellers: YearSeller[] = []
          for (const s of (d.sellers ?? []) as ReceiptsData['sellers']) {
            const isOwner = s.tuntipalkka === 0 && s.palkka === 0
            const kassakate = kassaBySeller[s.nimi] ?? 0
            const roi = s.sivukulut > 0 ? (s.netto / s.sivukulut) * 100 : 0
            monthSellers.push({ nimi: s.nimi, liittymat: s.liittymat, kassakate, fsecEur: s.fsecEur, tyokulu: s.sivukulut, netto: s.netto, roi, isOwner })
          }
          monthSellers.sort((a, b) => b.netto - a.netto)

          const monthStores: Record<string, YearStore> = {}
          for (const [storeName, sv] of Object.entries(d.stores ?? {}) as [string, YearStore][]) {
            monthStores[storeName] = sv
          }

          months.push({ kuukausi: d.kuukausi ?? f.name, year, monthNum, sellers: monthSellers, stores: monthStores })
        }
        months.sort((a, b) => (a.year - b.year) || (a.monthNum - b.monthNum))

        setMonthEntries(months)
        setYearLoaded(true)
      } catch (e) {
        setYearError(String(e))
      } finally {
        setYearLoading(false)
      }
    })()
  }, [mode, yearLoaded, receiptFiles])

  // Maksukuitteja voi nyt olla usealta vuodelta — oletusvuodeksi valitaan uusin löytynyt heti
  // kun kuukausidata on ladattu.
  const availableYears = Array.from(new Set(monthEntries.map(m => m.year))).sort((a, b) => b - a)
  useEffect(() => {
    if (selectedYear === null && availableYears.length > 0) setSelectedYear(availableYears[0])
  }, [availableYears, selectedYear])

  const monthsForYear = selectedYear !== null ? monthEntries.filter(m => m.year === selectedYear) : []

  const activeRanked = data?.sellers
    .filter(r=>r.tyyppi!=='ref'&&r.tyyppi!=='standi')
    .sort((a,b)=>{ if(a.tyyppi==='owner') return -1; if(b.tyyppi==='owner') return 1; return b.netto-a.netto }) ?? []

  // "Koko vuosi" -summaus lasketaan aina valitulle vuodelle erikseen kuukausidatasta, ei
  // esilasketusta kaikkien vuosien summasta.
  const yearSellerAgg: Record<string, YearSeller> = {}
  const yearStoreAgg: Record<string, YearStore> = {}
  for (const m of monthsForYear) {
    for (const s of m.sellers) {
      const acc = yearSellerAgg[s.nimi] ?? { nimi: s.nimi, liittymat: 0, kassakate: 0, fsecEur: 0, tyokulu: 0, netto: 0, roi: 0, isOwner: true }
      acc.liittymat += s.liittymat
      acc.kassakate += s.kassakate
      acc.fsecEur += s.fsecEur
      acc.tyokulu += s.tyokulu
      acc.netto += s.netto
      acc.isOwner = acc.isOwner && s.isOwner
      yearSellerAgg[s.nimi] = acc
    }
    for (const [storeName, sv] of Object.entries(m.stores)) {
      const acc = yearStoreAgg[storeName] ?? { liittymat: 0, fsecEur: 0, kassakate: 0, huoltokate: 0, rescueKate: 0 }
      acc.liittymat += sv.liittymat
      acc.fsecEur += sv.fsecEur
      acc.kassakate += sv.kassakate
      acc.huoltokate += sv.huoltokate
      acc.rescueKate += sv.rescueKate
      yearStoreAgg[storeName] = acc
    }
  }
  const yearSellers = Object.values(yearSellerAgg).map(s => ({ ...s, roi: s.tyokulu > 0 ? (s.netto / s.tyokulu) * 100 : 0 }))
    .sort((a, b) => b.netto - a.netto)

  const selectedMonthEntry = typeof todellinenView === 'number' ? monthsForYear.find(m => m.monthNum === todellinenView) : null
  const displaySellers = todellinenView === 'vuosi' ? yearSellers : (selectedMonthEntry?.sellers ?? [])
  const displayStores = todellinenView === 'vuosi' ? yearStoreAgg : (selectedMonthEntry?.stores ?? {})
  const displayLabel = todellinenView === 'vuosi' ? `koko vuosi ${selectedYear ?? ''} (${monthsForYear.length} kk)` : (selectedMonthEntry?.kuukausi ?? '')

  const alerts = data ? generateAlerts(data) : []
  const th = {fontSize:10,fontWeight:500,color:'#888',textAlign:'left' as const,padding:'5px 7px',borderBottom:'0.5px solid #eee',whiteSpace:'nowrap' as const}
  const thR = {...th, textAlign:'right' as const}
  const td = {padding:'6px 7px',borderBottom:'0.5px solid #f5f5f5',fontSize:12,whiteSpace:'nowrap' as const}
  const tdR = {...td, textAlign:'right' as const}

  return (
    <div>
      <RjMobNav activePage="/arxcian/rj-mob/tuotto" files={files} selectedFile={selectedFile} onFileChange={setSelectedFile} />
      <div style={{maxWidth:1400,margin:'0 auto',padding:'16px'}}>

        <div style={{display:'flex',gap:8,marginBottom:16}}>
          {(['arvio','todellinen'] as const).map(m => (
            <button key={m} onClick={()=>setMode(m)}
              style={{
                padding:'8px 18px',borderRadius:8,border:'0.5px solid #ddd',cursor:'pointer',fontSize:13,
                fontWeight: mode===m?500:400,
                background: mode===m?'#185FA5':'white',
                color: mode===m?'white':'#555',
              }}>
              {m==='arvio'?'Arvio':'Todellinen'}
            </button>
          ))}
        </div>

        {mode === 'arvio' && <>
        {error && <div style={{background:'#FCEBEB',border:'0.5px solid #F09595',borderRadius:10,padding:12,marginBottom:12,fontSize:13,color:'#A32D2D'}}><strong>Virhe:</strong> {error}</div>}
        {loading && <div style={{textAlign:'center',padding:40,color:'#888',fontSize:14}}>Lasketaan...</div>}
        {data && !loading && (<>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginBottom:12}}>
            {[
              {l:'Nettotulos (tiimi)',v:`${fmt(data.totals.netto)} €`},
              {l:'Norin suoratulo',v:`${fmt(data.sellers.find(s=>s.tyyppi==='owner'&&s.nimi.includes('Arbnor'))?.netto??0)} €`,c:'#185FA5'},
              {l:'Albinin suoratulo',v:`${fmt(data.sellers.find(s=>s.tyyppi==='owner'&&s.nimi.includes('Albin'))?.netto??0)} €`,c:'#185FA5'},
              {l:'Liittymät',v:`${fmt(data.totals.liittKpl)} kpl`,s:`${fmt(data.totals.liittEur)} €`},
              {l:'F-Secure',v:`${fmt(data.totals.fsecKpl)} kpl`,c:'#0F6E56',s:`Kk-passiivitulo: ${fmt(data.totals.fsecKpl*1.5,2)} € · FV 12kk: ${fmt(data.totals.fsecFV)} €`},
              {l:'RJ-Mob bruttotulo',v:`${fmt(data.totals.rjmobTulo)} €`},
              {l:'Työkulu (tiimi)',v:`${fmt(data.totals.tyokulu)} €`,s:'sis. sivukulut ×1,25'},
            ].map((k,i)=>(
              <div key={i} style={{background:'#f1f0ee',borderRadius:10,padding:'11px 13px'}}>
                <div style={{fontSize:11,color:'#888',marginBottom:3}}>{k.l}</div>
                <div style={{fontSize:20,fontWeight:500,color:k.c??'#111'}}>{k.v}</div>
                {k.s && <div style={{fontSize:11,color:'#aaa',marginTop:2}}>{k.s}</div>}
              </div>
            ))}
          </div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Huomioita</div>
            {alerts.map((a,i)=><Alert key={i} type={a.type}>{a.text}</Alert>)}
          </div>

          <div style={{background:'white',border:'0.5px solid #eee',borderRadius:12,overflow:'hidden',marginBottom:12}}>
            <div style={{padding:'10px 14px',borderBottom:'0.5px solid #eee'}}>
              <span style={{fontWeight:500,fontSize:14}}>Myyjät — {data.kuukausi}</span>
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr>
                  <th style={th}>#</th>
                  <th style={th}>Myyjä</th>
                  <th style={thR}>Tuntipalkka</th>
                  <th style={thR}>Liittymä kpl</th>
                  <th style={thR}>F-Secure kpl</th>
                  <th style={thR}>Netto Teho €/h</th>
                  <th style={{...thR,color:'#854F0B'}}>Pohjapalkka</th>
                  <th style={{...thR,color:'#854F0B'}}>Provisio</th>
                  <th style={{...thR,color:'#854F0B'}}>Palkka</th>
                  <th style={{...thR,color:'#854F0B'}}>Sivukuluineen</th>
                  <th style={{...thR,color:'#185FA5'}}>RJ-Mob Liittymä</th>
                  <th style={{...thR,color:'#185FA5'}}>RJ-Mob Kassakate</th>
                  <th style={{...thR,color:'#185FA5'}}>RJ-Mob Provisio</th>
                  <th style={thR}>Netto</th>
                  <th style={thR}>ROI</th>
                  <th style={th}>Status</th>
                </tr></thead>
                <tbody>
                  {activeRanked.map((r,i)=>{
                    const isOwner = r.tyyppi === 'owner'
                    const tuntipalkka = getTuntipalkka(r.nimi)
                    const pohjapalkka = r.palkkaTunnit * tuntipalkka
                    const provisioMyyja = r.provisioYhteensa
                    const rjmobProvisio = r.rjmobTulo
                    return (
                      <tr key={r.nimi} style={{background:isOwner?'#f0f7ff':r.netto<0?'#fff8f8':'white'}}>
                        <td style={{...td,color:'#ccc'}}>{isOwner?'—':i}</td>
                        <td style={{...td,fontWeight:500}}>{r.nimi}</td>
                        <td style={tdR}>{isOwner?'—':`${fmt(tuntipalkka,2)} €/h`}</td>
                        <td style={tdR}>{fmt(r.liittKpl * LAPIMENO)}</td>
                        <td style={{...tdR,color:'#0F6E56',fontWeight:500}}>{r.fsecKpl}</td>
                        <td style={tdR}><TehoLabel teho={r.teho} tyyppi={r.tyyppi}/></td>
                        <td style={{...tdR,color:'#854F0B'}}>{isOwner?'—':`${fmt(pohjapalkka)} €`}</td>
                        <td style={{...tdR,color:'#854F0B'}}>{isOwner?'—':`${fmt(provisioMyyja)} €`}</td>
                        <td style={{...tdR,color:'#854F0B',fontWeight:500}}>{isOwner?'—':`${fmt(r.palkkaBrutto)} €`}</td>
                        <td style={{...tdR,color:'#854F0B'}}>{isOwner?'—':`${fmt(r.tyokulu)} €`}</td>
                        <td style={{...tdR,color:'#185FA5'}}>{isOwner?'—':`${fmt(r.rjmobLiitt)} €`}</td>
                        <td style={{...tdR,color:'#185FA5'}}>{isOwner?'—':`${fmt(r.rjmobKassa)} €`}</td>
                        <td style={{...tdR,color:'#185FA5',fontWeight:500}}>{isOwner?'—':`${fmt(rjmobProvisio)} €`}</td>
                        <td style={{...tdR,fontWeight:500,color:r.netto<0?'#A32D2D':isOwner?'#185FA5':'#3B6D11'}}>{fmt(r.netto)} €</td>
                        <td style={{...tdR,fontSize:11,color:r.roi===null?'#185FA5':(r.roi??0)<0?'#A32D2D':'#666'}}>{r.roi===null?'Owner':`${fmt(r.roi??0)} %`}</td>
                        <td style={td}><StatusBadge r={r}/></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{background:'white',border:'0.5px solid #eee',borderRadius:12,overflow:'hidden',marginBottom:12}}>
            <div style={{padding:'10px 14px',borderBottom:'0.5px solid #eee'}}>
              <span style={{fontWeight:500,fontSize:14}}>Bonukset — {data.kuukausi}</span>
              <span style={{fontSize:11,color:'#aaa',marginLeft:8}}>bruttomyynnistä, Myyjät Yhteensä -välilehti</span>
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr>
                  <th style={th}>Myyjä</th>
                  <th style={thR}>F-Secure Total kpl</th>
                  <th style={thR}>F-Secure Internet kpl</th>
                  <th style={{...thR,color:'#0F6E56'}}>F-Secure bonus</th>
                  <th style={thR}>DNA Uusmyynti kpl</th>
                  <th style={{...thR,color:'#185FA5'}}>DNA bonus</th>
                  <th style={thR}>Bonukset yhteensä</th>
                </tr></thead>
                <tbody>
                  {activeRanked.map(r=>{
                    const bonusYhteensa = r.fsecBonus + r.dnaBonus
                    return (
                      <tr key={r.nimi} style={{background: bonusYhteensa>0?'white':'#fafafa'}}>
                        <td style={{...td,fontWeight:500}}>{r.nimi}</td>
                        <td style={tdR}>{r.fsecTotalKpl}</td>
                        <td style={tdR}>{r.fsecInternetKpl}</td>
                        <td style={{...tdR,color:'#0F6E56',fontWeight: r.fsecBonus>0?500:400}}>{fmt(r.fsecBonus)} €</td>
                        <td style={tdR}>{r.dnaUusmyyntiKpl}</td>
                        <td style={{...tdR,color:'#185FA5',fontWeight: r.dnaBonus>0?500:400}}>{fmt(r.dnaBonus)} €</td>
                        <td style={{...tdR,fontWeight:500}}>{fmt(bonusYhteensa)} €</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{background:'#f8f8f6',borderTop:'1px solid #eee'}}>
                    <td style={{...td,fontWeight:600}}>Yhteensä</td>
                    <td style={tdR}></td>
                    <td style={tdR}></td>
                    <td style={{...tdR,fontWeight:600,color:'#0F6E56'}}>{fmt(activeRanked.reduce((s,r)=>s+r.fsecBonus,0))} €</td>
                    <td style={tdR}></td>
                    <td style={{...tdR,fontWeight:600,color:'#185FA5'}}>{fmt(activeRanked.reduce((s,r)=>s+r.dnaBonus,0))} €</td>
                    <td style={{...tdR,fontWeight:600}}>{fmt(activeRanked.reduce((s,r)=>s+r.fsecBonus+r.dnaBonus,0))} €</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:9,marginBottom:12}}>
            {Object.entries(data.stores).map(([nimi,s])=>{
              const teho=s.tunnit>0?(s.liittEur*5+s.kassaRjmob*5)/s.tunnit:0
              const c=teho>=9?'#3B6D11':teho>=7?'#854F0B':'#A32D2D'
              const dot=teho>=9?'#3B6D11':teho>=7?'#EF9F27':'#E24B4A'
              return (
                <div key={nimi} style={{background:'white',border:'0.5px solid #eee',borderRadius:12,padding:'12px 14px'}}>
                  <div style={{fontWeight:500,fontSize:12,marginBottom:8}}>{nimi}</div>
                  {[['Liittymät',`${s.liittKpl} kpl / ${fmt(s.liittEur)} €`],['F-Secure',`${s.fsecKpl} kpl`,'#0F6E56'],['F-Sec kk-tulo',`${fmt(s.fsecKpl*1.5,2)} €`,'#0F6E56'],['Kassakate',`${fmt(s.kassaRjmob)} €`],['Tunnit',`${fmt(s.tunnit)} h`],['Teho (5x)',`${fmt(teho,1)} €/h`,c]].map(([l,v,vc])=>(
                    <div key={l as string} style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:3}}>
                      <span style={{color:'#888'}}>{l as string}</span>
                      <strong style={{color:(vc as string)??'#111'}}>{v as string}</strong>
                    </div>
                  ))}
                  <div style={{display:'flex',alignItems:'center',gap:5,marginTop:8}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:dot,display:'inline-block'}}></span>
                    <span style={{fontSize:10,fontWeight:500,color:c}}>{teho>=9?'Hyvä':teho>=7?'Tarkkaile':'Kriittinen'}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{background:'#E1F5EE',borderRadius:10,padding:'12px 14px',display:'flex',alignItems:'center',gap:12}}>
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:500,color:'#0F6E56',marginBottom:2}}>F-Secure 12 kk future value — koko tiimi</div>
              <div style={{fontSize:20,fontWeight:500,color:'#0F6E56'}}>{fmt(data.totals.fsecFV)} €</div>
              <div style={{fontSize:10,color:'#0F6E56',opacity:.7}}>{fmt(data.totals.fsecKpl)} kpl × 1,50 € × 12 kk</div>
            </div>
          </div>

        </>)}
        </>}

        {mode === 'todellinen' && <>
          {yearError && <div style={{background:'#FCEBEB',border:'0.5px solid #F09595',borderRadius:10,padding:12,marginBottom:12,fontSize:13,color:'#A32D2D'}}><strong>Virhe:</strong> {yearError}</div>}
          {yearLoading && <div style={{textAlign:'center',padding:40,color:'#888',fontSize:14}}>Ladataan koko vuoden maksukuittidataa...</div>}
          {yearLoaded && !yearLoading && (<>

            {availableYears.length > 1 && (
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,flexWrap:'wrap'}}>
                <span style={{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.5px'}}>Vuosi</span>
                {availableYears.map(y => (
                  <button key={y} onClick={()=>{ setSelectedYear(y); setTodellinenView('vuosi') }}
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
              <button onClick={()=>setTodellinenView('vuosi')}
                style={{
                  padding:'5px 12px',borderRadius:8,border:'0.5px solid #ddd',cursor:'pointer',fontSize:12,
                  fontWeight: todellinenView==='vuosi'?500:400,
                  background: todellinenView==='vuosi'?'#185FA5':'white',
                  color: todellinenView==='vuosi'?'white':'#555',
                }}>
                Koko vuosi
              </button>
              <select
                value={typeof todellinenView === 'number' ? todellinenView : ''}
                onChange={e => setTodellinenView(Number(e.target.value))}
                style={{
                  padding:'5px 12px',borderRadius:8,border:'0.5px solid #ddd',cursor:'pointer',fontSize:12,
                  fontWeight: typeof todellinenView === 'number' ? 500 : 400,
                  background: typeof todellinenView === 'number' ? '#185FA5' : 'white',
                  color: typeof todellinenView === 'number' ? 'white' : '#555',
                }}>
                <option value="" disabled>Valitse kuukausi</option>
                {monthsForYear.map(m => (
                  <option key={m.monthNum} value={m.monthNum}>{m.kuukausi}</option>
                ))}
              </select>
            </div>

            <div style={{background:'white',border:'0.5px solid #eee',borderRadius:12,overflow:'hidden',marginBottom:12}}>
              <div style={{padding:'10px 14px',borderBottom:'0.5px solid #eee'}}>
                <span style={{fontWeight:500,fontSize:14}}>Myyjät (todellinen) — {displayLabel}</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr>
                    <th style={th}>Myyjä</th>
                    <th style={thR}>Liittymät €</th>
                    <th style={thR}>Kassakate €</th>
                    <th style={{...thR,color:'#0F6E56'}}>F-Secure €</th>
                    <th style={thR}>Työkulu €</th>
                    <th style={thR}>Netto €</th>
                    <th style={thR}>ROI %</th>
                  </tr></thead>
                  <tbody>
                    {displaySellers.map(r=>(
                      <tr key={r.nimi} style={{background:r.isOwner?'#f0f7ff':r.netto<0?'#fff8f8':'white'}}>
                        <td style={{...td,fontWeight:500}}>{r.nimi}</td>
                        <td style={tdR}>{fmt(r.liittymat)} €</td>
                        <td style={tdR}>{r.isOwner?'—':`${fmt(r.kassakate)} €`}</td>
                        <td style={{...tdR,color:'#0F6E56'}}>{fmt(r.fsecEur)} €</td>
                        <td style={tdR}>{r.isOwner?'—':`${fmt(r.tyokulu)} €`}</td>
                        <td style={{...tdR,fontWeight:500,color:r.netto<0?'#A32D2D':r.isOwner?'#185FA5':'#3B6D11'}}>{fmt(r.netto)} €</td>
                        <td style={{...tdR,fontSize:11,color:r.isOwner?'#185FA5':r.roi<0?'#A32D2D':'#666'}}>{r.isOwner?'Owner':`${fmt(r.roi)} %`}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{background:'#f8f8f6',borderTop:'1px solid #eee'}}>
                      <td style={{...td,fontWeight:600}}>Yhteensä</td>
                      <td style={{...tdR,fontWeight:600}}>{fmt(displaySellers.reduce((s,r)=>s+r.liittymat,0))} €</td>
                      <td style={{...tdR,fontWeight:600}}>{fmt(displaySellers.reduce((s,r)=>s+r.kassakate,0))} €</td>
                      <td style={{...tdR,fontWeight:600,color:'#0F6E56'}}>{fmt(displaySellers.reduce((s,r)=>s+r.fsecEur,0))} €</td>
                      <td style={{...tdR,fontWeight:600}}>{fmt(displaySellers.reduce((s,r)=>s+r.tyokulu,0))} €</td>
                      <td style={{...tdR,fontWeight:600,color:'#3B6D11'}}>{fmt(displaySellers.reduce((s,r)=>s+r.netto,0))} €</td>
                      <td style={{...tdR,fontWeight:600}}>{(() => {
                        const tk = displaySellers.reduce((s,r)=>s+r.tyokulu,0)
                        const nt = displaySellers.reduce((s,r)=>s+r.netto,0)
                        return tk>0 ? `${fmt(nt/tk*100)} %` : '—'
                      })()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div style={{marginBottom:8}}>
              <span style={{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.5px'}}>Myymäläkohtainen yhteenveto — {displayLabel}</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:9,marginBottom:12}}>
              {Object.entries(displayStores).map(([nimi,s])=>(
                <div key={nimi} style={{background:'white',border:'0.5px solid #eee',borderRadius:12,padding:'12px 14px'}}>
                  <div style={{fontWeight:500,fontSize:12,marginBottom:8}}>{nimi}</div>
                  {[
                    ['Liittymät',`${fmt(s.liittymat)} €`],
                    ['Kassakate',`${fmt(s.kassakate)} €`],
                    ['Huoltokate',`${fmt(s.huoltokate)} €`],
                    ['Rescue kate',`${fmt(s.rescueKate)} €`],
                    ['F-Secure €',`${fmt(s.fsecEur)} €`,'#0F6E56'],
                  ].map(([l,v,vc])=>(
                    <div key={l as string} style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:3}}>
                      <span style={{color:'#888'}}>{l as string}</span>
                      <strong style={{color:(vc as string)??'#111'}}>{v as string}</strong>
                    </div>
                  ))}
                </div>
              ))}
            </div>

          </>)}
        </>}
      </div>
    </div>
  )
}
