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
      className={`ax-rise rounded-2xl border border-ax-line bg-ax-panel/80 shadow-[0_0_32px_-6px_rgb(var(--ax-accent)/0.32)] backdrop-blur-sm ${className}`}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      <header className="flex items-center justify-between gap-3 border-b border-ax-line px-4 py-2.5">
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
