'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { GlobeHud } from './GlobeHud'
import type { GlobeLayer, GlobePoint } from '@/lib/arxcian/globe/types'

/**
 * Maapallon kääre: pitää kerros- ja valintatilan sekä yhdistää WebGL-kohtauksen
 * ja DOM-pohjaisen HUDin.
 *
 * Varsinainen three.js-toteutus ladataan dynaamisesti ja vasta selaimessa
 * (ssr: false), jottei ~600 kB kirjastoa ole mukana ensilatauksen bundlessa —
 * arxcian on PWA jota käytetään puhelimella.
 */
const GlobeScene = dynamic(() => import('./GlobeScene'), {
  ssr: false,
  loading: () => (
    <div className="aspect-square animate-pulse rounded-full bg-ax-accent/5" aria-hidden="true" />
  ),
})

export function Globe({ layers, className = '' }: { layers: GlobeLayer[]; className?: string }) {
  const [activeId, setActiveId] = useState<string>(layers[0]?.id ?? 'world')
  const [selected, setSelected] = useState<GlobePoint | null>(null)

  const active = layers.find(l => l.id === activeId) ?? layers[0]

  const selectLayer = (id: string) => {
    setActiveId(id)
    setSelected(null) // valinta ei kuulu toiseen kerrokseen
  }

  return (
    <div className={`relative ${className}`}>
      <GlobeScene layer={active} selectedId={selected?.id ?? null} onSelectPoint={setSelected} />

      {/* HUD ei saa napata osoitinta, muuten palloa ei voi raahata.
          Yksittäiset painikkeet palauttavat pointer-eventsin itselleen. */}
      <div className="pointer-events-none absolute inset-0 p-3 sm:p-4">
        <GlobeHud
          layers={layers}
          activeId={active.id}
          onSelectLayer={selectLayer}
          selected={selected}
          onClearSelection={() => setSelected(null)}
        />
      </div>
    </div>
  )
}
