'use client'
import { useEffect, useState } from 'react'
import { RjMobNav } from '@/components/rjmob/RjMobNav'
import { laskeTyopaivat } from '@/lib/rjmobWorkdays'

interface SellerRunRate {
  nimi: string
  tyyppi: string
  // Tähänastiset
  liittKpl: number
  liittEur: number
  fsecKpl: number
  fsecEur: number
  kassa: number
  tunnit: number
  tyopaivat: number
  // Run rate arviot
  rrLiittKpl: number
  rrLiittEur: number
  rrFsecKpl: number
  rrFsecEur: number
  rrKassa: number
  rrProvisio: number
  teho: number
  tehoStatus: string
}

interface StoreRunRate {
  liittKpl: number
  liittEur: number
  fsecKpl: number
  fsecEur: number
  kassa: number
  tunnit: number
  // Run rate
  rrLiittKpl: number
  rrLiittEur: number
  rrFsecKpl: number
  rrFsecEur: number
  rrKassa: number
  tyopaiviaKulunut: number
  tyopaiviaYhteensa: number
}

interface RunRateData {
  kuukausi: string
  paiva: number
  kuukausiPaivat: number
  tyopaiviaKulunut: number
  tyopaiviaYhteensa: number
  sellers: SellerRunRate[]
  stores: Record<string, StoreRunRate>
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

function fmt(n: number, dec = 0) {
  return n.toLocaleString('fi-FI', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

export default function RunRatePage() {
  const [files, setFiles] = useState<DriveFile[]>([])
  const [selectedFile, setSelectedFile] = useState('')
  const [data, setData] = useState<RunRateData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/files').then(r => r.json()).then(d => {
      const sheets = ((d.files ?? []).filter((f: DriveFile) =>
        f.mimeType === 'application/vnd.google-apps.spreadsheet'
      )).sort((a: DriveFile, b: DriveFile) => parsePrefix(b.name) - parsePrefix(a.name))
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
        if (!d.sellers) return

        const today = new Date()
        const vuosi = today.getFullYear()
        const kuukausi = today.getMonth() + 1
        const paiva = today.getDate()
        const paiviaKuukaudessa = new Date(vuosi, kuukausi, 0).getDate()

        // Myymälöiden työpäivät (ma-la ilman pyhiä)
        const tyopaiviaKulunut = laskeTyopaivat(vuosi, kuukausi, paiva)
        const tyopaiviaYhteensa = laskeTyopaivat(vuosi, kuukausi)

        // Myyjät run rate
        const sellers: SellerRunRate[] = d.sellers
          .filter((s: {tyyppi:string}) => s.tyyppi !== 'standi')
          .map((s: {
            nimi: string, tyyppi: string, liittKpl: number, liittEur: number,
            fsecKpl: number, fsecEur: number, kassa: number, tunnit: number, teho: number, tehoStatus: string
          }) => {
            // Myyjän run rate perustuu tunneihin
            // Arvioidaan kokonaistunnit kuukaudelle tunnit/kulunut_osuus
            const kulunutOsuus = tyopaiviaKulunut / tyopaiviaYhteensa
            const kerroin = kulunutOsuus > 0 ? 1 / kulunutOsuus : 1

            return {
              nimi: s.nimi,
              tyyppi: s.tyyppi,
              liittKpl: s.liittKpl,
              liittEur: s.liittEur,
              fsecKpl: s.fsecKpl,
              fsecEur: s.fsecEur,
              kassa: s.kassa,
              tunnit: s.tunnit,
              tyopaivat: tyopaiviaKulunut,
              rrLiittKpl: Math.round(s.liittKpl * kerroin),
              rrLiittEur: Math.round(s.liittEur * kerroin),
              rrFsecKpl: Math.round(s.fsecKpl * kerroin),
              rrFsecEur: Math.round(s.fsecEur * kerroin),
              rrKassa: Math.round(s.kassa * kerroin),
              rrProvisio: Math.round((s.liittEur + s.fsecEur + s.kassa) * kerroin),
              teho: s.teho,
              tehoStatus: s.tehoStatus,
            }
          })

        // Myymälät run rate
        const stores: Record<string, StoreRunRate> = {}
        for (const [nimi, s] of Object.entries(d.stores) as [string, {liittKpl:number,liittEur:number,fsecKpl:number,fsecEur:number,kassa:number,tunnit:number}][]) {
          const kulunutOsuus = tyopaiviaKulunut / tyopaiviaYhteensa
          const kerroin = kulunutOsuus > 0 ? 1 / kulunutOsuus : 1
          stores[nimi] = {
            ...s,
            rrLiittKpl: Math.round(s.liittKpl * kerroin),
            rrLiittEur: Math.round(s.liittEur * kerroin),
            rrFsecKpl: Math.round(s.fsecKpl * kerroin),
            rrFsecEur: Math.round((s.fsecEur ?? 0) * kerroin),
            rrKassa: Math.round(s.kassa * kerroin),
            tyopaiviaKulunut,
            tyopaiviaYhteensa,
          }
        }

        setData({
          kuukausi: d.kuukausi,
          paiva,
          kuukausiPaivat: paiviaKuukaudessa,
          tyopaiviaKulunut,
          tyopaiviaYhteensa,
          sellers,
          stores,
        })
        setLoading(false)
      })
  }, [selectedFile])

  const thS = {padding:'8px 10px', fontSize:11, fontWeight:500, color:'#888', textAlign:'right' as const, borderBottom:'1px solid #ddd', whiteSpace:'nowrap' as const, background:'#f8f8f6'}
  const thL = {...thS, textAlign:'left' as const}
  const td = {padding:'7px 10px', fontSize:12, textAlign:'right' as const, borderBottom:'0.5px solid #f0f0f0', whiteSpace:'nowrap' as const}
  const tdL = {...td, textAlign:'left' as const, fontWeight:500}
  const tot = {...td, fontWeight:600, background:'#f8f8f6', borderTop:'1px solid #ddd'}
  const totL = {...tot, textAlign:'left' as const}

  const tehoColor = (teho: number, tyyppi: string) => {
    if (tyyppi === 'owner') return '#185FA5'
    return teho >= 9 ? '#3B6D11' : teho >= 7 ? '#854F0B' : '#A32D2D'
  }

  return (
    <div>
      <RjMobNav activePage="/arxcian/rj-mob/runrate" files={files} selectedFile={selectedFile} onFileChange={setSelectedFile} />
      <div style={{maxWidth:1100, margin:'0 auto', padding:'16px'}}>

        {loading && <div style={{textAlign:'center', padding:40, color:'#888', fontSize:14}}>Lasketaan run ratea...</div>}

        {data && !loading && (
          <>
            {/* Info-palkki */}
            <div style={{background:'#E6F1FB', borderRadius:10, padding:'10px 16px', marginBottom:16, display:'flex', gap:24, fontSize:13, color:'#185FA5', flexWrap:'wrap'}}>
              <span><strong>{data.kuukausi.replace('Myyntiseuranta ', '')}</strong></span>
              <span>📅 Tänään päivä {data.paiva}/{data.kuukausiPaivat}</span>
              <span>🏪 Myymälä: {data.tyopaiviaKulunut}/{data.tyopaiviaYhteensa} työpäivää (ma-la, ei pyhiä)</span>
              <span>📈 Kulunut {Math.round(data.tyopaiviaKulunut / data.tyopaiviaYhteensa * 100)}% kuukaudesta</span>
            </div>

            {/* MYYJÄT */}
            <div style={{background:'white', border:'0.5px solid #eee', borderRadius:12, marginBottom:16, overflow:'hidden'}}>
              <div style={{padding:'12px 16px', borderBottom:'0.5px solid #eee'}}>
                <span style={{fontWeight:500, fontSize:14}}>Myyjät — Run Rate arvio</span>
                <span style={{fontSize:12, color:'#888', marginLeft:8}}>perustuu {data.tyopaiviaKulunut} kuluneeseen työpäivään</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse'}}>
                  <thead>
                    <tr>
                      <th style={thL}>Myyjä</th>
                      <th style={thS}>Liitt € nyt</th>
                      <th style={thS}>Liitt € RR</th>
                      <th style={thS}>Liitt kpl nyt</th>
                      <th style={thS}>Liitt kpl RR</th>
                      <th style={thS}>F-Sec € nyt</th>
                      <th style={thS}>F-Sec € RR</th>
                      <th style={thS}>F-Sec kpl nyt</th>
                      <th style={thS}>F-Sec kpl RR</th>
                      <th style={thS}>Kassa nyt</th>
                      <th style={thS}>Kassa RR</th>
                      <th style={thS}>Provisio RR</th>
                      <th style={thS}>Teho €/h</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sellers.filter(s => s.tyyppi !== 'standi').map((s, i) => (
                      <tr key={s.nimi} style={{background: i % 2 === 0 ? 'white' : '#fafafa'}}>
                        <td style={tdL}>{s.nimi}</td>
                        <td style={td}>{fmt(s.liittEur)} €</td>
                        <td style={{...td, color:'#185FA5', fontWeight:500}}>{fmt(s.rrLiittEur)} €</td>
                        <td style={td}>{s.liittKpl}</td>
                        <td style={{...td, color:'#185FA5', fontWeight:500}}>{s.rrLiittKpl}</td>
                        <td style={td}>{fmt(s.fsecEur)} €</td>
                        <td style={{...td, color:'#185FA5', fontWeight:500}}>{fmt(s.rrFsecEur)} €</td>
                        <td style={{...td, color:'#0F6E56'}}>{s.fsecKpl}</td>
                        <td style={{...td, color:'#0F6E56', fontWeight:500}}>{s.rrFsecKpl}</td>
                        <td style={td}>{fmt(s.kassa)} €</td>
                        <td style={{...td, color:'#185FA5', fontWeight:500}}>{fmt(s.rrKassa)} €</td>
                        <td style={{...td, fontWeight:600, color:'#185FA5'}}>{fmt(s.rrProvisio)} €</td>
                        <td style={{...td, color: tehoColor(s.teho, s.tyyppi), fontWeight:500}}>{fmt(s.teho, 2)} €/h</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={totL}>Yhteensä</td>
                      <td style={tot}>{fmt(data.sellers.reduce((s,r)=>s+r.liittEur,0))} €</td>
                      <td style={{...tot, color:'#185FA5'}}>{fmt(data.sellers.reduce((s,r)=>s+r.rrLiittEur,0))} €</td>
                      <td style={tot}>{data.sellers.reduce((s,r)=>s+r.liittKpl,0)}</td>
                      <td style={{...tot, color:'#185FA5'}}>{data.sellers.reduce((s,r)=>s+r.rrLiittKpl,0)}</td>
                      <td style={tot}>{fmt(data.sellers.reduce((s,r)=>s+r.fsecEur,0))} €</td>
                      <td style={{...tot, color:'#185FA5'}}>{fmt(data.sellers.reduce((s,r)=>s+r.rrFsecEur,0))} €</td>
                      <td style={{...tot, color:'#0F6E56'}}>{data.sellers.reduce((s,r)=>s+r.fsecKpl,0)}</td>
                      <td style={{...tot, color:'#0F6E56'}}>{data.sellers.reduce((s,r)=>s+r.rrFsecKpl,0)}</td>
                      <td style={tot}>{fmt(data.sellers.reduce((s,r)=>s+r.kassa,0))} €</td>
                      <td style={{...tot, color:'#185FA5'}}>{fmt(data.sellers.reduce((s,r)=>s+r.rrKassa,0))} €</td>
                      <td style={{...tot, color:'#185FA5'}}>{fmt(data.sellers.reduce((s,r)=>s+r.rrProvisio,0))} €</td>
                      <td style={tot}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* MYYMÄLÄT */}
            <div style={{background:'white', border:'0.5px solid #eee', borderRadius:12, overflow:'hidden'}}>
              <div style={{padding:'12px 16px', borderBottom:'0.5px solid #eee'}}>
                <span style={{fontWeight:500, fontSize:14}}>Myymälät — Run Rate arvio</span>
                <span style={{fontSize:12, color:'#888', marginLeft:8}}>{data.tyopaiviaKulunut}/{data.tyopaiviaYhteensa} ma-la työpäivää</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse'}}>
                  <thead>
                    <tr>
                      <th style={thL}>Myymälä</th>
                      <th style={thS}>Liitt € nyt</th>
                      <th style={thS}>Liitt € RR</th>
                      <th style={thS}>Liitt kpl nyt</th>
                      <th style={thS}>Liitt kpl RR</th>
                      <th style={thS}>F-Sec € nyt</th>
                      <th style={thS}>F-Sec € RR</th>
                      <th style={thS}>F-Sec kpl nyt</th>
                      <th style={thS}>F-Sec kpl RR</th>
                      <th style={thS}>Kassa nyt</th>
                      <th style={thS}>Kassa RR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.stores).map(([nimi, s], i) => (
                      <tr key={nimi} style={{background: i % 2 === 0 ? 'white' : '#fafafa'}}>
                        <td style={tdL}>{nimi}</td>
                        <td style={td}>{fmt(s.liittEur)} €</td>
                        <td style={{...td, color:'#185FA5', fontWeight:500}}>{fmt(s.rrLiittEur)} €</td>
                        <td style={td}>{s.liittKpl}</td>
                        <td style={{...td, color:'#185FA5', fontWeight:500}}>{s.rrLiittKpl}</td>
                        <td style={td}>{fmt(s.fsecEur ?? 0)} €</td>
                        <td style={{...td, color:'#185FA5', fontWeight:500}}>{fmt(s.rrFsecEur)} €</td>
                        <td style={{...td, color:'#0F6E56'}}>{s.fsecKpl}</td>
                        <td style={{...td, color:'#0F6E56', fontWeight:500}}>{s.rrFsecKpl}</td>
                        <td style={td}>{fmt(s.kassa)} €</td>
                        <td style={{...td, color:'#185FA5', fontWeight:500}}>{fmt(s.rrKassa)} €</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={totL}>Yhteensä</td>
                      <td style={tot}>{fmt(Object.values(data.stores).reduce((s,r)=>s+r.liittEur,0))} €</td>
                      <td style={{...tot, color:'#185FA5'}}>{fmt(Object.values(data.stores).reduce((s,r)=>s+r.rrLiittEur,0))} €</td>
                      <td style={tot}>{Object.values(data.stores).reduce((s,r)=>s+r.liittKpl,0)}</td>
                      <td style={{...tot, color:'#185FA5'}}>{Object.values(data.stores).reduce((s,r)=>s+r.rrLiittKpl,0)}</td>
                      <td style={tot}>{fmt(Object.values(data.stores).reduce((s,r)=>s+(r.fsecEur??0),0))} €</td>
                      <td style={{...tot, color:'#185FA5'}}>{fmt(Object.values(data.stores).reduce((s,r)=>s+r.rrFsecEur,0))} €</td>
                      <td style={{...tot, color:'#0F6E56'}}>{Object.values(data.stores).reduce((s,r)=>s+r.fsecKpl,0)}</td>
                      <td style={{...tot, color:'#0F6E56'}}>{Object.values(data.stores).reduce((s,r)=>s+r.rrFsecKpl,0)}</td>
                      <td style={tot}>{fmt(Object.values(data.stores).reduce((s,r)=>s+r.kassa,0))} €</td>
                      <td style={{...tot, color:'#185FA5'}}>{fmt(Object.values(data.stores).reduce((s,r)=>s+r.rrKassa,0))} €</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
