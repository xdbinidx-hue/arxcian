'use client'
import { useEffect, useState } from 'react'
import { RjMobNav } from '@/components/rjmob/RjMobNav'
import { RunRateTaulukko } from '@/components/rjmob/RunRateTaulukko'
import { runRateMittari, runRateTaso } from '@/lib/rjmob'
import { myymalaRivit, myyjaRivit, yhteensaRivi, tavoiteSumma, type RunRateToteuma } from '@/lib/rjmobRunRateRivit'
import type { RunRateData } from '@/lib/rjmobRunRate'
import { tyopaivaTilanne } from '@/lib/rjmobWorkdays'

interface DriveFile { id: string; name: string; mimeType: string }
/** Myymälärivin ne kentät joita run rate tarvitsee (/api/sheets). */
interface StoreRow { liittKpl: number; fsecKpl: number; kassa: number }
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

/**
 * % tavoitteesta -solu. Portaikko tulee jaettuna `runRateTaso`sta, jotta se
 * on sama luku samalla värillä myös Myyntiseurannassa ja hubissa. Vanha
 * neliportainen 80/60/50 -asteikko vertasi toteumaa tavoitteeseen; uusi
 * vertaa **ennustetta**, joten raja on 100/90.
 */
const RUNRATE_VARIT = {
  hyva: { bg: '#dcfce7', fg: '#3B6D11' },
  rajalla: { bg: '#fef9c3', fg: '#854F0B' },
  heikko: { bg: '#fee2e2', fg: '#A32D2D' },
  tuntematon: { bg: 'transparent', fg: '#bbb' },
}

function PctCell({ pct }: { pct: number | null }) {
  const v = RUNRATE_VARIT[runRateTaso(pct)]
  return (
    <td style={{padding:'8px 10px', textAlign:'center', background: v.bg, color: v.fg, fontWeight:600, fontSize:13}}>
      {pct === null ? '–' : `${fmt(pct)} %`}
    </td>
  )
}

/**
 * Infopalkki. Näyttää **kaksi eri työpäivälukua**, ja ero on tarkoituksellinen:
 *
 * - *päättyneet* on ennusteen nimittäjä, raja eilisessä (`ikkuna`)
 * - *kulunut % kuukaudesta* on vanha infoluku joka laskee kuluvan päivän
 *   mukaan. Se ei ole enää väriraja missään — ennuste huomioi ajan
 *   kulumisen jo itse — mutta se jää näkyviin taustatiedoksi.
 */
function WorkdayInfo({ kuukausi, ikkuna }: {
  kuukausi: string
  ikkuna: { paattyneet: number; kaikki: number } | null
}) {
  const { paiva, paiviaKuukaudessa, kulunutPct: pct } = tyopaivaTilanne()
  const kulunutPct = Math.round(pct)

  return (
    <div style={{background:'#E6F1FB', borderRadius:10, padding:'10px 16px', marginBottom:16, display:'flex', gap:24, fontSize:13, color:'#185FA5', flexWrap:'wrap'}}>
      <span><strong>{kuukausi}</strong></span>
      <span>📅 Tänään päivä {paiva}/{paiviaKuukaudessa}</span>
      {ikkuna && <span>🏪 Myymälä: {ikkuna.paattyneet}/{ikkuna.kaikki} työpäivää päättynyt (ma-la, ei pyhiä, ei tätä päivää)</span>}
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
  const [stores, setStores] = useState<Record<string, StoreRow>>({})
  const [runrate, setRunrate] = useState<RunRateData | null>(null)

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

  // Myymälätason toteumat ja run raten tavoitteet. Tavoitereitti luetaan
  // Drivestä ilman välimuistia, jotta taulukon muokkaus näkyy heti.
  useEffect(() => {
    if (!selectedFile) return
    setStores({}); setRunrate(null)
    fetch(`/api/sheets?fileId=${selectedFile}`)
      .then(r => r.json())
      .then(d => setStores(d.stores ?? {}))
      .catch(() => setStores({}))
    fetch(`/api/runrate?fileId=${selectedFile}`)
      .then(r => r.json())
      .then(d => setRunrate(d.error ? null : d))
      .catch(() => setRunrate(null))
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

  // --- Run rate ---
  //
  // Tavoitteet tulevat Drivestä, eivät enää `TargetRow`in *Tavoite-kentistä:
  // ne ovat myyntiseurantataulukon Tavoitteet-välilehden lukuja, joka ei ole
  // enää tavoitteiden lähde. Kentät jäävät rajapintaan toistaiseksi, jotta
  // vanha PWA ei kaadu puuttuvaan kenttään.
  const rrMyymalaTavoitteet = Object.fromEntries((runrate?.tavoitteet.myymalat ?? []).map(m => [m.storeKey, m]))
  const rrMyyjaTavoitteet = Object.fromEntries((runrate?.tavoitteet.myyjat ?? []).map(m => [m.nimi, m]))
  const rrMyymalaToteumat: RunRateToteuma[] = Object.entries(stores).map(([nimi, s]) => ({
    nimi, liittymat: s.liittKpl, fsecure: s.fsecKpl, kassakate: s.kassa,
  }))
  // Myyjän kassakate luetaan Kassakate-välilehdeltä sellaisenaan (alv 0),
  // toisin kuin Myyntiseurannan myyjärivillä jossa se on kassaprovisiona.
  const rrMyyjaToteumat: RunRateToteuma[] = data.map(r => ({
    nimi: r.nimi, liittymat: r.liittKpl, fsecure: r.fsecKpl, kassakate: r.kassaKate,
  }))
  const myyjaIkkuna = (nimi: string) => runrate?.myyjaVuorot[nimi] ?? { paattyneet: 0, kaikki: 0 }

  // Kassamyynti-välilehden tavoite ja ennuste kulkevat samaa laskentaa kuin
  // run rate -taulukot: yksi "% tavoitteesta" sivulla, ei kahta eri kaavaa
  // saman otsikon alla.
  const kassaRr = (r: TargetRow) => {
    const { paattyneet, kaikki } = myyjaIkkuna(r.nimi)
    return runRateMittari(r.kassaKate, rrMyyjaTavoitteet[r.nimi]?.kassakate ?? null, paattyneet, kaikki)
  }
  const kassaRrYhteensa = runRateMittari(
    totals.kassaKate,
    tavoiteSumma(Object.values(rrMyyjaTavoitteet)).kassakate,
    runrate?.tyopaivat.paattyneet ?? 0,
    runrate?.tyopaivat.kaikki ?? 0,
  )

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
          <WorkdayInfo kuukausi={kuukausi} ikkuna={runrate?.tyopaivat ?? null} />

          <div style={{display:'flex', gap:8, marginBottom:16}}>
            {tabBtn('Tavoitteet & Runrate', 'tavoitteet')}
            {tabBtn('Uusmyynti', 'uusmyynti')}
            {tabBtn('Kassamyynti', 'kassamyynti')}
          </div>

          {tab === 'tavoitteet' && (runrate ? (<>
            {runrate.varoitukset.length > 0 && (
              <div style={{background:'#FEF6E7', border:'0.5px solid #F0C674', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:12.5, color:'#854F0B'}}>
                {runrate.varoitukset.map((v, i) => <div key={i}>⚠ {v}</div>)}
              </div>
            )}

            <RunRateTaulukko
              otsikko={`Myymälät — Run Rate ${kuukausi}`}
              sarakeOtsikko="Myymälä"
              ikkuna={runrate.tyopaivat}
              rivit={myymalaRivit(rrMyymalaToteumat, rrMyymalaTavoitteet, runrate.tyopaivat)}
              yhteensa={yhteensaRivi(rrMyymalaToteumat, runrate.tavoitteet.yhteensa, runrate.tyopaivat)}
              tyhjaViesti="Myymälärivejä ei löytynyt tästä taulukosta."
            />

            <RunRateTaulukko
              otsikko="Myyjät — Run Rate"
              sarakeOtsikko="Myyjä"
              ikkuna={runrate.tyopaivat}
              naytaIkkunaSarake
              rivit={myyjaRivit(rrMyyjaToteumat, rrMyyjaTavoitteet, runrate.myyjaVuorot)}
              yhteensa={yhteensaRivi(
                rrMyyjaToteumat,
                tavoiteSumma(Object.values(rrMyyjaTavoitteet)),
                runrate.tyopaivat,
              )}
            />
          </>) : (
            <div style={{textAlign:'center', padding:40, color:'#888', fontSize:14}}>Ladataan tavoitteita Drivestä...</div>
          ))}

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
                      <th style={th}>Ennuste</th>
                      <th style={th}>% tavoitteesta</th>
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
                        <td style={{...td, color:'#888'}}>{kassaRr(r).tavoite === null ? '–' : `${fmt(kassaRr(r).tavoite as number)} €`}</td>
                        <td style={{...td, color:'#185FA5', fontWeight:500}}>{fmt(r.kassaPerPaiva, 2)} €</td>
                        <td style={{...td, color:'#185FA5', fontWeight:500}}>{kassaRr(r).ennuste === null ? '–' : `${fmt(kassaRr(r).ennuste as number)} €`}</td>
                        <PctCell pct={kassaRr(r).pct} />
                      </tr>
                    ))}
                    <tr>
                      <td style={totL}>Yhteensä</td>
                      <td style={tot}>{fmt(totals.kassaMyynti)} €</td>
                      <td style={{...tot, color:'#A32D2D'}}>{fmt(totals.kassaPalautus)} €</td>
                      <td style={{...tot, color:'#A32D2D'}}>{fmt(totals.kassaAlennus)} €</td>
                      <td style={{...tot, color:'#888'}}>{fmt(totals.kassaKuitit)}</td>
                      <td style={tot}>{fmt(totals.kassaKate)} €</td>
                      <td style={{...tot, color:'#888'}}>{kassaRrYhteensa.tavoite === null ? '–' : `${fmt(kassaRrYhteensa.tavoite)} €`}</td>
                      <td style={tot}></td>
                      <td style={{...tot, color:'#185FA5'}}>{kassaRrYhteensa.ennuste === null ? '–' : `${fmt(kassaRrYhteensa.ennuste)} €`}</td>
                      <PctCell pct={kassaRrYhteensa.pct} />
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
