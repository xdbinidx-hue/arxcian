'use client'

/**
 * RJ-Mobin osionavigaatio. Sama palkki kaikilla RJ-Mobin sivuilla — aiemmin
 * jokainen sivu määritteli oman identtisen TopBar-kopionsa.
 *
 * Tiedostovalitsin näkyy vain niillä sivuilla jotka antavat `files`-listan
 * ja `onFileChange`-käsittelijän (tuotto, myyntiseuranta, run rate, tavoitteet).
 *
 * Palkki vierii itse vaakasuunnassa kapealla näytöllä. Ilman `overflowX` se
 * venytti koko sivun 835 pikselin levyiseksi puhelimessa, jolloin myös
 * arxcianin ylänauha ja osiopalkki raahautuivat mukana.
 */

/** Riittää kaikille sivujen omille DriveFile-tyypeille: vain nämä kentät luetaan. */
type FileOption = { id: string; name: string }

const ITEMS = [
  {label:'Tuottoseuranta', href:'/arxcian/rj-mob/tuotto'},
  {label:'Trendit', href:'/arxcian/rj-mob/trendit'},
  {label:'Kassamyynti', href:'/arxcian/rj-mob/kassamyynti'},
  {label:'Myyntiseuranta', href:'/arxcian/rj-mob/etela'},
  {label:'Tavoitteet ja Run Rate', href:'/arxcian/rj-mob/tavoitteet'},
  {label:'Laskuri', href:'/arxcian/rj-mob/laskuri'},
  {label:'Työvuorot', href:'/arxcian/rj-mob/tyovuorot'},
]

export function RjMobNav({ activePage, files = [], selectedFile = '', onFileChange }: {
  activePage?: string
  files?: FileOption[]
  selectedFile?: string
  onFileChange?: (id: string) => void
}) {
  return (
    <div style={{background:'white', borderBottom:'0.5px solid #eee', padding:'0 16px', display:'flex', alignItems:'center', height:48, position:'sticky', top:48, zIndex:10, gap:0, overflowX:'auto', overflowY:'hidden'}}>
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
