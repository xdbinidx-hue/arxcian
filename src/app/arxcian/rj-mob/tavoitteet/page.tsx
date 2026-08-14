'use client'
import { useEffect, useState } from 'react'
import { RjMobNav } from '@/components/rjmob/RjMobNav'
import { tyopaivaTilanne } from '@/lib/rjmobWorkdays'

interface DriveFile { id: string; name: string; mimeType: string }
interface TargetRow {
  nimi: string
  liittKpl: number; liittTavoite: number; liittRunrate: number; liittPerPaiva: number
  fsecKpl: number; fsecTavoite: number; fsecRunrate: number
  kassaKate: number; kassaTavoite: number; kassaRunrate: number
  kassaMyynti: number; kassaPalautus: number; kassaAlennus: number; kassaKuitit: number; kassaPerPaiva: number
  paivat: number; liittEur: number
  dnaUusmyynti: number; elisaUusmyynti: number; teliaUusmyynti: number
  uusmyyntiYhteensa: number; uusmyyntiPerPaiva: number; uusmyyntiRunrate: number
}

function fmt(n: number, dec = 0) {
  return n.toLocaleString('fi-FI', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function parsePrefix(name: string): number {
  const yearMatch = name.match(/(\d{4})/)
  const numMatch = name.match(/(\d{1,3})\./)
  const year = yearMatch ? Number(yearMatch[1]) : 0
  const month = numMatch ? Number(numMatch[1]) : 0
  return year * 100 + month
}

function RunrateColor(pct: number) {
  if (pct >= 80) return '#22c55e'
  if (pct >= 60) return '#eab308'
  if (pct >= 50) return '#f97316'
  return '#ef4444'
}

function RunrateBg(pct: number) {
  if (pct >= 80) return '#dcfce7'
  if (pct >= 60) return '#fef9c3'
  if (pct >= 50) return '#ffedd5'
  return '#fee2e2'
}

function PctCell({ pct }: { pct: number }) {
  return (
    <td style={{padding:'8px 10px', textAlign:'center', background: RunrateBg(pct), color: RunrateColor(pct), fontWeight:600, fontSize:13}}>
      {fmt(pct, 1)}%
    </td>
  )
}

function WorkdayInfo({ kuukausi }: { kuukausi: string }) {
  const { paiva, paiviaKuukaudessa, tyopaiviaKulunut, tyopaiviaYhteensa, kulunutPct: pct } = tyopaivaTilanne()
  const kulunutPct = Math.round(pct)

  return (
    <div style={{background:'#E6F1FB', borderRadius:10, padding:'10px 16px', marginBottom:16, display:'flex', gap:24, fontSize:13, color:'#185FA5', flexWrap:'wrap'}}>
      <span><strong>{kuukausi}</strong></span>
      <span>📅 Tänään päivä {paiva}/{paiviaKuukaudessa}</span>
      <span>🏪 Myymälä: {tyopaiviaKulunut}/{tyopaiviaYhteensa} työpäivää (ma-la, ei pyhiä)</span>
      <span>📈 Kulunut {kulunutPct}% kuukaudesta</span>
    </div>
  )
}

export default function TavoitteetPage() {
  const [files, setFiles] = useState<DriveFile[]>([])
  const [selectedFile, setSelectedFile] = useState('')
  const [data, setData] = useState<TargetRow[]>([])
  const [kuukausi, setKuukausi] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'tavoitteet'|'uusmyynti'|'kassamyynti'>('tavoitteet')

  useEffect(() => {
    fetch('/api/files').then(r=>r.json()).then(d => {
      const sheets = ((d.files??[]).filter((f:DriveFile)=>f.mimeType==='application/vnd.google-apps.spreadsheet'))
        .sort((a:DriveFile,b:DriveFile) => parsePrefix(b.name) - parsePrefix(a.name))
      setFiles(sheets)
      if (sheets.length > 0) setSelectedFile(sheets[0].id)
    })
  }, [])

  useEffect(() => {
    if (!selectedFile) return
    setLoading(true); setError('')
    fetch(`/api/targets?fileId=${selectedFile}`)
      .then(r=>r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else { setData(d.targets ?? []); setKuukausi((d.kuukausi ?? '').replace('Myyntiseuranta ', '')) }
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [selectedFile])

  const th = {padding:'8px 10px', fontSize:11, fontWeight:500, color:'#888', textAlign:'center' as const, borderBottom:'0.5px solid #eee', whiteSpace:'nowrap' as const, background:'#f8f8f8'}
  const thL = {...th, textAlign:'left' as const}
  const td = {padding:'8px 10px', fontSize:13, textAlign:'center' as const, borderBottom:'0.5px solid #f5f5f5'}
  const tdL = {...td, textAlign:'left' as const, fontWeight:500}
  const tot = {...td, fontWeight:600, background:'#f8f8f6', borderTop:'1px solid #ddd'}
  const totL = {...tot, textAlign:'left' as const}

  const totals = data.reduce((acc, r) => ({
    liittKpl: acc.liittKpl + r.liittKpl,
    liittTavoite: acc.liittTavoite + r.liittTavoite,
    fsecKpl: acc.fsecKpl + r.fsecKpl,
    fsecTavoite: acc.fsecTavoite + r.fsecTavoite,
    kassaKate: acc.kassaKate + r.kassaKate,
    kassaTavoite: acc.kassaTavoite + r.kassaTavoite,
    kassaMyynti: acc.kassaMyynti + r.kassaMyynti,
    kassaPalautus: acc.kassaPalautus + r.kassaPalautus,
    kassaAlennus: acc.kassaAlennus + r.kassaAlennus,
    kassaKuitit: acc.kassaKuitit + r.kassaKuitit,
    dnaUusmyynti: acc.dnaUusmyynti + r.dnaUusmyynti,
    elisaUusmyynti: acc.elisaUusmyynti + r.elisaUusmyynti,
    teliaUusmyynti: acc.teliaUusmyynti + r.teliaUusmyynti,
    uusmyyntiYhteensa: acc.uusmyyntiYhteensa + r.uusmyyntiYhteensa,
  }), { liittKpl:0, liittTavoite:0, fsecKpl:0, fsecTavoite:0, kassaKate:0, kassaTavoite:0, kassaMyynti:0, kassaPalautus:0, kassaAlennus:0, kassaKuitit:0, dnaUusmyynti:0, elisaUusmyynti:0, teliaUusmyynti:0, uusmyyntiYhteensa:0 })

  const totLiittRr = totals.liittTavoite > 0 ? totals.liittKpl / totals.liittTavoite * 100 : 0
  const totFsecRr = totals.fsecTavoite > 0 ? totals.fsecKpl / totals.fsecTavoite * 100 : 0
  const totKassaRr = totals.kassaTavoite > 0 ? totals.kassaKate / totals.kassaTavoite * 100 : 0

  const tabBtn = (label: string, key: typeof tab) => (
    <button onClick={() => setTab(key)}
      style={{
        padding:'8px 16px', borderRadius:8, border:'0.5px solid #ddd', cursor:'pointer', fontSize:13,
        fontWeight: tab === key ? 500 : 400,
        background: tab === key ? '#185FA5' : 'white',
        color: tab === key ? 'white' : '#555',
      }}>
      {label}
    </button>
  )

  return (
    <div>
      <RjMobNav activePage="/arxcian/rj-mob/tavoitteet" files={files} selectedFile={selectedFile} onFileChange={setSelectedFile} />
      <div style={{maxWidth:1200, margin:'0 auto', padding:'16px'}}>

        {error && <div style={{background:'#FCEBEB', border:'0.5px solid #F09595', borderRadius:10, padding:12, marginBottom:12, fontSize:13, color:'#A32D2D'}}><strong>Virhe:</strong> {error}</div>}
        {loading && <div style={{textAlign:'center', padding:40, color:'#888', fontSize:14}}>Ladataan...</div>}

        {!loading && !error && data.length > 0 && (<>
          <WorkdayInfo kuukausi={kuukausi} />

          <div style={{display:'flex', gap:8, marginBottom:16}}>
            {tabBtn('Tavoitteet & Runrate', 'tavoitteet')}
            {tabBtn('Uusmyynti', 'uusmyynti')}
            {tabBtn('Kassamyynti', 'kassamyynti')}
          </div>

          {tab === 'tavoitteet' && (
            <div style={{background:'white', border:'0.5px solid #eee', borderRadius:12, overflow:'hidden'}}>
              <div style={{padding:'12px 16px', borderBottom:'0.5px solid #eee'}}>
                <span style={{fontWeight:500, fontSize:14}}>Tavoitteet & Run Rate — {kuukausi}</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse'}}>
                  <thead>
                    <tr>
                      <th style={thL}>Myyjä</th>
                      <th style={th}>Liitt kpl</th>
                      <th style={th}>Liitt tavoite</th>
                      <th style={th}>Liitt RR%</th>
                      <th style={th}>F-Sec kpl</th>
                      <th style={th}>F-Sec tavoite</th>
                      <th style={th}>F-Sec RR%</th>
                      <th style={th}>Kassakate</th>
                      <th style={th}>Kassa tavoite</th>
                      <th style={th}>Kassa RR%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((r, i) => (
                      <tr key={r.nimi} style={{background: i % 2 === 0 ? 'white' : '#fafafa'}}>
                        <td style={tdL}>{r.nimi}</td>
                        <td style={td}>{r.liittKpl}</td>
                        <td style={{...td, color:'#888'}}>{fmt(r.liittTavoite)}</td>
                        <PctCell pct={r.liittRunrate} />
                        <td style={{...td, color:'#0F6E56'}}>{r.fsecKpl}</td>
                        <td style={{...td, color:'#888'}}>{fmt(r.fsecTavoite)}</td>
                        <PctCell pct={r.fsecRunrate} />
                        <td style={td}>{fmt(r.kassaKate)} €</td>
                        <td style={{...td, color:'#888'}}>{fmt(r.kassaTavoite)} €</td>
                        <PctCell pct={r.kassaRunrate} />
                      </tr>
                    ))}
                    <tr>
                      <td style={totL}>Yhteensä</td>
                      <td style={tot}>{totals.liittKpl}</td>
                      <td style={{...tot, color:'#888'}}>{fmt(totals.liittTavoite)}</td>
                      <PctCell pct={totLiittRr} />
                      <td style={{...tot, color:'#0F6E56'}}>{totals.fsecKpl}</td>
                      <td style={{...tot, color:'#888'}}>{fmt(totals.fsecTavoite)}</td>
                      <PctCell pct={totFsecRr} />
                      <td style={tot}>{fmt(totals.kassaKate)} €</td>
                      <td style={{...tot, color:'#888'}}>{fmt(totals.kassaTavoite)} €</td>
                      <PctCell pct={totKassaRr} />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'uusmyynti' && (
            <div style={{background:'white', border:'0.5px solid #eee', borderRadius:12, overflow:'hidden'}}>
              <div style={{padding:'12px 16px', borderBottom:'0.5px solid #eee'}}>
                <span style={{fontWeight:500, fontSize:14}}>Uusmyynti — {kuukausi}</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse'}}>
                  <thead>
                    <tr>
                      <th style={thL}>Myyjä</th>
                      <th style={th}>DNA</th>
                      <th style={th}>Elisa</th>
                      <th style={th}>Telia</th>
                      <th style={th}>Uusmyynti yhteensä</th>
                      <th style={th}>Liittymä / päivä</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((r, i) => (
                      <tr key={r.nimi} style={{background: i % 2 === 0 ? 'white' : '#fafafa'}}>
                        <td style={tdL}>{r.nimi}</td>
                        <td style={td}>{fmt(r.dnaUusmyynti)}</td>
                        <td style={td}>{fmt(r.elisaUusmyynti)}</td>
                        <td style={td}>{fmt(r.teliaUusmyynti)}</td>
                        <td style={{...td, fontWeight:500}}>{fmt(r.uusmyyntiYhteensa)}</td>
                        <td style={{...td, color:'#185FA5', fontWeight:500}}>{fmt(r.uusmyyntiPerPaiva, 2)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={totL}>Yhteensä</td>
                      <td style={tot}>{fmt(totals.dnaUusmyynti)}</td>
                      <td style={tot}>{fmt(totals.elisaUusmyynti)}</td>
                      <td style={tot}>{fmt(totals.teliaUusmyynti)}</td>
                      <td style={tot}>{fmt(totals.uusmyyntiYhteensa)}</td>
                      <td style={tot}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'kassamyynti' && (
            <div style={{background:'white', border:'0.5px solid #eee', borderRadius:12, overflow:'hidden'}}>
              <div style={{padding:'12px 16px', borderBottom:'0.5px solid #eee'}}>
                <span style={{fontWeight:500, fontSize:14}}>Kassamyynti — {kuukausi}</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse'}}>
                  <thead>
                    <tr>
                      <th style={thL}>Myyjä</th>
                      <th style={th}>Myynti</th>
                      <th style={th}>Palautus</th>
                      <th style={th}>Alennus</th>
                      <th style={th}>Kuitit</th>
                      <th style={th}>Kassakate</th>
                      <th style={th}>Kassa tavoite</th>
                      <th style={th}>Kassa / päivä</th>
                      <th style={th}>Kassa RR%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((r, i) => (
                      <tr key={r.nimi} style={{background: i % 2 === 0 ? 'white' : '#fafafa'}}>
                        <td style={tdL}>{r.nimi}</td>
                        <td style={td}>{fmt(r.kassaMyynti)} €</td>
                        <td style={{...td, color:'#A32D2D'}}>{fmt(r.kassaPalautus)} €</td>
                        <td style={{...td, color:'#A32D2D'}}>{fmt(r.kassaAlennus)} €</td>
                        <td style={{...td, color:'#888'}}>{fmt(r.kassaKuitit)}</td>
                        <td style={{...td, fontWeight:500}}>{fmt(r.kassaKate)} €</td>
                        <td style={{...td, color:'#888'}}>{fmt(r.kassaTavoite)} €</td>
                        <td style={{...td, color:'#185FA5', fontWeight:500}}>{fmt(r.kassaPerPaiva, 2)} €</td>
                        <PctCell pct={r.kassaRunrate} />
                      </tr>
                    ))}
                    <tr>
                      <td style={totL}>Yhteensä</td>
                      <td style={tot}>{fmt(totals.kassaMyynti)} €</td>
                      <td style={{...tot, color:'#A32D2D'}}>{fmt(totals.kassaPalautus)} €</td>
                      <td style={{...tot, color:'#A32D2D'}}>{fmt(totals.kassaAlennus)} €</td>
                      <td style={{...tot, color:'#888'}}>{fmt(totals.kassaKuitit)}</td>
                      <td style={tot}>{fmt(totals.kassaKate)} €</td>
                      <td style={{...tot, color:'#888'}}>{fmt(totals.kassaTavoite)} €</td>
                      <td style={tot}></td>
                      <PctCell pct={totKassaRr} />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>)}

        {!loading && !error && data.length === 0 && (
          <div style={{textAlign:'center', padding:40, color:'#888', fontSize:14}}>Ei tavoitedataa tälle kuukaudelle.</div>
        )}

      </div>
    </div>
  )
}
