'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

/**
 * Fotorealistinen maapallo hubin keskiöön.
 *
 * Tekstuurina NASA:n Black Marble -yövalokuva (public domain, 2048×1024,
 * 232 kB) — juuri se ilme jota haettiin: tumma maapallo, kultaiset
 * kaupunkivalot, sininen ilmakehän kehä. Päivätekstuuria ei ladata
 * lainkaan, koska yöpuoli on koko idea ja se puolittaa siirrettävän datan.
 *
 * Tämä tiedosto ladataan dynaamisesti (ks. Globe.tsx) jottei three.js ole
 * mukana ensilatauksen bundlessa — arxcian on PWA jota käytetään puhelimella.
 */

const HELSINKI: [number, number] = [60.1699, 24.9384]

/** Markkinakeskukset jotka vastaavat watchlistin instrumentteja. */
const MARKERS: [number, number][] = [
  HELSINKI,
  [40.7128, -74.006], // New York — US500, NAS100
  [51.5074, -0.1278], // Lontoo — forex
  [35.6762, 139.6503], // Tokio — USDJPY
  [50.1109, 8.6821], // Frankfurt — EURUSD
]

/** Maantieteelliset koordinaatit pallon pinnalle. */
function latLngToVec3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((lng + 180) * Math.PI) / 180
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

// Ilmakehän hehku: fresnel-efekti pallon ulkopuolelle. Piirretään sisäpinta
// (BackSide) additiivisella sekoituksella, jolloin reunat hehkuvat.
const ATMOSPHERE_VERTEX = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const ATMOSPHERE_FRAGMENT = `
  varying vec3 vNormal;
  uniform vec3 glowColor;
  uniform float strength;
  void main() {
    // Korkeampi eksponentti kaventaa hehkun lähemmäs siluettia, jottei
    // planeetan ympärille jää paksua neonrengasta.
    float intensity = pow(0.58 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 5.0);
    gl_FragColor = vec4(glowColor, 1.0) * intensity * strength;
  }
`

export default function GlobeScene({ className = '' }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    // Etäisyys mitoitettu niin että uloin kiertorata (säde 1.42) mahtuu kuvaan:
    // näkymän puolikorkeus = z * tan(fov/2) = z * 0.344, joten z ≈ 4.2 riittää.
    camera.position.z = 4.2

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.cursor = 'grab'
    renderer.domElement.style.touchAction = 'none'

    // Kaikki pyörivä samassa ryhmässä, jotta markkerit seuraavat maapalloa.
    const world = new THREE.Group()
    world.rotation.z = (-23.4 * Math.PI) / 180 // maapallon akselikallistuma
    scene.add(world)

    const earthGeometry = new THREE.SphereGeometry(1, 64, 64)
    const texture = new THREE.TextureLoader().load('/textures/earth-night.jpg', () => setReady(true))
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
    // MeshBasicMaterial ei reagoi valoon — kaupunkivalot hehkuvat itsestään,
    // mikä on juuri haluttu "yön puoli" -vaikutelma.
    const earthMaterial = new THREE.MeshBasicMaterial({ map: texture })
    const earth = new THREE.Mesh(earthGeometry, earthMaterial)
    world.add(earth)

    const atmosphereGeometry = new THREE.SphereGeometry(1.13, 64, 64)
    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: ATMOSPHERE_VERTEX,
      fragmentShader: ATMOSPHERE_FRAGMENT,
      uniforms: {
        glowColor: { value: new THREE.Color(0x38c7ff) }, // teeman --ax-accent
        strength: { value: 2.6 },
      },
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial)
    scene.add(atmosphere)

    // Markkerit: pienet hehkuvat pisteet markkinakeskuksissa. Lisätään
    // maapallon LAPSIKSI, jolloin ne kiertyvät sen mukana automaattisesti —
    // markkerin oman rotaation muuttaminen ei siirtäisi sitä mihinkään.
    const markerGeometry = new THREE.SphereGeometry(0.016, 12, 12)
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x7fdcff })
    for (const [lat, lng] of MARKERS) {
      const marker = new THREE.Mesh(markerGeometry, markerMaterial)
      marker.position.copy(latLngToVec3(lat, lng, 1.012))
      earth.add(marker)
    }

    // Kiertoradat: ohuet renkaat eri kulmissa, kuten referenssikuvassa.
    const rings: THREE.Mesh[] = []
    const ringGeometry = new THREE.TorusGeometry(1.42, 0.0022, 8, 220)
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x38c7ff,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    for (const [rx, ry] of [
      [1.15, 0.2],
      [1.42, -0.55],
      [0.95, 0.85],
    ]) {
      const ring = new THREE.Mesh(ringGeometry, ringMaterial)
      ring.rotation.x = rx
      ring.rotation.y = ry
      scene.add(ring)
      rings.push(ring)
    }

    // --- Koko ja raahaus ---
    const resize = () => {
      const size = container.clientWidth
      if (size === 0) return
      renderer.setSize(size, size, false)
      camera.aspect = 1
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    let dragStartX: number | null = null
    let dragStartRotation = 0

    const onPointerDown = (e: PointerEvent) => {
      dragStartX = e.clientX
      dragStartRotation = earth.rotation.y
      renderer.domElement.setPointerCapture(e.pointerId)
      renderer.domElement.style.cursor = 'grabbing'
    }
    const onPointerMove = (e: PointerEvent) => {
      if (dragStartX === null) return
      earth.rotation.y = dragStartRotation + (e.clientX - dragStartX) / 180
    }
    const onPointerUp = () => {
      dragStartX = null
      renderer.domElement.style.cursor = 'grab'
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointerleave', onPointerUp)

    let frame = 0
    const animate = () => {
      if (dragStartX === null && !reduceMotion) earth.rotation.y += 0.0009
      if (!reduceMotion) {
        rings[0].rotation.z += 0.0006
        rings[1].rotation.z -= 0.0004
        rings[2].rotation.z += 0.0003
      }
      renderer.render(scene, camera)
      frame = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointerleave', onPointerUp)
      earthGeometry.dispose()
      earthMaterial.dispose()
      texture.dispose()
      atmosphereGeometry.dispose()
      atmosphereMaterial.dispose()
      markerGeometry.dispose()
      markerMaterial.dispose()
      ringGeometry.dispose()
      ringMaterial.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      aria-label="Pyörivä maapallo, markkinakeskukset korostettuna"
      role="img"
      className={`aspect-square transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'} ${className}`}
    />
  )
}
