'use client'
import { Suspense, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { RjMobNav } from '@/components/rjmob/RjMobNav'
import { RunRateTaulukko } from '@/components/rjmob/RunRateTaulukko'
import { UusmyyntiTaulukko, KassamyyntiTaulukko, type TargetRow } from '@/components/rjmob/TavoiteTaulukot'
import { tehoaEiArvioida as eiTehoa, myymalanTehot, tehoTaso, runRateMittari } from '@/lib/rjmob'
import { myymalaRivit, myyjaRivit, yhteensaRivi, tavoiteSumma, type RunRateToteuma } from '@/lib/rjmobRunRateRivit'
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
 * Rivit joita myymälätaulukko ei näytä, ja se osa jonka se näyttää mutta
 * myyjätaulukko ei. Palvelimen `Ulkopuoliset` sellaisenaan — kentät ovat
 * valinnaisia, koska /api/sheets on CDN-välimuistissa ja vanha vastaus voi
 * yhä olla ilman niitä.
 */
interface Era {
  liittKpl: number
  liittEur: number
  fsecKpl: number
  fsecEur: number
  kassa: number
  tunnit: number
}
interface Ulkopuoliset {
  standi: Era
  omatMuualla: Era
  muut: Era
  vieraatMyymaloissa: Era
  paikat: { nimi: string; liittKpl: number; kassa: number; tunnit: number }[]
}

/**
 * Myyjän `kassa` on kassaprovisio, myymälän `kassa` valmiiksi kassakate.
 * Run rate vertaa molempia samaan tavoitteeseen (kassakate, alv 0), joten
 * myyjärivi kerrotaan takaisin. Sama luku kuin `KASSAKATE_JAKAJA`
 * [rjmobSheets.ts](src/lib/rjmobSheets.ts):ssä, toiseen suuntaan — kertoimet
 * menevät tarkoituksella eri suuntiin, ks. CLAUDE.md.
 */
const KASSAKATE_KERROIN = 10

/**
 * Myymälätaulukon alle listattavat erät. Järjestys on selitysjärjestys:
 * ensin se mikä on myymälän luvussa mukana muttei myyjätaulukossa, sitten se
 * mikä on myyjätaulukossa muttei myymälän luvussa, ja lopuksi se mikä ei ole
 * kummassakaan.
 */
const ULKOPUOLISET_RIVIT: { avain: 'vieraatMyymaloissa' | 'omatMuualla' | 'standi' | 'muut'; label: string; selite: string }[] = [
  { avain: 'vieraatMyymaloissa', label: 'Muut myyjät myymälöissämme', selite: 'sisältyy yllä oleviin myymälälukuihin, ei myyjätaulukkoon' },
  { avain: 'omatMuualla', label: 'Omat myyjät muualla', selite: 'tapahtumat ym. — myyjätaulukossa mukana, myymälärivillä ei' },
  { avain: 'standi', label: 'Ständimyynti', selite: 'poistetaan aina myymälän tuloksesta' },
  { avain: 'muut', label: 'Muut myymälät', selite: 'muun organisaation myynti, ei RJ-Mobia' },
]

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
  { id: 'tavoitteet', label: 'Tavoitteet & Runrate' },
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
  const [selectedFile, setSelectedFile] = useState('')
  const [sellers, setSellers] = useState<SellerResult[]>([])
  const [stores, setStores] = useState<Record<string, StoreData>>({})
  const [kuukausi, setKuukausi] = useState('')
  const [lahde, setLahde] = useState('')
  const [puutteet, setPuutteet] = useState<string[]>([])
  const [ulkopuoliset, setUlkopuoliset] = useState<Ulkopuoliset | null>(null)
  const [loading, setLoading] = useState(false)
  const [runrate, setRunrate] = useState<RunRateData | null>(null)
  // Uusmyynti- ja Kassamyynti-näkymien rivit. Oma reittinsä (`/api/targets`)
  // eikä /api/sheets, koska ne ovat myyntiseurantataulukon myyjäkohtaisia
  // lukuja joita myymälälukujen lukupää ei tuota.
  const [targets, setTargets] = useState<TargetRow[]>([])
  const [targetsVirhe, setTargetsVirhe] = useState('')
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
          setLahde(d.lahde ?? '')
          setPuutteet(d.puutteet ?? [])
          setUlkopuoliset(d.ulkopuoliset ?? null)
        }
        setLoading(false)
      })
  }, [selectedFile])

  // Tavoitteet ja työpäivät omasta reitistään: ne luetaan Drivestä ilman
  // välimuistia, kun taas /api/sheets saa yhä cachettaa toteumat.
  useEffect(() => {
    if (!selectedFile) return
    setRunrate(null)
    fetch(`/api/runrate?fileId=${selectedFile}`)
      .then(r => r.json())
      .then(d => setRunrate(d.error ? null : d))
      .catch(() => setRunrate(null))
  }, [selectedFile])

  // Haetaan kuukauden vaihtuessa eikä näkymän: näkymän vaihto ei saa tehdä
  // uutta hakua eikä jättää edellisen kuukauden rivejä näkyviin.
  useEffect(() => {
    if (!selectedFile) return
    setTargets([]); setTargetsVirhe(''); setTargetsLoading(true)
    fetch(`/api/targets?fileId=${selectedFile}`)
      .then(r => r.json())
      .then(d => { if (d.error) setTargetsVirhe(d.error); else setTargets(d.targets ?? []) })
      .catch(e => setTargetsVirhe(String(e)))
      .finally(() => setTargetsLoading(false))
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

  // --- Run rate: tavoite, toteuma, ennuste ja % tavoitteesta ---
  //
  // Toteumat ovat samat luvut kuin teho-taulukoissa yllä, vain eri
  // yksikössä: myymälän `kassa` on jo kassakate, myyjän kassaprovisio.
  const rrMyymalaTavoitteet = Object.fromEntries((runrate?.tavoitteet.myymalat ?? []).map(m => [m.storeKey, m]))
  const rrMyyjaTavoitteet = Object.fromEntries((runrate?.tavoitteet.myyjat ?? []).map(m => [m.nimi, m]))
  const rrMyymalaToteumat: RunRateToteuma[] = Object.entries(stores).map(([nimi, s]) => ({
    nimi, liittymat: s.liittKpl, fsecure: s.fsecKpl, kassakate: s.kassa,
  }))
  const rrMyyjaToteumat: RunRateToteuma[] = sellers.map(s => ({
    nimi: s.nimi, liittymat: s.liittKpl, fsecure: s.fsecKpl, kassakate: s.kassa * KASSAKATE_KERROIN,
  }))

  // Kassamyynti-näkymän tavoite ja ennuste kulkevat samaa laskentaa kuin run
  // rate -taulukot: yksi "% tavoitteesta" sivulla, ei kahta eri kaavaa saman
  // otsikon alla. Toteuma tulee tässä `/api/targets`in `kassaKate`sta, joka on
  // jo kassakate (alv 0) — sitä ei siis kerrota `KASSAKATE_KERROIN`illa kuten
  // myyjärivin kassaprovisiota yllä.
  const myyjaIkkuna = (nimi: string) => runrate?.myyjaVuorot[nimi] ?? { paattyneet: 0, kaikki: 0 }
  const kassaRr = (r: TargetRow) => {
    const { paattyneet, kaikki } = myyjaIkkuna(r.nimi)
    return runRateMittari(r.kassaKate, rrMyyjaTavoitteet[r.nimi]?.kassakate ?? null, paattyneet, kaikki)
  }
  const kassaRrYhteensa = runRateMittari(
    targets.reduce((sum, r) => sum + r.kassaKate, 0),
    tavoiteSumma(Object.values(rrMyyjaTavoitteet)).kassakate,
    runrate?.tyopaivat.paattyneet ?? 0,
    runrate?.tyopaivat.kaikki ?? 0,
  )

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

  return (
    <div>
      <RjMobNav activePage="/arxcian/rj-mob/etela" files={files} selectedFile={selectedFile} onFileChange={setSelectedFile} />

      <div style={{maxWidth:1100, margin:'0 auto', padding:'16px'}}>

        {loading && <div style={{textAlign:'center', padding:40, color:'#888', fontSize:14}}>Ladataan...</div>}

        {/* Tilarivi ja näkymänapit ovat kaikkien kolmen näkymän yläpuolella:
            kuukausi ja työpäivätilanne koskevat niitä kaikkia. */}
        {!loading && kuukausi && (
          <WorkdayInfo kuukausi={kuukausiLyhyt} ikkuna={runrate?.tyopaivat ?? null} />
        )}

        {!loading && (
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
        {!loading && puutteet.length > 0 && (
          <div style={{background:'#FDECEC', border:'0.5px solid #E0A0A0', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:12.5, color:'#A32D2D'}}>
            {puutteet.map((v, i) => <div key={i}>⚠ {v}</div>)}
          </div>
        )}

        {!loading && runrate && (
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
              rivit={myymalaRivit(rrMyymalaToteumat, rrMyymalaTavoitteet, runrate.tyopaivat)}
              yhteensa={yhteensaRivi(rrMyymalaToteumat, runrate.tavoitteet.yhteensa, runrate.tyopaivat)}
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
          </>
        )}

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
                            <td style={tdStyle} colSpan={2} />
                          ) : (
                            <>
                              {tehoTd(s.myyntiTehoLiitt, 0, true)}
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
                      <td style={tehoTot(sellerTeho.liitt, true)}>{fmt(sellerTeho.liitt)} €/h</td>
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
                          <td style={tehoSolu(t.liitt, true)}>{fmt(t.liitt)} €/h</td>
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
                      <td style={tehoTot(storeTeho.liitt, true)}>{fmt(storeTeho.liitt)} €/h</td>
                      <td style={tehoTot(storeTeho.kassa)}>{fmt(storeTeho.kassa)} €/h</td>
                      <td style={tehoTot(storeTeho.total)}>{fmt(storeTeho.total)} €/h</td>
                    </tr>

                    {/* Rajauksen ulkopuoliset rivit. Nämä EIVÄT ole mukana
                        Yhteensä-rivissä — ne ovat tässä siksi, ettei mikään
                        katoaisi hiljaa jos suodatin joskus menee rikki, ja
                        koska juuri ne selittävät miksi myyjätaulukon summa on
                        eri kuin myymälätaulukon. */}
                    {ulkopuoliset && ULKOPUOLISET_RIVIT.map(({ avain, label, selite }) => {
                      const e = ulkopuoliset[avain]
                      if (!e || (e.liittKpl === 0 && e.kassa === 0 && e.fsecKpl === 0)) return null
                      return (
                        <tr key={avain} style={{background:'#fbfbf9', color:'#777'}}>
                          <td style={{...tdLStyle, color:'#bbb'}}>·</td>
                          <td style={{...tdLStyle, fontWeight:400}}>
                            {label}
                            <span style={{display:'block', fontSize:11, color:'#aaa'}}>{selite}</span>
                          </td>
                          <td style={tdStyle}>{fmt(e.liittEur)} €</td>
                          <td style={tdStyle}>{e.liittKpl}</td>
                          <td style={tdStyle}>{fmt(e.fsecEur)} €</td>
                          <td style={tdStyle}>{e.fsecKpl}</td>
                          <td style={tdStyle}>{fmt(e.kassa)} €</td>
                          <td style={tdStyle}>{fmt(e.tunnit)}</td>
                          <td style={tdStyle} colSpan={3} />
                        </tr>
                      )
                    })}
                    {ulkopuoliset && ulkopuoliset.paikat.length > 0 && (
                      <tr>
                        <td colSpan={11} style={{...tdStyle, textAlign:'left', fontSize:11, color:'#aaa', padding:'6px 10px 10px 40px'}}>
                          Tapahtumat ja muut paikat: {ulkopuoliset.paikat
                            .map(pk => `${pk.nimi} ${fmtN(pk.liittKpl)} kpl`).join(' · ')}
                        </td>
                      </tr>
                    )}

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

        </>)}

        {/* Uusmyynti ja Kassamyynti: siirretty Tavoitteet ja Run Rate -sivulta
            sellaisenaan. Virhe erotetaan tyhjästä kuukaudesta — tyhjä taulukko
            ilman selitystä näyttäisi siltä kuin myyntiä ei olisi ollut. */}
        {!loading && nakyma !== 'tavoitteet' && (
          targetsVirhe ? (
            <div style={{background:'#FCEBEB', border:'0.5px solid #F09595', borderRadius:10, padding:12, fontSize:13, color:'#A32D2D'}}>
              <strong>Virhe:</strong> {targetsVirhe}
            </div>
          ) : targetsLoading ? (
            <div style={{textAlign:'center', padding:40, color:'#888', fontSize:14}}>Ladataan...</div>
          ) : targets.length === 0 ? (
            <div style={{textAlign:'center', padding:40, color:'#888', fontSize:14}}>Ei tavoitedataa tälle kuukaudelle.</div>
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
