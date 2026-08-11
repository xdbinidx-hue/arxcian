'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { GlobeHud } from './GlobeHud'
import type { GlobeData, GlobePoint } from '@/lib/arxcian/globe/types'

/**
 * Maapallon kääre: pitää valinta- ja zoom-tilan sekä yhdistää WebGL-kohtauksen
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

const ZOOM_STEP = 0.25

/**
 * Aloitustaso. Näkymä on karttamainen eikä planeettamainen: Eurooppa täyttää
 * ympyrän heti, eikä käyttäjän tarvitse zoomata itse nähdäkseen sen. Kaareva
 * reuna jää tällä tasolla kokonaan näkymän ulkopuolelle, joten pinta lukeutuu
 * kartaksi vaikka geometria on yhä pallo.
 *
 * Loitontaminen on yhä mahdollista, jos koko planeetan haluaa nähdä.
 */
const INITIAL_ZOOM = 0.86

export function Globe({ data, className = '' }: { data: GlobeData; className?: string }) {
  const [selected, setSelected] = useState<GlobePoint | null>(null)
  const [zoom, setZoom] = useState(INITIAL_ZOOM)

  const nudgeZoom = (delta: number) => setZoom(z => Math.min(1, Math.max(0, z + delta)))

  return (
    <div className={`relative ${className}`}>
      <GlobeScene
        data={data}
        selectedId={selected?.id ?? null}
        onSelectPoint={setSelected}
        zoom={zoom}
        onZoomChange={setZoom}
      />

      {/* HUD ei saa napata osoitinta, muuten palloa ei voi raahata.
          Yksittäiset painikkeet palauttavat pointer-eventsin itselleen. */}
      <div className="pointer-events-none absolute inset-0 p-3 sm:p-4">
        <GlobeHud
          sources={data.sources}
          caveats={data.caveats}
          selected={selected}
          onClearSelection={() => setSelected(null)}
          zoom={zoom}
          onZoomIn={() => nudgeZoom(ZOOM_STEP)}
          onZoomOut={() => nudgeZoom(-ZOOM_STEP)}
        />
      </div>
    </div>
  )
}
