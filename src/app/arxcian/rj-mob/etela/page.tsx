'use client'
import { useEffect, useState } from 'react'
import { RjMobNav } from '@/components/rjmob/RjMobNav'
import { tehoaEiArvioida as eiTehoa } from '@/lib/rjmob'

interface SellerResult {
  nimi: string
  tyyppi: string
  liittKpl: number
  liittEur: number
  fsecKpl: number
  fsecEur: number
  kassa: number
  tunnit: number
  // Myyntiseurannan asteikon teholuvut tulevat valmiina laskeMyyjalta: siellä
  // liittymäprovisio on x1 myös Krenarilla, kun taas tuottoseurannan `teho`
  // käyttää hänen nelinkertaista provisiotaan. F-Secure-leikkuri on molemmissa.
  // Valinnaisia tarkoituksella: /api/sheets on CDN-välimuistissa
  // (s-maxage=300), joten heti deployn jälkeen selain voi saada vielä
  // vanhan vastauksen josta nämä puuttuvat. Silloin näytetään viiva eikä
  // kaadeta sivua undefined.toLocaleString()-virheeseen.
  myyntiTehoLiitt?: number
  myyntiTeho?: number
  myyntiTehoTotal?: number
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
            .sort((a: SellerResult, b: SellerResult) => {
              if (a.nimi.includes('Albin')) return 1
              if (b.nimi.includes('Albin')) return -1
              return (b.myyntiTehoLiitt ?? 0) - (a.myyntiTehoLiitt ?? 0)
            })
          setSellers(sorted)
          setStores(d.stores ?? {})
          setKuukausi(d.kuukausi ?? '')
        }
        setLoading(false)
      })
  }, [selectedFile])

  const fmt = (n: number) => n.toLocaleString('fi-FI', {minimumFractionDigits: 2, maximumFractionDigits: 2})
  const fmtN = (n: number) => n.toLocaleString('fi-FI', {minimumFractionDigits: 0, maximumFractionDigits: 0})

  /**
   * Yhteensä-rivin teho on painotettu: Σ(provisio) / Σ(tunnit).
   *
   * Ennen tässä oli rivikohtaisten tehojen keskiarvo, joka antoi kahden tunnin
   * myyjälle saman painon kuin sadan tunnin myyjälle — luku ei siis vastannut
   * mitään todellista euroa tunnissa. Osoittaja johdetaan rivin omasta tehosta
   * (teho × tunnit), jolloin yhteensä-rivi on väistämättä samasta pohjasta kuin
   * rivit sen yllä.
   */
  const yhteisTeho = <T,>(rivit: T[], teho: (r: T) => number | undefined, tunnit: (r: T) => number) => {
    const kelpaa = rivit.filter(r => Number.isFinite(teho(r)) && Number.isFinite(tunnit(r)))
    const h = kelpaa.reduce((s, r) => s + tunnit(r), 0)
    return h > 0 ? kelpaa.reduce((s, r) => s + (teho(r) as number) * tunnit(r), 0) / h : 0
  }

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

  /**
   * Myymälän kolme teholukua (myyntiseuranta_ohje).
   *
   * Kassakatteena on `kassaRjmob` (×1) eikä `kassa` (×10): myyjän `kassa` on
   * kassaprovisio ja myymälän `kassa` siitä johdettu kassakate, joten ilman
   * tätä myymälän teho olisi kymmenkertainen myyjiin nähden eikä 7/9 €/h
   * -kynnys tarkoittaisi samaa molemmissa taulukoissa. Sama valinta kuin
   * rjmobInsights.ts:n myymalanTeho-funktiossa.
   */
  const myymalanTehot = (s: StoreData) => ({
    liitt: s.tunnit > 0 ? s.liittEur / s.tunnit : 0,
    kassa: s.tunnit > 0 ? (s.liittEur + s.kassaRjmob) / s.tunnit : 0,
    total: s.tunnit > 0 ? (s.liittEur + s.kassaRjmob + (s.fsecEur ?? 0)) / s.tunnit : 0,
  })

  // Albin jää keskiarvon ulkopuolelle samasta syystä kuin hänen rivinsä
  // teholuvuista: hän ei tee myyntivuoroja, joten hänen tuntinsa ja
  // provisionsa vääristäisivät tiimin lukua kumpaankin suuntaan.
  const tehoRivit = sellers.filter(s => !eiTehoa(s.nimi))
  const sellerTeho = {
    liitt: yhteisTeho(tehoRivit, s => s.myyntiTehoLiitt, s => s.tunnit),
    kassa: yhteisTeho(tehoRivit, s => s.myyntiTeho, s => s.tunnit),
    total: yhteisTeho(tehoRivit, s => s.myyntiTehoTotal, s => s.tunnit),
  }

  const storeTeho = {
    liitt: yhteisTeho(Object.values(stores), s => myymalanTehot(s).liitt, s => s.tunnit),
    kassa: yhteisTeho(Object.values(stores), s => myymalanTehot(s).kassa, s => s.tunnit),
    total: yhteisTeho(Object.values(stores), s => myymalanTehot(s).total, s => s.tunnit),
  }

  const thStyle = {padding:'8px 10px', fontSize:11, fontWeight:500, color:'#888', textAlign:'right' as const, borderBottom:'1px solid #ddd', whiteSpace:'nowrap' as const, background:'#f8f8f6'}
  const thLStyle = {...thStyle, textAlign:'left' as const}
  const tdStyle = {padding:'7px 10px', fontSize:12, textAlign:'right' as const, borderBottom:'0.5px solid #f0f0f0', whiteSpace:'nowrap' as const}
  const tdLStyle = {...tdStyle, textAlign:'left' as const, fontWeight:500}
  const totStyle = {...tdStyle, fontWeight:600, background:'#f8f8f6', borderTop:'1px solid #ddd'}
  const totLStyle = {...totStyle, textAlign:'left' as const}

  // Sama kynnys kuin tuottoseurannassa ja run ratessa: 9 €/h hyvä, 7 €/h raja.
  const tehoColor = (teho: number) => teho >= 9 ? '#3B6D11' : teho >= 7 ? '#854F0B' : '#A32D2D'
  const tehoSolu = (teho: number) => ({...tdStyle, color: tehoColor(teho), fontWeight:500})
  const tehoTot = (teho: number) => ({...totStyle, color: tehoColor(teho)})
  const tehoTd = (n: number | undefined, key: number) => Number.isFinite(n)
    ? <td key={key} style={tehoSolu(n as number)}>{fmt(n as number)} €/h</td>
    : <td key={key} style={{...tdStyle, color:'#bbb'}}>—</td>

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
    <div>
      <RjMobNav activePage="/arxcian/rj-mob/etela" files={files} selectedFile={selectedFile} onFileChange={setSelectedFile} />

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
                      return (
                        <tr key={s.nimi} style={{background: i % 2 === 0 ? 'white' : '#fafafa'}}>
                          <td style={tdLStyle}>{i+1}</td>
                          <td style={tdLStyle}>{s.nimi}</td>
                          <td style={tdStyle}>{fmt(s.liittEur)} €</td>
                          <td style={tdStyle}>{s.liittKpl}</td>
                          <td style={tdStyle}>{fmt(s.fsecEur)} €</td>
                          <td style={{...tdStyle, fontWeight:500}}>{s.fsecKpl}</td>
                          <td style={tdStyle}>{fmt(s.kassa)} €</td>
                          <td style={tdStyle}>{fmt(s.tunnit)}</td>
                          <td style={{...tdStyle, fontWeight:500}}>{fmt(provisio)} €</td>
                          {eiTehoa(s.nimi) ? (
                            // Tyhjä, ei nollaa eikä selitystä: nolla näyttäisi
                            // mitatulta tulokselta ja värittyisi punaiseksi.
                            <td style={tdStyle} colSpan={3} />
                          ) : (
                            <>
                              {[s.myyntiTehoLiitt, s.myyntiTeho, s.myyntiTehoTotal].map(tehoTd)}
                            </>
                          )}
                        </tr>
                      )
                    })}
                    <tr>
                      <td style={totLStyle} colSpan={2}>Yhteensä</td>
                      <td style={totStyle}>{fmt(sellerTotals.liittEur)} €</td>
                      <td style={totStyle}>{sellerTotals.liittKpl}</td>
                      <td style={totStyle}>{fmt(sellerTotals.fsecEur)} €</td>
                      <td style={totStyle}>{sellerTotals.fsecKpl}</td>
                      <td style={totStyle}>{fmt(sellerTotals.kassa)} €</td>
                      <td style={totStyle}>{fmt(sellerTotals.tunnit)}</td>
                      <td style={totStyle}>{fmt(sellerTotals.liittEur + sellerTotals.fsecEur + sellerTotals.kassa)} €</td>
                      <td style={tehoTot(sellerTeho.liitt)}>{fmt(sellerTeho.liitt)} €/h</td>
                      <td style={tehoTot(sellerTeho.kassa)}>{fmt(sellerTeho.kassa)} €/h</td>
                      <td style={tehoTot(sellerTeho.total)}>{fmt(sellerTeho.total)} €/h</td>
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
                      const t = myymalanTehot(s)
                      return (
                        <tr key={nimi} style={{background: i % 2 === 0 ? 'white' : '#fafafa'}}>
                          <td style={tdLStyle}>{i+1}</td>
                          <td style={tdLStyle}>{nimi}</td>
                          <td style={tdStyle}>{fmt(s.liittEur)} €</td>
                          <td style={tdStyle}>{s.liittKpl}</td>
                          <td style={tdStyle}>{fmt(s.fsecEur ?? 0)} €</td>
                          <td style={{...tdStyle, fontWeight:500}}>{s.fsecKpl}</td>
                          <td style={tdStyle}>{fmt(s.kassa)} €</td>
                          <td style={tdStyle}>{fmt(s.tunnit)}</td>
                          <td style={tehoSolu(t.liitt)}>{fmt(t.liitt)} €/h</td>
                          <td style={tehoSolu(t.kassa)}>{fmt(t.kassa)} €/h</td>
                          <td style={tehoSolu(t.total)}>{fmt(t.total)} €/h</td>
                        </tr>
                      )
                    })}
                    <tr>
                      <td style={totLStyle} colSpan={2}>Yhteensä</td>
                      <td style={totStyle}>{fmt(storeTotals.liittEur)} €</td>
                      <td style={totStyle}>{storeTotals.liittKpl}</td>
                      <td style={totStyle}>{fmt(storeTotals.fsecEur)} €</td>
                      <td style={totStyle}>{storeTotals.fsecKpl}</td>
                      <td style={totStyle}>{fmt(storeTotals.kassa)} €</td>
                      <td style={totStyle}>{fmt(storeTotals.tunnit)}</td>
                      <td style={tehoTot(storeTeho.liitt)}>{fmt(storeTeho.liitt)} €/h</td>
                      <td style={tehoTot(storeTeho.kassa)}>{fmt(storeTeho.kassa)} €/h</td>
                      <td style={tehoTot(storeTeho.total)}>{fmt(storeTeho.total)} €/h</td>
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
