'use client'

import { useEffect, useRef, useState } from 'react'
import createGlobe from 'cobe'
import type { Marker, Arc } from 'cobe'

/**
 * Pyörivä holografinen maapallo hubin etusivun keskiöön.
 *
 * Toteutettu cobe-kirjastolla (19 kB, ei riippuvuuksia) eikä three.js:llä:
 * arxcian on PWA jota käytetään puhelimella, ja three.js + react-globe.gl
 * olisi ~600 kB. cobe piirtää saman pisteytetyn hehkuvan pallon yhdellä
 * WebGL-shaderilla.
 *
 * cobe v2:ssa EI ole sisäistä renderöintisilmukkaa — se on ajettava itse
 * update()-kutsuilla, toisin kuin v1:n onRender-callbackilla.
 *
 * Maapallo on tarkoituksella koriste + markkinakeskusten näyttö, EI
 * navigaatioelementti — osiokortit ovat selkeämpi tapa liikkua, ja
 * klikattava pallo olisi käytettävyydeltään huonompi kuin nykyinen.
 */

const HELSINKI: [number, number] = [60.1699, 24.9384]

/** Markkinakeskukset jotka vastaavat watchlistin instrumentteja. */
const MARKERS: Marker[] = [
  { location: HELSINKI, size: 0.09 },
  { location: [40.7128, -74.006], size: 0.07 }, // New York — US500, NAS100
  { location: [51.5074, -0.1278], size: 0.06 }, // Lontoo — forex
  { location: [35.6762, 139.6503], size: 0.06 }, // Tokio — USDJPY
  { location: [50.1109, 8.6821], size: 0.05 }, // Frankfurt — EURUSD
]

/** Yhteydet kotoa markkinakeskuksiin. */
const ARCS: Arc[] = MARKERS.slice(1).map(m => ({ from: HELSINKI, to: m.location }))

export function Globe({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Pyörimiskulma ja raahauksen tila pidetään refeissä, jottei jokainen
  // ruutupäivitys aiheuta Reactin uudelleenrenderöintiä.
  const phiRef = useRef(0)
  const dragStartX = useRef<number | null>(null)
  const dragOffset = useRef(0)

  const [ready, setReady] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let globe: ReturnType<typeof createGlobe> | null = null
    let frame = 0

    const build = () => {
      const size = container.offsetWidth
      if (size === 0) return

      cancelAnimationFrame(frame)
      globe?.destroy()

      globe = createGlobe(canvas, {
        devicePixelRatio: Math.min(window.devicePixelRatio, 2),
        width: size * 2,
        height: size * 2,
        phi: 0,
        theta: 0.22,
        dark: 1,
        diffuse: 1.35,
        mapSamples: 15000,
        mapBrightness: 6.4,
        // Sävyt vastaavat teeman --ax-accent-väriä (56 199 255) 0–1-asteikolla.
        baseColor: [0.17, 0.36, 0.55],
        markerColor: [0.22, 0.78, 1],
        glowColor: [0.09, 0.32, 0.55],
        markers: MARKERS,
        arcs: ARCS,
        arcColor: [0.22, 0.78, 1],
        arcWidth: 0.4,
      })

      const tick = () => {
        // Automaattinen kierto pysähtyy raahauksen ajaksi ja kokonaan jos
        // käyttäjä on pyytänyt vähemmän liikettä.
        if (dragStartX.current === null && !reduceMotion) phiRef.current += 0.0032
        globe?.update({ phi: phiRef.current + dragOffset.current })
        frame = requestAnimationFrame(tick)
      }
      tick()

      setReady(true)
    }

    build()
    const observer = new ResizeObserver(build)
    observer.observe(container)

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      globe?.destroy()
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragStartX.current = e.clientX - dragOffset.current * 220
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragStartX.current === null) return
    dragOffset.current = (e.clientX - dragStartX.current) / 220
  }

  const endDrag = () => {
    if (dragStartX.current === null) return
    // Raahauksen tulos sulautetaan pysyvään kulmaan, jotta automaattinen
    // kierto jatkuu siitä mihin käyttäjä jätti pallon.
    phiRef.current += dragOffset.current
    dragOffset.current = 0
    dragStartX.current = null
  }

  return (
    <div ref={containerRef} className={`relative aspect-square ${className}`}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        aria-label="Pyörivä maapallo, markkinakeskukset korostettuna"
        role="img"
        className={`h-full w-full cursor-grab touch-none transition-opacity duration-700 active:cursor-grabbing ${
          ready ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  )
}
