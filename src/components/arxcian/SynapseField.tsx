'use client'

import { useEffect, useRef } from 'react'

/**
 * Taustan synapsikenttä: hitaasti ajelehtivia pisteitä, joiden väliin
 * piirtyy viiva kun ne ovat tarpeeksi lähellä toisiaan.
 *
 * Kolme asiaa on tehty toisin kuin suoraviivaisessa toteutuksessa, ja
 * kaikki kolme samasta syystä — arxcian on PWA jota käytetään puhelimella:
 *
 * 1. Pistemäärä johdetaan näkymän pinta-alasta eikä ole vakio. Viivojen
 *    haku on O(n²), joten kiinteä 95 pistettä tarkoittaisi 4 465 vertailua
 *    joka ruudulla myös pienellä näytöllä jossa niitä ei edes näkisi.
 * 2. Piirto pysähtyy kun välilehti menee taustalle. Ilman tätä kenttä
 *    jauhaisi akkua taskussa.
 * 3. Väri luetaan --ax-accent-muuttujasta eikä ole kovakoodattu, jotta
 *    teeman vaihto osuu myös taustaan (ks. globals.css).
 */

/** Etäisyys jonka sisällä pisteiden väliin piirtyy viiva. */
const LINK_DISTANCE = 130

/** Yksi piste noin tätä pinta-alaa kohti. Antaa ~70 pistettä täydellä
 *  työpöytänäytöllä ja ~25 puhelimessa. */
const AREA_PER_NODE = 26_000

const MAX_NODES = 80

type Node = { x: number; y: number; vx: number; vy: number; r: number }

export function SynapseField({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Liikkumaton kenttä jos käyttäjä on pyytänyt vähemmän liikettä: piirretään
    // yksi ruutu ja jätetään siihen, jotta tausta ei ole tyhjä mutta ei myöskään
    // liiku. Sama periaate kuin globals.css:n reduced-motion -säännössä.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Korostusväri tokenista, muodossa "82 156 255".
    const accent =
      getComputedStyle(document.documentElement).getPropertyValue('--ax-accent').trim() ||
      '82 156 255'

    let nodes: Node[] = []
    let frame = 0
    let width = 0
    let height = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight

      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const count = Math.min(MAX_NODES, Math.round((width * height) / AREA_PER_NODE))
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.08,
        vy: (Math.random() - 0.5) * 0.08,
        r: Math.random() * 1.2 + 0.3,
      }))
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)

      for (const n of nodes) {
        n.x += n.vx
        n.y += n.vy
        if (n.x < 0 || n.x > width) n.vx *= -1
        if (n.y < 0 || n.y > height) n.vy *= -1
      }

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          // Neliöjuuri vasta kun tiedetään että viiva ylipäätään piirtyy.
          const squared = dx * dx + dy * dy
          if (squared > LINK_DISTANCE * LINK_DISTANCE) continue

          const opacity = (1 - Math.sqrt(squared) / LINK_DISTANCE) * 0.08
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.strokeStyle = `rgba(${accent.replace(/\s+/g, ', ')}, ${opacity})`
          ctx.lineWidth = 0.7
          ctx.stroke()
        }
      }

      ctx.fillStyle = `rgba(${accent.replace(/\s+/g, ', ')}, 0.28)`
      for (const n of nodes) {
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const loop = () => {
      draw()
      frame = requestAnimationFrame(loop)
    }

    const stop = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
    }

    const start = () => {
      if (frame || reduceMotion) return
      frame = requestAnimationFrame(loop)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') stop()
      else start()
    }

    resize()
    draw()
    start()

    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      stop()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 -z-10 opacity-70 ${className}`}
    />
  )
}
