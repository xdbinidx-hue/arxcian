'use client'

/**
 * RJ-Mobin osionavigaatio. Sama palkki kaikilla RJ-Mobin sivuilla — aiemmin
 * jokainen sivu määritteli oman identtisen TopBar-kopionsa.
 *
 * Tiedostovalitsin näkyy vain niillä sivuilla jotka antavat `files`-listan
 * ja `onFileChange`-käsittelijän (tuotto, myyntiseuranta, run rate, tavoitteet).
 */

/** Riittää kaikille sivujen omille DriveFile-tyypeille: vain nämä kentät luetaan. */
type FileOption = { id: string; name: string }

const ITEMS = [
  {label:'Tuottoseuranta', href:'/rj-mob/tuotto'},
  {label:'Trendit', href:'/rj-mob/trendit'},
  {label:'Kassamyynti', href:'/rj-mob/kassamyynti'},
  {label:'Myyntiseuranta', href:'/rj-mob/etela'},
  {label:'Tavoitteet ja Run Rate', href:'/rj-mob/tavoitteet'},
  {label:'Laskuri', href:'/arxcian/rj-mob/laskuri'},
  {label:'Työvuorot', href:'/rj-mob/tyovuorot'},
]

export function RjMobNav({ activePage, files = [], selectedFile = '', onFileChange, stickyTop = 0 }: {
  activePage?: string
  files?: FileOption[]
  selectedFile?: string
  onFileChange?: (id: string) => void
  /** Kiinnityskorkeus. arxcianin kehyksen sisällä 48, koska ylänauha on siellä.
   *  Väliaikainen: poistuu kun kaikki sivut ovat siirtyneet kehyksen sisään. */
  stickyTop?: number
}) {
  return (
    <div style={{background:'white', borderBottom:'0.5px solid #eee', padding:'0 16px', display:'flex', alignItems:'center', height:48, position:'sticky', top:stickyTop, zIndex:10, gap:0}}>
      <a href="/arxcian" style={{fontWeight:700, fontSize:15, color:'#111', marginRight:24, whiteSpace:'nowrap', textDecoration:'none'}}>RJ-Mob</a>
      {ITEMS.map(item => {
        const on = item.href === activePage
        return (
          <a key={item.href} href={item.href} style={{
            fontSize:13, fontWeight: on ? 500 : 400,
            color: on ? '#185FA5' : '#666',
            textDecoration:'none', padding:'0 14px', height:48,
            display:'flex', alignItems:'center',
            borderBottom: on ? '2px solid #185FA5' : '2px solid transparent',
            whiteSpace:'nowrap'
          }}>{item.label}</a>
        )
      })}
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
