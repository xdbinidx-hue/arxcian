import type { ReactNode } from 'react'

type PanelProps = {
  title: string
  /** Pieni lisätieto otsikkorivin oikeassa reunassa */
  meta?: string
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
 */
export function Panel({ title, meta, empty, children, className = '', delay = 0 }: PanelProps) {
  return (
    <section
      className={`ax-rise ax-glass rounded-2xl ${className}`}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      <header className="ax-glass-divide flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ax-dim">{title}</h2>
        {meta && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-ax-faint">{meta}</span>
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
