'use client'
import { rjMobComparisons, rjMobViewData, viewFingerprint, setRjMobSelection } from '@/lib/arxcian/rjmobView'
import { kuukausiTiedostonimesta } from '@/lib/rjmobTavoiteTaulukko'
import { Suspense, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { RjMobNav } from '@/components/rjmob/RjMobNav'
import { RunRateTaulukko } from '@/components/rjmob/RunRateTaulukko'
import { UusmyyntiTaulukko, KassamyyntiTaulukko, type TargetRow } from '@/components/rjmob/TavoiteTaulukot'
import { tehoaEiArvioida as eiTehoa, myymalanTehot, tehoTaso, runRateMittari } from '@/lib/rjmob'
import type { RunRateData } from '@/lib/rjmobRunRate'
import { tyopaivaTilanne } from '@/lib/rjmobWorkdays'

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

/**
 * Sivun kolme näkymää. Siirtyivät tänne 1.9.2026 kun Tavoitteet ja Run Rate
 * -välilehti poistettiin: sama data oli kahdessa paikassa, ja uusmyynti sekä
 * kassamyynti vaativat erilliselle välilehdelle käymistä.
 *
 * Valittu näkymä on URL-parametrissa eikä pelkässä tilassa, jotta näkymän voi
 * linkittää ja selaimen takaisin-nappi toimii. Tuntematon arvo putoaa
 * oletukseen — linkin rikkoutuminen ei saa jättää sivua tyhjäksi.
 */
type Nakyma = 'tavoitteet' | 'uusmyynti' | 'kassamyynti'

const NAKYMAT: { id: Nakyma; label: string }[] = [
  { id: 'tavoitteet', label: 'Myynti & Runrate' },
  { id: 'uusmyynti', label: 'Uusmyynti' },
  { id: 'kassamyynti', label: 'Kassamyynti' },
]

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

/**
 * `useSearchParams` vaatii Suspense-rajan, muuten koko sivu putoaisi
 * käännösaikana asiakasrenderöintiin. Fallback on tyhjä: sisältö tulee
 * hakupyynnöistä eikä palvelimelta, joten latausviesti tulee sisältä.
 */
export default function EtelanHaratPage() {
  return (
    <Suspense fallback={null}>
      <EtelanHaratSivu />
    </Suspense>
  )
}

function EtelanHaratSivu() {
  const [files, setFiles] = useState<DriveFile[]>([])
  const [filesVirhe, setFilesVirhe] = useState('')
  const [selectedFile, setSelectedFile] = useState('')
  const [sellers, setSellers] = useState<SellerResult[]>([])
  const [stores, setStores] = useState<Record<string, StoreData>>({})
  const [kuukausi, setKuukausi] = useState('')
  const [lahde, setLahde] = useState('')
  const [puutteet, setPuutteet] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [runrate, setRunrate] = useState<RunRateData | null>(null)
  const [runrateLoading, setRunrateLoading] = useState(true)
  const [runrateVirhe, setRunrateVirhe] = useState('')
  // Uusmyynti- ja Kassamyynti-näkymien rivit. Oma reittinsä (`/api/targets`)
  // eikä /api/sheets, koska ne ovat myyntiseurantataulukon myyjäkohtaisia
  // lukuja joita myymälälukujen lukupää ei tuota.
  const [kassaRaportti, setKassaRaportti] = useState<import('@/lib/winposArchive/read').CashReport | null>(null)
  const [targets, setTargets] = useState<TargetRow[]>([])
  const [targetsVirhe, setTargetsVirhe] = useState('')
  const [targetsVaroitukset, setTargetsVaroitukset] = useState<string[]>([])
  // Alkuarvo `true`: ennen ensimmäistä hakua tyhjä lista ei ole "ei dataa"
  // vaan "ei vielä haettu", ja väärä tyhjä näyttäisi mitatulta tulokselta.
  const [targetsLoading, setTargetsLoading] = useState(true)

  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const pyydetty = params.get('nakyma')
  const nakyma: Nakyma = NAKYMAT.some(n => n.id === pyydetty) ? (pyydetty as Nakyma) : 'tavoitteet'

  const vaihdaNakyma = (id: Nakyma) => {
    const p = new URLSearchParams(params.toString())
    // Oletusnäkymä ilman parametria: jaettu osoite pysyy siistinä eikä
    // takaisin-nappi jää pyörimään kahden identtisen tilan välillä.
    if (id === 'tavoitteet') p.delete('nakyma')
    else p.set('nakyma', id)
    const q = p.toString()
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }

  useEffect(() => {
    let active = true
    fetch('/api/files')
      .then(async r => {
        const d = await r.json()
        if (!r.ok || d.error) throw new Error(d.error ?? 'Kuukausien haku epäonnistui.')
        return d
      })
      .then(d => {
        if (!active) return
        const sheets = (d.files ?? []).filter((f: DriveFile) =>
          f.mimeType === 'application/vnd.google-apps.spreadsheet'
        ).sort((a: DriveFile, b: DriveFile) => (kuukausiTiedostonimesta(b.name)?.order ?? 0) - (kuukausiTiedostonimesta(a.name)?.order ?? 0))
        setFiles(sheets)
        if (sheets.length > 0) setSelectedFile(sheets[0].id)
        else { setFilesVirhe('Myyntiseurannan kuukausitiedostoja ei löytynyt.'); setTargetsLoading(false) }
      })
      .catch(() => { if (active) { setFilesVirhe('Kuukausien haku epäonnistui. Lataa sivu uudelleen.'); setTargetsLoading(false) } })
    return () => { active = false }
  }, [])

  const [paivitys, setPaivitys] = useState(0)
  useEffect(() => {
    const paivita = () => { if (document.visibilityState === 'visible') setPaivitys(n => n + 1) }
    const timer = window.setInterval(paivita, 60_000)
    window.addEventListener('focus', paivita)
    document.addEventListener('visibilitychange', paivita)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', paivita)
      document.removeEventListener('visibilitychange', paivita)
    }
  }, [])

  useEffect(() => {
    if (!selectedFile) return
    let active = true
    setLoading(true)
    setSellers([]); setStores({}); setKuukausi(''); setPuutteet([]); setLahde('')
    fetch(`/api/sheets?fileId=${selectedFile}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!active) return
        if (d.error) setPuutteet([d.error])
        if (d.sellers) {
          const sorted = [...d.sellers]
            .filter((s: SellerResult) => s.tyyppi !== 'standi')
            .sort((a: SellerResult, b: SellerResult) => {
              if (a.nimi.includes('Albin')) return 1
              if (b.nimi.includes('Albin')) return -1
              return (b.myyntiTeho ?? 0) - (a.myyntiTeho ?? 0)
            })
          setSellers(sorted)
          setStores(d.stores ?? {})
          setKuukausi(d.kuukausi ?? '')
          setLahde(d.lahde ?? '')
          setPuutteet(d.puutteet ?? [])
        }
        setLoading(false)
      })
      .catch(() => { if (active) { setPuutteet(['Myyntitietojen haku epäonnistui. Lataa sivu uudelleen.']); setLoading(false) } })
    return () => { active = false }
  }, [selectedFile, paivitys])

  // Tavoitteet ja työpäivät omasta reitistään: ne luetaan Drivestä ilman
  // välimuistia, kun taas /api/sheets saa yhä cachettaa toteumat.
  useEffect(() => {
    if (!selectedFile) return
    let active = true
    setRunrateLoading(true)
    setRunrate(null)
    setRunrateVirhe('')
    fetch(`/api/runrate?fileId=${selectedFile}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (active) { setRunrate(d.error ? null : d); setRunrateVirhe(d.error ?? ''); setRunrateLoading(false) } })
      .catch(() => { if (active) { setRunrate(null); setRunrateLoading(false); setRunrateVirhe('Tavoitteiden haku epäonnistui. Vaihda kuukautta tai lataa sivu uudelleen.') } })
    return () => { active = false }
  }, [selectedFile, paivitys])

  // Haetaan kuukauden vaihtuessa eikä näkymän: näkymän vaihto ei saa tehdä
  // uutta hakua eikä jättää edellisen kuukauden rivejä näkyviin.
  useEffect(() => {
    if (!selectedFile) return
    let active = true
    setKassaRaportti(null); setTargets([]); setTargetsVirhe(''); setTargetsVaroitukset([]); setTargetsLoading(true)
    fetch(`/api/targets?fileId=${selectedFile}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!active) return; if (d.error) setTargetsVirhe(d.error); else { setKassaRaportti(d.kassaRaportti ?? null); setTargets(d.targets ?? []); setTargetsVaroitukset(d.varoitukset ?? []) } })
      .catch(e => { if (active) setTargetsVirhe(String(e)) })
      .finally(() => { if (active) setTargetsLoading(false) })
    return () => { active = false }
  }, [selectedFile, paivitys])

  const fmt = (n: number) => n.toLocaleString('fi-FI', {minimumFractionDigits: 2, maximumFractionDigits: 2})

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

  // Albin jää keskiarvon ulkopuolelle samasta syystä kuin hänen rivinsä
  // teholuvuista: hän ei tee myyntivuoroja, joten hänen tuntinsa ja
  // provisionsa vääristäisivät tiimin lukua kumpaankin suuntaan.
  const tehoRivit = sellers.filter(s => !eiTehoa(s.nimi))
  // Total teho poistettiin myyjätaulukosta 1.9.2026: kaksi tehomittaria
  // riittää johtamiskeskusteluun, ja kolmas luku samalla rivillä hämärsi sen
  // kumpaa katsotaan. Laskenta jää `laskeMyyja`an — `rjmobInsights` lukee
  // `tehoTotal`ia yhä, eikä `rjmobTeho.test.mts` päästä sitä katoamaan.
  const sellerTeho = {
    liitt: yhteisTeho(tehoRivit, s => s.myyntiTehoLiitt, s => s.tunnit),
    kassa: yhteisTeho(tehoRivit, s => s.myyntiTeho, s => s.tunnit),
  }

  const storeTeho = {
    liitt: yhteisTeho(Object.values(stores), s => myymalanTehot(s).liitt, s => s.tunnit),
    kassa: yhteisTeho(Object.values(stores), s => myymalanTehot(s).kassa, s => s.tunnit),
    total: yhteisTeho(Object.values(stores), s => myymalanTehot(s).total, s => s.tunnit),
  }

  const comparisons = rjMobComparisons({ sellers, stores }, runrate, targets)
  const myymalaEnnusteRivit = comparisons.stores
  const myyjaEnnusteRivit = comparisons.sellers
  const kassaRr = comparisons.cash
  const kassaRrYhteensa = comparisons.cashTotal
  const fingerprint = viewFingerprint(rjMobViewData(nakyma, comparisons, targetsVirhe ? null : targets, kassaRaportti))
  useEffect(() => {
    setRjMobSelection(selectedFile && !loading && !targetsLoading && !runrateLoading ? { route: '/arxcian/rj-mob/etela', fileId: selectedFile, view: nakyma, fingerprint } : undefined)
    return () => setRjMobSelection(undefined)
  }, [selectedFile, nakyma, fingerprint, loading, targetsLoading, runrateLoading])

  /** Otsikoihin ilman "Myyntiseuranta"-etuliitettä, kuten run rate -taulukoissa. */
  const kuukausiLyhyt = kuukausi.replace('Myyntiseuranta ', '')

  const thStyle = {padding:'8px 10px', fontSize:11, fontWeight:500, color:'#888', textAlign:'right' as const, borderBottom:'1px solid #ddd', whiteSpace:'nowrap' as const, background:'#f8f8f6'}
  const thLStyle = {...thStyle, textAlign:'left' as const}
  const tdStyle = {padding:'7px 10px', fontSize:12, textAlign:'right' as const, borderBottom:'0.5px solid #f0f0f0', whiteSpace:'nowrap' as const}
  const tdLStyle = {...tdStyle, textAlign:'left' as const, fontWeight:500}
  const totStyle = {...tdStyle, fontWeight:600, background:'#f8f8f6', borderTop:'1px solid #ddd'}
  const totLStyle = {...totStyle, textAlign:'left' as const}

  // Kynnys tulee jaettuna rjmob.ts:stä, jotta se on sama kuin tuottoseurannassa,
  // run ratessa ja yhteenvedossa. `liittyma`-lippu valitsee liittymätehon oman
  // matalamman vihreän rajan (8,5 €/h): liittymäteho on kolmesta aina pienin,
  // joten yhteisellä 9:llä se olisi punainen myös kunnossa olevalla myynnillä.
  const tehoColor = (teho: number, liittyma = false) => {
    const taso = tehoTaso(teho, liittyma)
    return taso === 'hyva' ? '#3B6D11' : taso === 'rajalla' ? '#854F0B' : '#A32D2D'
  }
  const tehoSolu = (teho: number, liittyma = false) => ({...tdStyle, color: tehoColor(teho, liittyma), fontWeight:500})
  const tehoTot = (teho: number, liittyma = false) => ({...totStyle, color: tehoColor(teho, liittyma)})
  // Tehosarakkeen solu. Asteikko annetaan eksplisiittisesti eikä
  // päätellä indeksistä: sarakejärjestyksen vaihtaminen siirtäisi muuten
  // liittymän 8,5-rajan hiljaa väärään sarakkeeseen ilman että mikään kaatuu.
  const tehoTd = (n: number | undefined, key: number, liittyma = false) => Number.isFinite(n)
    ? <td key={key} style={tehoSolu(n as number, liittyma)}>{fmt(n as number)} €/h</td>
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

  const pageLoading = loading || runrateLoading || targetsLoading

  return (
    <div>
      <RjMobNav activePage="/arxcian/rj-mob/etela" files={files} selectedFile={selectedFile} onFileChange={setSelectedFile} />

      <div style={{maxWidth:1100, margin:'0 auto', padding:'16px'}}>

        {filesVirhe && <div role="alert" style={{padding:12, color:'#A32D2D'}}>{filesVirhe}</div>}
        {pageLoading && <div style={{textAlign:'center', padding:40, color:'#888', fontSize:14}}>Ladataan...</div>}

        {!pageLoading && sellers.length > 0 && (
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


        {/* Tilarivi ja näkymänapit ovat kaikkien kolmen näkymän yläpuolella:
            kuukausi ja työpäivätilanne koskevat niitä kaikkia. */}
        {!pageLoading && kuukausi && (
          <WorkdayInfo kuukausi={kuukausiLyhyt} ikkuna={runrate?.tyopaivat ?? null} />
        )}

        {!pageLoading && (
          <div style={{display:'flex', gap:8, marginBottom:16, overflowX:'auto', paddingBottom:2}}>
            {NAKYMAT.map(n => (
              <button key={n.id} onClick={() => vaihdaNakyma(n.id)}
                style={{
                  padding:'8px 16px', borderRadius:8, border:'0.5px solid #ddd', cursor:'pointer', fontSize:13,
                  whiteSpace:'nowrap', flexShrink:0,
                  fontWeight: nakyma === n.id ? 500 : 400,
                  background: nakyma === n.id ? '#185FA5' : 'white',
                  color: nakyma === n.id ? 'white' : '#555',
                }}>
                {n.label}
              </button>
            ))}
          </div>
        )}

        {nakyma === 'tavoitteet' && (<>

        {/* Puuttuva sarake ei palauta nollaa vaan puutteen, ja puute näkyy
            tässä: nolla näyttäisi mitatulta tulokselta. */}
        {!pageLoading && puutteet.length > 0 && (
          <div style={{background:'#FDECEC', border:'0.5px solid #E0A0A0', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:12.5, color:'#A32D2D'}}>
            {puutteet.map((v, i) => <div key={i}>⚠ {v}</div>)}
          </div>
        )}

        {!pageLoading && runrateVirhe && <div role="alert" style={{ padding: 14, color: '#A32D2D' }}>{runrateVirhe}</div>}

        {!pageLoading && runrate && (
          <>
            {runrate.varoitukset.length > 0 && (
              <div style={{background:'#FEF6E7', border:'0.5px solid #F0C674', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:12.5, color:'#854F0B'}}>
                {runrate.varoitukset.map((v, i) => <div key={i}>⚠ {v}</div>)}
              </div>
            )}

            <RunRateTaulukko
              otsikko={`Myymälät — Run Rate ${runrate.kuukausi.replace('Myyntiseuranta ', '')}`}
              sarakeOtsikko="Myymälä"
              ikkuna={runrate.tyopaivat}
              rivit={myymalaEnnusteRivit}
              yhteensa={comparisons.storeTotal!}
            />

            <RunRateTaulukko
              otsikko="Myyjät — Run Rate"
              sarakeOtsikko="Myyjä"
              ikkuna={runrate.tyopaivat}
              naytaIkkunaSarake
              rivit={myyjaEnnusteRivit}
              yhteensa={comparisons.sellerTotal!}
            />
          </>
        )}

        {!pageLoading && sellers.length > 0 && (
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
                      <th style={thStyle}>Liitt+Kassa teho</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellers.map((s, i) => {
                      const provisio = s.liittEur + s.fsecEur + s.kassa
                      return (
                        <tr key={s.nimi} style={{background: !eiTehoa(s.nimi) && s.tunnit > 0 && Number.isFinite(s.myyntiTeho) && s.myyntiTeho! < 7 ? '#FDECEC' : i % 2 === 0 ? 'white' : '#fafafa'}}>
                          <td style={tdLStyle}>{i+1}</td>
                          <td style={tdLStyle}>{s.nimi}</td>
                          <td style={tdStyle}>{fmt(s.liittEur)} €</td>
                          <td style={tdStyle}>{s.liittKpl}</td>
                          <td style={tdStyle}>{fmt(s.fsecEur)} €</td>
                          <td style={{...tdStyle, fontWeight:500, ...(s.fsecKpl > 10 ? {color:'#15803d'} : {})}}>{s.fsecKpl}</td>
                          <td style={tdStyle}>{fmt(s.kassa)} €</td>
                          <td style={tdStyle}>{fmt(s.tunnit)}</td>
                          <td style={{...tdStyle, fontWeight:500}}>{fmt(provisio)} €</td>
                          {eiTehoa(s.nimi) ? (
                            // Tyhjä, ei nollaa eikä selitystä: nolla näyttäisi
                            // mitatulta tulokselta ja värittyisi punaiseksi.
                            <td style={tdStyle} colSpan={2} />
                          ) : (
                            <>
                              {tehoTd(s.myyntiTeho, 1)}
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
                      <td style={tehoTot(sellerTeho.kassa)}>{fmt(sellerTeho.kassa)} €/h</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* MYYMÄLÄT */}
            <div style={{background:'white', border:'0.5px solid #eee', borderRadius:12, marginBottom:16, overflow:'hidden'}}>
              <div style={{padding:'12px 16px', borderBottom:'0.5px solid #eee'}}>
                <span style={{fontWeight:500, fontSize:14}}>Myymälät — {kuukausi}</span>
                {lahde && <span style={{fontSize:11, color:'#aaa', marginLeft:8}}>{lahde}</span>}
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
                      <th style={thStyle}>Liitt+Kassa teho</th>
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
                          <td style={{...tdStyle, fontWeight:500, ...(s.fsecKpl > 10 ? {color:'#15803d'} : {})}}>{s.fsecKpl}</td>
                          <td style={tdStyle}>{fmt(s.kassa)} €</td>
                          <td style={tdStyle}>{fmt(s.tunnit)}</td>
                          <td style={tehoSolu(t.kassa)}>{fmt(t.kassa)} €/h</td>
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
                      <td style={tehoTot(storeTeho.kassa)}>{fmt(storeTeho.kassa)} €/h</td>
                    </tr>

                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}


        </>)}

        {/* Uusmyynti ja Kassamyynti: siirretty Tavoitteet ja Run Rate -sivulta
            sellaisenaan. Virhe erotetaan tyhjästä kuukaudesta — tyhjä taulukko
            ilman selitystä näyttäisi siltä kuin myyntiä ei olisi ollut. */}
        {!pageLoading && nakyma === 'kassamyynti' && kassaRaportti && <div role="status" style={{padding:12,marginBottom:12,background:'#fff8e6'}}>Winpos-raportti {kassaRaportti.raporttiPvm}, tilanne {kassaRaportti.tilannePvm} asti.</div>}
        {!pageLoading && nakyma !== 'tavoitteet' && targetsVaroitukset.length > 0 && (
          <div role="status" style={{padding:12, marginBottom:12, background:'#fff8e6', fontSize:13}}>{targetsVaroitukset.join(' ')}</div>
        )}
        {!pageLoading && nakyma !== 'tavoitteet' && (
          targetsVirhe ? (
            <div style={{background:'#FCEBEB', border:'0.5px solid #F09595', borderRadius:10, padding:12, fontSize:13, color:'#A32D2D'}}>
              <strong>Virhe:</strong> {targetsVirhe}
            </div>
          ) : targetsLoading ? (
            <div style={{textAlign:'center', padding:40, color:'#888', fontSize:14}}>Ladataan...</div>
          ) : targets.length === 0 ? (
            <div style={{textAlign:'center', padding:40, color:'#888', fontSize:14}}>Ei myynti- tai tavoitetietoja tälle kuukaudelle.</div>
          ) : nakyma === 'uusmyynti' ? (
            <UusmyyntiTaulukko rivit={targets} kuukausi={kuukausiLyhyt} />
          ) : (
            <KassamyyntiTaulukko rivit={targets} kuukausi={kuukausiLyhyt} rr={kassaRr} rrYhteensa={kassaRrYhteensa} />
          )
        )}

      </div>
    </div>
  )
}
