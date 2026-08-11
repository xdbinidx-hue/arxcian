import type { ReactNode } from 'react'

type PanelProps = {
  title: string
  /** Pieni lisätieto otsikkorivin oikeassa reunassa */
  meta?: string
  /** Toiminto otsikkorivin oikeaan reunaan, esim. "+ Lisää uusi". Korvaa metan. */
  action?: ReactNode
  /** Näytetään kun sisältöä ei vielä ole */
  empty?: string
  children?: ReactNode
  className?: string
  /** Porrastettu esiintuloanimaatio, sekunteina */
  delay?: number
}

/**
 * Paneelikehys. Sama kehys käytössä nyt tyhjänä ja myöhemmin
 * oikealla sisällöllä, jotta osioiden lisäys ei muuta ulkoasua.
 *
 * Kaikki hubin paneelit kulkevat tämän läpi, joten ilme muuttuu yhdestä
 * paikasta — HUD-tyylitys tehtiin tänne eikä seitsemään komponenttiin.
 *
 * Yläreunan valojuova on oma elementtinsä eikä .ax-glassin reunaviiva:
 * se kirkastuu keskeltä ja häipyy päistä, mikä lukeutuu lasin särmän
 * heijastukseksi tasaisen viivan sijaan. Otsikkorivin oikeassa reunassa
 * on joko meta-teksti tai himmeä ••• -merkki, jotta rivi ei jää
 * epätasapainoon silloin kun metatietoa ei ole.
 */
export function Panel({
  title,
  meta,
  action,
  empty,
  children,
  className = '',
  delay = 0,
}: PanelProps) {
  return (
    <section
      className={`ax-rise ax-glass relative overflow-hidden rounded-2xl ${className}`}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ax-accent/45 to-transparent"
      />

      <header className="ax-glass-divide flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <h2 className="text-[13px] font-light uppercase tracking-[0.1em] text-ax-text">{title}</h2>
        {action ? (
          action
        ) : meta ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-ax-faint">{meta}</span>
        ) : (
          <span aria-hidden="true" className="text-[10px] tracking-[0.3em] text-ax-accent/60">
            •••
          </span>
        )}
      </header>

      <div className="p-4">
        {children ?? (
          <p className="py-6 text-center text-[13px] leading-relaxed text-ax-faint">
            {empty ?? 'Ei vielä dataa.'}
          </p>
        )}
      </div>
    </section>
  )
}
