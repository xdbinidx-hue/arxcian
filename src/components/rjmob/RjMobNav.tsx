'use client'

/**
 * RJ-Mobin osionavigaatio. Sama palkki kaikilla RJ-Mobin sivuilla — aiemmin
 * jokainen sivu määritteli oman identtisen TopBar-kopionsa.
 *
 * Tyyli seuraa arxcianin ylänauhaa, mutta tausta on umpitumma eikä lasimainen:
 * palkki istuu RJ-Mobin valkoisen pinnan päällä, joten backdrop-blur sumentaisi
 * valkoista eikä tummaa taustaa ja lasiefekti katoaisi.
 *
 * Tiedostovalitsin näkyy vain niillä sivuilla jotka antavat `files`-listan
 * ja `onFileChange`-käsittelijän (tuotto, myyntiseuranta, run rate, tavoitteet).
 *
 * Palkki vierii itse vaakasuunnassa kapealla näytöllä. Ilman `overflow-x-auto`
 * se venytti koko sivun 835 pikselin levyiseksi puhelimessa, jolloin myös
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
    <div className="sticky top-[calc(3rem+env(safe-area-inset-top))] z-20 flex h-12 items-center overflow-x-auto overflow-y-hidden border-b border-ax-line bg-ax-bg px-4">
      {/* Ei linkki: arxcianin ylänauha ja osiopalkki vievät jo hubiin. */}
      <span className="mr-6 shrink-0 text-[13px] font-medium tracking-[0.14em] text-ax-text">
        RJ-Mob
      </span>
      {ITEMS.map(item => {
        const on = item.href === activePage
        return (
          <a
            key={item.href}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            className={`flex h-12 shrink-0 items-center whitespace-nowrap border-b-2 px-3.5 text-[13px] transition-colors ${
              on
                ? 'border-ax-accent text-ax-accent'
                : 'border-transparent text-ax-faint hover:text-ax-text'
            }`}
          >
            {item.label}
          </a>
        )
      })}
      {files.length > 0 && onFileChange && (
        <select
          value={selectedFile}
          onChange={e => onFileChange(e.target.value)}
          className="ml-2 shrink-0 cursor-pointer rounded-lg border border-ax-line bg-ax-panel px-2.5 py-1 text-xs text-ax-text"
        >
          {files.map(f => (
            <option key={f.id} value={f.id} className="bg-ax-panel text-ax-text">
              {f.name.replace('Myyntiseuranta ','').replace(' 2026','')}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
