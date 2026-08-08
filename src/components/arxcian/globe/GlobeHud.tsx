'use client'

import Link from 'next/link'
import type { GlobeLayer, GlobePoint } from '@/lib/arxcian/globe/types'

/**
 * Maapallon HUD. Tehty DOM-elementteinä canvasin päälle eikä WebGL-tekstinä:
 * teksti pysyy tarkkana, tyylit tulevat teemasta, ruudunlukija toimii ja
 * ääkköset renderöityvät ilman fonttiatlasta.
 */

const TONE_CLASS: Record<string, string> = {
  up: 'text-ax-up',
  down: 'text-ax-down',
  warn: 'text-ax-warn',
  neutral: 'text-ax-dim',
}

function fmtTime(ms: number | null): string {
  if (!ms) return 'ei haettu'
  return new Date(ms).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
}

type Props = {
  layers: GlobeLayer[]
  activeId: string
  onSelectLayer: (id: string) => void
  selected: GlobePoint | null
  onClearSelection: () => void
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
}

const ZOOM_BUTTON =
  'pointer-events-auto flex h-7 w-7 items-center justify-center rounded-lg border border-ax-line bg-ax-panel/70 text-[13px] leading-none text-ax-faint transition-colors hover:text-ax-text disabled:opacity-30 disabled:hover:text-ax-faint'

export function GlobeHud({
  layers,
  activeId,
  onSelectLayer,
  selected,
  onClearSelection,
  zoom,
  onZoomIn,
  onZoomOut,
}: Props) {
  const active = layers.find(l => l.id === activeId) ?? layers[0]

  return (
    <>
      {/*
        HUD-renkaat maapallon ympärille. SVG eikä WebGL: viivat pysyvät
        terävinä millä tahansa tarkkuudella eivätkä kuluta piirtokutsuja.
        Säteet on suhteutettu pallon näkyvään reunaan: kameran ollessa
        etäisyydellä 3,45 reuna osuu kohtaan r ≈ 0,84 · puolikkaasta eli
        r ≈ 42 tässä 100 yksikön viewBoxissa. Renkaat jäävät sen ulkopuolelle.
      */}
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full text-ax-accent"
      >
        <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="0.11" opacity="0.3" />
        <circle
          cx="50"
          cy="50"
          r="48.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.09"
          opacity="0.18"
          strokeDasharray="1.2 2.4"
        />
        {/* Kulmamerkit neljännesten kohdalle */}
        {[0, 90, 180, 270].map(deg => (
          <line
            key={deg}
            x1="50"
            y1="0.7"
            x2="50"
            y2="3.4"
            stroke="currentColor"
            strokeWidth="0.16"
            opacity="0.4"
            transform={`rotate(${deg} 50 50)`}
          />
        ))}
      </svg>

      {/* Kerrosvalitsin */}
      <div className="pointer-events-auto absolute left-0 top-0 flex flex-wrap gap-1.5">
        {layers.map(layer => (
          <button
            key={layer.id}
            onClick={() => onSelectLayer(layer.id)}
            aria-pressed={layer.id === activeId}
            className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              layer.id === activeId
                ? 'border-ax-accent/50 bg-ax-accent/10 text-ax-accent'
                : 'border-ax-line bg-ax-panel/70 text-ax-faint hover:text-ax-text'
            }`}
          >
            {layer.label}
          </button>
        ))}
      </div>

      {/* Lähdetieto — aina näkyvissä, jottei vanhentunutta dataa luulla tuoreeksi */}
      <div className="absolute right-0 top-0 text-right">
        <p className="font-mono text-[10px] uppercase tracking-wider text-ax-faint">
          {active.source.name}
        </p>
        {active.source.fetchedAt !== null && (
          <p className="font-mono text-[10px] text-ax-faint/70">{fmtTime(active.source.fetchedAt)}</p>
        )}
      </div>

      {/* Zoom. Rullaa ei kaapata: maapallo on iso keskellä vieritettävää sivua,
          ja rullan kaappaaminen rikkoisi sivun selaamisen. Kosketuksella
          nipistys toimii suoraan kohtauksessa. */}
      <div className="absolute bottom-0 right-0 flex flex-col gap-1.5">
        <button onClick={onZoomIn} disabled={zoom >= 1} aria-label="Lähennä" className={ZOOM_BUTTON}>
          +
        </button>
        <button
          onClick={onZoomOut}
          disabled={zoom <= 0}
          aria-label="Loitonna"
          className={ZOOM_BUTTON}
        >
          −
        </button>
      </div>

      {/* Valitun pisteen kortti */}
      {selected && (
        <div className="pointer-events-auto absolute bottom-0 left-0 right-0 mx-auto max-w-sm rounded-2xl border border-ax-line bg-ax-panel/90 p-3 shadow-[0_0_32px_-6px_rgb(var(--ax-accent)/0.32)] backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ax-text">{selected.label}</p>
              {selected.meta && (
                <p className={`mt-0.5 font-mono text-[11px] ${TONE_CLASS[selected.tone ?? 'neutral']}`}>
                  {selected.meta}
                </p>
              )}
            </div>
            <button
              onClick={onClearSelection}
              aria-label="Sulje"
              className="shrink-0 rounded-md border border-ax-line px-1.5 text-[11px] leading-5 text-ax-faint transition-colors hover:text-ax-text"
            >
              ×
            </button>
          </div>
          {selected.href && (
            <Link
              href={selected.href}
              className="mt-2 inline-block text-[11px] text-ax-faint transition-colors hover:text-ax-accent"
            >
              Avaa osio →
            </Link>
          )}
        </div>
      )}

      {/* Kerroksen varauma, kun kerros jättää osan datasta pois kartalta */}
      {!selected && active.caveat && (
        <p className="absolute bottom-0 left-0 right-0 mx-auto max-w-md text-center text-[10px] leading-relaxed text-ax-faint/70">
          {active.caveat}
        </p>
      )}
    </>
  )
}
