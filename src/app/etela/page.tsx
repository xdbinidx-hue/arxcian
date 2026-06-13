'use client'
import { useEffect, useState } from 'react'

interface SellerResult {
  nimi: string
  tyyppi: string
  liittKpl: number
  liittEur: number
  fsecKpl: number
  fsecEur: number
  kassa: number
  tunnit: number
  teho: number
}

interface StoreData {
  liittKpl: number
  liittEur: number
  fsecKpl: number
  fsecEur: number
  kassa: number
  kassaRjmob: number
  tunnit: number
}

interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
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
        {label:'Laskuri', href:'/laskuri'},
      ].map(item => (
        <a key={item.href} href={item.href}
          style={{
            fontSize:13, fontWeight: activePage === item.href ? 500 : 400,
            color: activePage === item.href ? '#185FA5' : '#555',
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

export default function EtelanHaratPage() {
  const [files, setFiles] = useState<DriveFile[]>([])
  const [selectedFile, setSelectedFile] = useState('')
  const [sellers, setSellers] = useState<SellerResult[]>([])
  const [stores, setStores] = useState<Record<string, StoreData>>({})
  const [kuukausi, setKuukausi] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/files')
      .then(r => r.json())
      .then(d => {
        const parsePrefix = (name: string) => {
          const match = name.match(/([0-9]{1,3})\./)
          return match ? Number(match[1]) : 0
        }

        const sheets = (d.files ?? []).filter((f: DriveFile) =>
          f.mimeType === 'application/vnd.google-apps.spreadsheet'
        ).sort((a: DriveFile, b: DriveFile) => parsePrefix(b.name) - parsePrefix(a.name))
        setFiles(sheets)
        if (sheets.length > 0) setSelectedFile(sheets[0].id)
      })
  }, [])

  useEffect(() => {
    if (!selectedFile) return
    setLoading(true)
    fetch(`/api/sheets?fileId=${selectedFile}`)
      .then(r => r.json())
      .then(d => {
        if (d.sellers) {
          const sorted = [...d.sellers]
            .filter((s: SellerResult) => s.tyyppi !== 'standi')
            .sort((a: SellerResult, b: SellerResult) => { if (a.nimi.toLowerCase().includes('albin')) return 1; if (b.nimi.toLowerCase().includes('albin')) return -1; return (b.tunnit > 0 ? (b.liittEur + b.kassa) / b.tunnit : 0) - (a.tunnit > 0 ? (a.liittEur + a.kassa) / a.tunnit : 0) })
          setSellers(sorted)
          setStores(d.stores ?? {})
          setKuukausi(d.kuukausi ?? '')
        }
        setLoading(false)
      })
  }, [selectedFile])

  const fmt = (n: number) => n.toLocaleString('fi-FI', {minimumFractionDigits: 2, maximumFractionDigits: 2})
  const fmtN = (n: number) => n.toLocaleString('fi-FI', {minimumFractionDigits: 0, maximumFractionDigits: 0})

  const sellerTotals = {
    liittKpl: sellers.reduce((s,r) => s+r.liittKpl, 0),
    liittEur: sellers.reduce((s,r) => s+r.liittEur, 0),
    fsecKpl: sellers.reduce((s,r) => s+r.fsecKpl, 0),
    fsecEur: sellers.reduce((s,r) => s+r.fsecEur, 0),
    kassa: sellers.reduce((s,r) => s+r.kassa, 0),
    tunnit: sellers.reduce((s,r) => s+r.tunnit, 0),
  }

  const storeTotals = {
    liittKpl: Object.values(stores).reduce((s,r) => s+r.liittKpl, 0),
    liittEur: Object.values(stores).reduce((s,r) => s+r.liittEur, 0),
    fsecKpl: Object.values(stores).reduce((s,r) => s+r.fsecKpl, 0),
    fsecEur: Object.values(stores).reduce((s,r) => s+(r.fsecEur ?? 0), 0),
    kassa: Object.values(stores).reduce((s,r) => s+r.kassa, 0),
    tunnit: Object.values(stores).reduce((s,r) => s+r.tunnit, 0),
  }

  const thStyle = {padding:'8px 10px', fontSize:11, fontWeight:500, color:'#888', textAlign:'right' as const, borderBottom:'1px solid #ddd', whiteSpace:'nowrap' as const, background:'#f8f8f6'}
  const thLStyle = {...thStyle, textAlign:'left' as const}
  const tdStyle = {padding:'7px 10px', fontSize:12, textAlign:'right' as const, borderBottom:'0.5px solid #f0f0f0', whiteSpace:'nowrap' as const}
  const tdLStyle = {...tdStyle, textAlign:'left' as const, fontWeight:500}
  const totStyle = {...tdStyle, fontWeight:600, background:'#f8f8f6', borderTop:'1px solid #ddd'}
  const totLStyle = {...totStyle, textAlign:'left' as const}

  const [viesti, setViesti] = useState('')
  const [viestiLoading, setViestiLoading] = useState<string|null>(null)

  const generoiViesti = async (tyyppi: 'paiva' | 'viikko' | 'kuukausi') => {
    setViestiLoading(tyyppi)
    const top3 = sellers.filter(s => s.tyyppi !== 'standi').slice(0, 3)
    const fsecTop = [...sellers].filter(s => s.tyyppi !== 'standi').sort((a,b) => b.fsecKpl - a.fsecKpl).slice(0,2)
    const tiimiFsec = Object.values(stores).reduce((s,r) => s+r.fsecKpl, 0)
    const tiimiLiitt = sellers.filter(s => s.tyyppi !== 'standi').reduce((s,r) => s+r.liittKpl, 0)

    const prompt = `Olet RJ-Mob myyntitiimin johtaja. Generoi lyhyt motivoiva WhatsApp-viesti tiimille myyntidatan perusteella.

SÄÄNNÖT:
- Älä nimeä huonosti suoriutuvia myyjjä
- Nosta hyviä suorituksia nimellä
- Pidä positiivinen ja energinen fiilis
- Mainitse viikon fokus koko tiimille
- Max 150 sanaa
- Käytä emojeja sopivasti
- Kirjoita suomeksi
- ÄLÄ käytä raporttimaisuutta

DATA:
Top myyjät liittymissä: ${top3.map(s => s.nimi.split(' ')[0] + ' ' + s.liittKpl + ' liitt').join(', ')}
Top F-Secure tekijät: ${fsecTop.map(s => s.nimi.split(' ')[0] + ' ' + s.fsecKpl + ' kpl').join(', ')}
Tiimi yhteensä: ${tiimiLiitt} liittymää, ${tiimiFsec} F-Securea
Kuukausi: ${kuukausi.replace('Myyntiseuranta ', '').replace(' 2026', '')}

TÄRKEÄÄ: Älä käytä emojeja. Älä käytä tekoälymäistä kieltä tai fraaseja kuten "Hei tiimi!", "Loistavaa työtä!", "Mahtavaa!" tai muita yliampuvia ilmaisuja. Kirjoita kuten oikea myyntipäällikkö kirjoittaisi WhatsAppissa — suoraan, rehellisesti ja rennosti.

Generoi viesti:`

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })
      const data = await res.json()
      const text = data.text ?? 'Virhe generoinnissa'
      setViesti(text)
    } catch(e) {
      setViesti('Virhe: ' + String(e))
    }
    setViestiLoading(null)
  }

  return (
    <div style={{minHeight:'100vh', background:'#f8f8f6', fontFamily:'system-ui,sans-serif'}}>
      <TopBar activePage="/etela" files={files} selectedFile={selectedFile} onFileChange={setSelectedFile} />

      <div style={{maxWidth:1100, margin:'0 auto', padding:'16px'}}>

        {loading && <div style={{textAlign:'center', padding:40, color:'#888', fontSize:14}}>Ladataan...</div>}

        {!loading && sellers.length > 0 && (
          <>
            {/* MYYJÄT */}
            <div style={{background:'white', border:'0.5px solid #eee', borderRadius:12, marginBottom:16, overflow:'hidden'}}>
              <div style={{padding:'12px 16px', borderBottom:'0.5px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <span style={{fontWeight:500, fontSize:14}}>Myyjät — {kuukausi}</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse'}}>
                  <thead>
                    <tr>
                      <th style={{...thLStyle, width:30}}>#</th>
                      <th style={thLStyle}>Myyjä</th>
                      <th style={thStyle}>Liittymät €</th>
                      <th style={thStyle}>Liittymät kpl</th>
                      <th style={thStyle}>F-Secure €</th>
                      <th style={thStyle}>F-Secure kpl</th>
                      <th style={thStyle}>Kassakate</th>
                      <th style={thStyle}>Tunnit</th>
                      <th style={thStyle}>Provisio yht.</th>
                      <th style={thStyle}>Liitt teho</th>
                      <th style={thStyle}>Liitt+Kassa teho</th>
                      <th style={thStyle}>Total teho</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellers.map((s, i) => {
                      const provisio = s.liittEur + s.fsecEur + s.kassa
                      const myyntiTeho = s.tunnit > 0 ? (s.liittEur + s.kassa) / s.tunnit : 0
                      const tehoColor = myyntiTeho >= 9 ? '#3B6D11' : myyntiTeho >= 7 ? '#854F0B' : '#A32D2D'
                      const isAlbin = s.nimi.toLowerCase().includes('albin')
                      return (
                        <tr key={s.nimi} style={{background: i % 2 === 0 ? 'white' : '#fafafa'}}>
                          <td style={tdLStyle}>{i+1}</td>
                          <td style={tdLStyle}>{s.nimi}</td>
                          <td style={tdStyle}>{fmt(s.liittEur)} €</td>
                          <td style={tdStyle}>{s.liittKpl}</td>
                          <td style={tdStyle}>{fmt(s.fsecEur)} €</td>
                          <td style={{...tdStyle, color:'#0F6E56', fontWeight:500}}>{s.fsecKpl}</td>
                          <td style={tdStyle}>{fmt(s.kassa)} €</td>
                          <td style={tdStyle}>{fmt(s.tunnit)}</td>
                          <td style={{...tdStyle, fontWeight:500}}>{fmt(provisio)} €</td>
                          <td style={{...tdStyle, color: s.tunnit > 0 && s.liittEur/s.tunnit >= 9 ? '#3B6D11' : s.tunnit > 0 && s.liittEur/s.tunnit >= 7 ? '#854F0B' : '#A32D2D', fontWeight:500}}>{isAlbin ? '—' : (s.tunnit > 0 ? s.liittEur/s.tunnit : 0).toFixed(2) + ' €/h'}</td>
                          <td style={{...tdStyle, color: tehoColor, fontWeight:500}}>{isAlbin ? '—' : myyntiTeho.toFixed(2) + ' €/h'}</td>
                          <td style={{...tdStyle, color: s.tunnit > 0 && (s.liittEur+s.kassa+s.fsecEur)/s.tunnit >= 9 ? '#3B6D11' : s.tunnit > 0 && (s.liittEur+s.kassa+s.fsecEur)/s.tunnit >= 7 ? '#854F0B' : '#A32D2D', fontWeight:500}}>{isAlbin ? '—' : (s.tunnit > 0 ? (s.liittEur+s.kassa+s.fsecEur)/s.tunnit : 0).toFixed(2) + ' €/h'}</td>
                        </tr>
                      )
                    })}
                    <tr>
                      <td style={totLStyle} colSpan={2}>Yhteensä</td>
                      <td style={totStyle}>{fmt(sellerTotals.liittEur)} €</td>
                      <td style={totStyle}>{sellerTotals.liittKpl}</td>
                      <td style={totStyle}>{fmt(sellerTotals.fsecEur)} €</td>
                      <td style={{...totStyle, color:'#0F6E56'}}>{sellerTotals.fsecKpl}</td>
                      <td style={totStyle}>{fmt(sellerTotals.kassa)} €</td>
                      <td style={totStyle}>{fmt(sellerTotals.tunnit)}</td>
                      <td style={totStyle}>{fmt(sellerTotals.liittEur + sellerTotals.fsecEur + sellerTotals.kassa)} €</td>
                      <td style={totStyle}>
                        {fmt(sellers.filter(s => s.tyyppi !== 'owner' && s.tunnit > 0).reduce((s,r) => s + r.teho, 0) / (sellers.filter(s => s.tyyppi !== 'owner' && s.tunnit > 0).length || 1)) + ' €/h'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* MYYMÄLÄT */}
            <div style={{background:'white', border:'0.5px solid #eee', borderRadius:12, marginBottom:16, overflow:'hidden'}}>
              <div style={{padding:'12px 16px', borderBottom:'0.5px solid #eee'}}>
                <span style={{fontWeight:500, fontSize:14}}>Myymälät — {kuukausi}</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse'}}>
                  <thead>
                    <tr>
                      <th style={{...thLStyle, width:30}}>#</th>
                      <th style={thLStyle}>Myymälä</th>
                      <th style={thStyle}>Liittymät €</th>
                      <th style={thStyle}>Liittymät kpl</th>
                      <th style={thStyle}>F-Secure €</th>
                      <th style={thStyle}>F-Secure kpl</th>
                      <th style={thStyle}>Kassakate</th>
                      <th style={thStyle}>Tunnit</th>
                      <th style={thStyle}>Liitt teho</th>
                      <th style={thStyle}>Liitt+Kassa teho</th>
                      <th style={thStyle}>Total teho</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(stores).sort((a,b) => b[1].liittEur - a[1].liittEur).map(([nimi, s], i) => {
                      const teho = s.tunnit > 0 ? s.liittEur / s.tunnit : 0
                      const tehoColor = teho >= 9 ? '#3B6D11' : teho >= 7 ? '#854F0B' : '#A32D2D'
                      return (
                        <tr key={nimi} style={{background: i % 2 === 0 ? 'white' : '#fafafa'}}>
                          <td style={tdLStyle}>{i+1}</td>
                          <td style={tdLStyle}>{nimi}</td>
                          <td style={tdStyle}>{fmt(s.liittEur)} €</td>
                          <td style={tdStyle}>{s.liittKpl}</td>
                          <td style={tdStyle}>{fmt(s.fsecEur ?? 0)} €</td>
                          <td style={{...tdStyle, color:'#0F6E56', fontWeight:500}}>{s.fsecKpl}</td>
                          <td style={tdStyle}>{fmt(s.kassa)} €</td>
                          <td style={tdStyle}>{fmt(s.tunnit)}</td>
                          <td style={{...tdStyle, color: tehoColor, fontWeight:500}}>{teho.toFixed(2)} €/h</td>
                          <td style={{...tdStyle, color: s.tunnit > 0 && (s.liittEur+s.kassaRjmob)/s.tunnit >= 9 ? '#3B6D11' : s.tunnit > 0 && (s.liittEur+s.kassaRjmob)/s.tunnit >= 7 ? '#854F0B' : '#A32D2D', fontWeight:500}}>{s.tunnit > 0 ? ((s.liittEur+s.kassaRjmob)/s.tunnit).toFixed(2) : '0.00'} €/h</td>
                          <td style={{...tdStyle, color: s.tunnit > 0 && (s.liittEur+s.kassaRjmob+(s.fsecEur??0))/s.tunnit >= 9 ? '#3B6D11' : s.tunnit > 0 && (s.liittEur+s.kassaRjmob+(s.fsecEur??0))/s.tunnit >= 7 ? '#854F0B' : '#A32D2D', fontWeight:500}}>{s.tunnit > 0 ? ((s.liittEur+s.kassaRjmob+(s.fsecEur??0))/s.tunnit).toFixed(2) : '0.00'} €/h</td>
                        </tr>
                      )
                    })}
                    <tr>
                      <td style={totLStyle} colSpan={2}>Yhteensä</td>
                      <td style={totStyle}>{fmt(storeTotals.liittEur)} €</td>
                      <td style={totStyle}>{storeTotals.liittKpl}</td>
                      <td style={totStyle}>{fmt(storeTotals.fsecEur)} €</td>
                      <td style={{...totStyle, color:'#0F6E56'}}>{storeTotals.fsecKpl}</td>
                      <td style={totStyle}>{fmt(storeTotals.kassa)} €</td>
                      <td style={totStyle}>{fmt(storeTotals.tunnit)}</td>
                      <td style={totStyle}>
                        {fmt(Object.values(stores).filter(s => s.tunnit > 0).reduce((s,r) => s + (r.liittEur + r.kassa) / r.tunnit, 0) / (Object.values(stores).filter(s => s.tunnit > 0).length || 1)) + ' €/h'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {sellers.length > 0 && (
          <div style={{background:'white', border:'0.5px solid #eee', borderRadius:12, padding:'16px', marginBottom:16}}>
            <div style={{fontSize:11, fontWeight:500, color:'#888', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:12}}>Viikkoviesti tiimille</div>
            <div style={{display:'flex', gap:8, marginBottom:12, flexWrap:'wrap'}}>
              {[
                {tyyppi:'paiva' as const, label:'Päivittäinen — suorittajat'},
                {tyyppi:'viikko' as const, label:'Viikottainen — missä mennään'},
                {tyyppi:'kuukausi' as const, label:'Kuukausikatsaus'},
              ].map(({tyyppi, label}) => (
                <button key={tyyppi} onClick={() => generoiViesti(tyyppi)} disabled={viestiLoading !== null}
                  style={{padding:'10px 18px', borderRadius:8, background: viestiLoading === tyyppi ? '#0d4a82' : '#185FA5', color:'white', border:'none', fontSize:13, fontWeight:500, cursor:'pointer', opacity: viestiLoading !== null && viestiLoading !== tyyppi ? 0.5 : 1}}>
                  {viestiLoading === tyyppi ? 'Generoidaan...' : label}
                </button>
              ))}
            </div>
            {viesti && (
              <div>
                <div style={{background:'#f8f8f6', borderRadius:8, padding:'14px', fontSize:13, lineHeight:1.7, whiteSpace:'pre-wrap', marginBottom:10, border:'0.5px solid #eee'}}>
                  {viesti}
                </div>
                <button onClick={() => {navigator.clipboard.writeText(viesti)}}
                  style={{padding:'7px 16px', borderRadius:8, background:'white', border:'0.5px solid #ddd', fontSize:12, cursor:'pointer', color:'#333'}}>
                  Kopioi leikepöydälle
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
