'use client'
import { useEffect, useState, useCallback } from 'react'
import { SellerResult, getTuntipalkka } from '@/lib/rjmob'

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
  id: string; name: string; mimeType: string
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

function TopBar({ activePage, files = [], selectedFile = '', onFileChange }: {
  activePage: string
  files?: {id:string, name:string}[]
  selectedFile?: string
  onFileChange?: (id: string) => void
}) {
  return (
    <div style={{background:'white', borderBottom:'0.5px solid #eee', padding:'0 16px', display:'flex', alignItems:'center', height:48, position:'sticky', top:0, zIndex:10, gap:0}}>
      <a href="/" style={{fontWeight:700, fontSize:15, color:'#111', marginRight:24, whiteSpace:'nowrap', textDecoration:'none'}}>RJ-Mob</a>
      {[
        {label:'Tuottoseuranta', href:'/tuotto'},
        {label:'Trendit', href:'/trendit'},
        {label:'Myyntiseuranta', href:'/etela'},
        {label:'Run Rate', href:'/runrate'},
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
      {files.length > 0 && onFileChange && (
        <select value={selectedFile} onChange={e => onFileChange(e.target.value)}
          style={{marginLeft:8, fontSize:12, border:'0.5px solid #ddd', borderRadius:8, padding:'4px 10px', background:'white', cursor:'pointer', color:'#333'}}>
          {files.map(f => (
            <option key={f.id} value={f.id}>
              {f.name.replace('Myyntiseuranta ','').replace(' 2026','')}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

function TehoLabel({ teho, tyyppi }: { teho: number; tyyppi: string }) {
  if (tyyppi === 'owner') return <span style={{color:'#185FA5',fontWeight:500}}>Owner</span>
  if (tyyppi === 'krenar') return <span style={{color:'#185FA5'}}>{fmt(teho, 1)}</span>
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
  const top = active.filter(r=>r.tyyppi==='normal').sort((a,b)=>b.netto-a.netto)[0]
  if (top) alerts.push({type:'green',text:`Top: ${top.nimi} — netto ${fmt(top.netto)} €, ROI ${fmt(top.roi??0)} %, teho ${fmt(top.teho,1)} €/h`})
  if (data.standiInfo.length > 0) alerts.push({type:'amber',text:`Ständi poistettu: ${data.standiInfo.map(s=>`${s.nimi} ${s.liittKpl} kpl`).join(', ')}`})
  return alerts
}

export default function TuottoPage() {
  const [files, setFiles] = useState<DriveFile[]>([])
  const [selectedFile, setSelectedFile] = useState('')
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(false)
  const [filesLoading, setFilesLoading] = useState(true)
  const [error, setError] = useState('')
  const naytaLaskelma = true

  useEffect(() => {
    fetch('/api/files').then(r=>r.json()).then(d => {
      const sheets = ((d.files??[]).filter((f:DriveFile)=>f.mimeType==='application/vnd.google-apps.spreadsheet'))
        .sort((a:DriveFile,b:DriveFile) => parsePrefix(b.name) - parsePrefix(a.name))
      setFiles(sheets)
      if (sheets.length>0) setSelectedFile(sheets[0].id)
    }).finally(()=>setFilesLoading(false))
  }, [])

  const loadData = useCallback(() => {
    if (!selectedFile) return
    setLoading(true); setError('')
    fetch(`/api/sheets?fileId=${selectedFile}`).then(r=>r.json()).then(d=>{
      if (d.error) setError(d.error); else setData(d)
    }).catch(e=>setError(String(e))).finally(()=>setLoading(false))
  }, [selectedFile])

  useEffect(() => { if (selectedFile) loadData() }, [selectedFile, loadData])

  const activeRanked = data?.sellers
    .filter(r=>r.tyyppi!=='ref'&&r.tyyppi!=='standi')
    .sort((a,b)=>{ if(a.tyyppi==='owner') return -1; if(b.tyyppi==='owner') return 1; return b.netto-a.netto }) ?? []

  const alerts = data ? generateAlerts(data) : []
  const th = {fontSize:10,fontWeight:500,color:'#888',textAlign:'left' as const,padding:'5px 7px',borderBottom:'0.5px solid #eee',whiteSpace:'nowrap' as const}
  const thR = {...th, textAlign:'right' as const}
  const td = {padding:'6px 7px',borderBottom:'0.5px solid #f5f5f5',fontSize:12,whiteSpace:'nowrap' as const}
  const tdR = {...td, textAlign:'right' as const}

  return (
    <div style={{minHeight:'100vh',background:'#f8f8f6',fontFamily:'system-ui,sans-serif'}}>
      <TopBar activePage="/tuotto" files={files} selectedFile={selectedFile} onFileChange={setSelectedFile} />
      <div style={{maxWidth:1400,margin:'0 auto',padding:'16px'}}>
        {error && <div style={{background:'#FCEBEB',border:'0.5px solid #F09595',borderRadius:10,padding:12,marginBottom:12,fontSize:13,color:'#A32D2D'}}><strong>Virhe:</strong> {error}</div>}
        {loading && <div style={{textAlign:'center',padding:40,color:'#888',fontSize:14}}>Lasketaan...</div>}
        {data && !loading && (<>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginBottom:12}}>
            {[
              {l:'Nettotulos (tiimi)',v:`${fmt(data.totals.netto)} €`},
              {l:'Norin suoratulo',v:`${fmt(data.sellers.find(s=>s.tyyppi==='owner'&&s.nimi.includes('Arbnor'))?.netto??0)} €`,c:'#185FA5'},
              {l:'Albinin suoratulo',v:`${fmt(data.sellers.find(s=>s.tyyppi==='owner'&&s.nimi.includes('Albin'))?.netto??0)} €`,c:'#185FA5'},
              {l:'Liittymät',v:`${fmt(data.totals.liittKpl)} kpl`,s:`${fmt(data.totals.liittEur)} €`},
              {l:'F-Secure',v:`${fmt(data.totals.fsecKpl)} kpl`,c:'#0F6E56',s:`FV 12kk: ${fmt(data.totals.fsecFV)} €`},
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
            <div style={{fontSize:11,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>AI-huomiot</div>
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
                  <th style={thR}>Liitt kpl</th>
                  <th style={thR}>F-Sec</th>
                  <th style={thR}>Teho €/h</th>
                  <th style={thR}>RJ-Mob tulo</th>
                  <th style={thR}>Työkulu</th>
                  <th style={thR}>Netto</th>
                  <th style={thR}>ROI</th>
                  <th style={th}>Status</th>
                  {naytaLaskelma && <>
                    <th style={{...thR,borderLeft:'1px solid #eee',color:'#185FA5'}}>Liittymä € (5x)</th>
                    <th style={{...thR,color:'#185FA5'}}>Kassa (5x)</th>
                    <th style={{...thR,color:'#185FA5'}}>Total prov (5x)</th>
                    <th style={{...thR,color:'#0F6E56'}}>F-Sec 2kk pass.</th>
                    <th style={{...thR,color:'#854F0B'}}>Tuntipalkka</th>
                    <th style={{...thR,color:'#854F0B'}}>Palkka</th>
                    <th style={{...thR,color:'#854F0B'}}>Sivukulut</th>
                    <th style={{...thR,color:'#A32D2D'}}>RJ-Mob netto</th>
                  </>}
                </tr></thead>
                <tbody>
                  {activeRanked.map((r,i)=>{
                    const isOwner = r.tyyppi === 'owner'
                    const fsecPassiivinen2kk = r.fsecKpl * 1.5 * 2
                    const tuntipalkka = r.palkkaTunnit > 0 ? r.palkkaBrutto / r.palkkaTunnit : 0
                    return (
                      <tr key={r.nimi} style={{background:isOwner?'#f0f7ff':r.netto<0?'#fff8f8':'white'}}>
                        <td style={{...td,color:'#ccc'}}>{isOwner?'—':i}</td>
                        <td style={{...td,fontWeight:500}}>{r.nimi}</td>
                        <td style={tdR}>{r.liittKpl}</td>
                        <td style={{...tdR,color:'#0F6E56',fontWeight:500}}>{r.fsecKpl}</td>
                        <td style={tdR}><TehoLabel teho={r.teho} tyyppi={r.tyyppi}/></td>
                        <td style={tdR}>{fmt(r.rjmobTulo)} €</td>
                        <td style={{...tdR,color:'#888'}}>{isOwner?'—':`${fmt(r.tyokulu)} €`}</td>
                        <td style={{...tdR,fontWeight:500,color:r.netto<0?'#A32D2D':isOwner?'#185FA5':'#3B6D11'}}>{fmt(r.netto)} €</td>
                        <td style={{...tdR,fontSize:11,color:r.roi===null?'#185FA5':(r.roi??0)<0?'#A32D2D':'#666'}}>{r.roi===null?'Owner':`${fmt(r.roi??0)} %`}</td>
                        <td style={td}><StatusBadge r={r}/></td>
                        {naytaLaskelma && <>
                          <td style={{...tdR,borderLeft:'1px solid #f0f0f0',color:'#185FA5',fontWeight:500}}>{isOwner?'—':`${fmt(r.rjmobLiitt)} €`}</td>
                          <td style={{...tdR,color:'#185FA5'}}>{isOwner?'—':`${fmt(r.rjmobKassa)} €`}</td>
                          <td style={{...tdR,color:'#185FA5',fontWeight:500}}>{isOwner?'—':`${fmt(r.rjmobLiitt+r.rjmobKassa)} €`}</td>
                          <td style={{...tdR,color:'#0F6E56'}}>{fmt(fsecPassiivinen2kk)} €</td>
                          <td style={{...tdR,color:'#854F0B'}}>{isOwner?'—':`${fmt(tuntipalkka,2)} €/h`}</td>
                          <td style={{...tdR,color:'#854F0B',fontWeight:500}}>{isOwner?'—':`${fmt(r.palkkaBrutto)} €`}</td>
                          <td style={{...tdR,color:'#854F0B'}}>{isOwner?'—':`${fmt(r.tyokulu)} €`}</td>
                          <td style={{...tdR,fontWeight:500,color:r.netto<0?'#A32D2D':'#3B6D11'}}>{isOwner?'—':`${fmt(r.netto)} €`}</td>
                        </>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{background:'white',border:'0.5px solid #eee',borderRadius:12,overflow:'hidden',marginBottom:12}}>
            <div style={{padding:'10px 14px',borderBottom:'0.5px solid #eee',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontWeight:500,fontSize:14}}>Tuntipalkat</span>
              <button onClick={()=>setNaytaTuntipalkat(v=>!v)}
                style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'0.5px solid #ddd',background:'white',cursor:'pointer',color:'#555'}}>
                {naytaTuntipalkat ? 'Piilota' : 'Näytä tuntipalkat'}
              </button>
            </div>
            {naytaTuntipalkat && (
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr>
                  <th style={{fontSize:10,fontWeight:500,color:'#888',textAlign:'left',padding:'5px 10px',borderBottom:'0.5px solid #eee'}}>Myyjä</th>
                  <th style={{fontSize:10,fontWeight:500,color:'#888',textAlign:'right',padding:'5px 10px',borderBottom:'0.5px solid #eee'}}>Tuntipalkka</th>
                  <th style={{fontSize:10,fontWeight:500,color:'#888',textAlign:'right',padding:'5px 10px',borderBottom:'0.5px solid #eee'}}>Tunnit</th>
                  <th style={{fontSize:10,fontWeight:500,color:'#888',textAlign:'right',padding:'5px 10px',borderBottom:'0.5px solid #eee'}}>Pohjapalka</th>
                </tr></thead>
                <tbody>
                  {activeRanked.filter(r=>r.tyyppi!=='owner').map((r,i)=>{
                    const tp = getTuntipalkka(r.nimi)
                    const pohja = r.palkkaTunnit * tp
                    return (
                      <tr key={r.nimi} style={{background:i%2===0?'white':'#fafafa'}}>
                        <td style={{padding:'6px 10px',fontSize:12,fontWeight:500,borderBottom:'0.5px solid #f5f5f5'}}>{r.nimi}</td>
                        <td style={{padding:'6px 10px',fontSize:12,textAlign:'right',borderBottom:'0.5px solid #f5f5f5'}}>{tp} €/h</td>
                        <td style={{padding:'6px 10px',fontSize:12,textAlign:'right',borderBottom:'0.5px solid #f5f5f5',color:'#888'}}>{fmt(r.palkkaTunnit)} h</td>
                        <td style={{padding:'6px 10px',fontSize:12,textAlign:'right',borderBottom:'0.5px solid #f5f5f5',fontWeight:500}}>{fmt(pohja)} €</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
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
      </div>
    </div>
  )
}
