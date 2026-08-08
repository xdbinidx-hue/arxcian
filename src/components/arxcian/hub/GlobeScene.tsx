'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

/**
 * Fotorealistinen maapallo hubin keskiöön.
 *
 * Tekstuurit NASA:lta (public domain, molemmat 3600×1800):
 * - Blue Marble (päivä) — siniset meret ja mantereet
 * - Black Marble (yö) — kaupunkivalot
 *
 * Pelkkä yötekstuuri antaisi lähes mustan pallon oransseine pisteineen.
 * Referenssi-ilme vaatii MOLEMMAT: valaistu puolisko hohtaa sinisenä ja
 * varjon puolella näkyvät kaupunkivalot, väliin pehmeä terminaattori.
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

const EARTH_VERTEX = `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Värinhallinta tehdään käsin, koska raakaan ShaderMaterialiin three ei lisää
// automaattista sRGB-purkua: tekstuurit luetaan sRGB:nä ja muunnetaan
// lineaariseksi, ja ulostulo jätetään lineaariseksi jolloin renderöijä
// koodaa sen takaisin sRGB:hen.
const EARTH_FRAGMENT = `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 lightDir;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;

  vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }

  void main() {
    vec3 n = normalize(vNormal);
    float lambert = dot(n, normalize(lightDir));

    vec3 day = toLinear(texture2D(dayMap, vUv).rgb);
    vec3 night = toLinear(texture2D(nightMap, vUv).rgb);

    // Kaupunkivalojen tuike: paikkariippuvainen vaihe saa eri alueet
    // huippuunsa eri aikaan, joten valot kirkastuvat ja himmenevät
    // vuorotellen eikä koko pallo syki yhtenä.
    float phase = sin(vUv.x * 47.0) * cos(vUv.y * 31.0);
    float twinkle = 1.15 + 0.22 * sin(uTime * 1.1 + phase * 6.2831);

    // Pehmeä terminaattori valon ja varjon väliin.
    float dayAmount = smoothstep(-0.22, 0.38, lambert);

    vec3 lit = day * (0.32 + 0.95 * max(lambert, 0.0));
    vec3 dark = night * twinkle * 2.4;
    vec3 color = mix(dark, lit, dayAmount);

    // Reunavalo korostaa ilmakehän rajaa myös itse planeetassa.
    float rim = pow(1.0 - max(dot(n, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
    color += vec3(0.10, 0.34, 0.62) * rim * 0.5;

    gl_FragColor = vec4(color, 1.0);
  }
`

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
    // Korkea eksponentti kaventaa hehkun lähelle siluettia, jottei planeetan
    // ympärille jää paksua neonrengasta.
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
    // Renderöidään aina 2× logiikkapikselitarkkuudella. window.devicePixelRatio
    // voi olla ALLE 1 (esim. 0,9 kun selain on zoomattu ulos), jolloin
    // Math.min(dpr, 2) piirtäisi natiivia pienemmällä tarkkuudella ja kuva
    // skaalattaisiin ylös sumeaksi.
    renderer.setPixelRatio(2)
    container.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.cursor = 'grab'
    renderer.domElement.style.touchAction = 'none'

    const world = new THREE.Group()
    world.rotation.z = (-23.4 * Math.PI) / 180 // maapallon akselikallistuma
    world.rotation.x = 0.3 // pohjoinen pallonpuolisko kallistuu katsojaa kohti
    scene.add(world)

    const loader = new THREE.TextureLoader()
    let loaded = 0
    const onTextureLoad = () => {
      loaded++
      if (loaded === 2) setReady(true)
    }
    // colorSpace jätetään oletukseksi (lineaarinen/raaka), koska shader purkaa
    // sRGB:n itse — SRGBColorSpace tekisi purun kahdesti.
    const dayTexture = loader.load('/textures/earth-day.jpg', onTextureLoad)
    const nightTexture = loader.load('/textures/earth-night.jpg', onTextureLoad)
    for (const t of [dayTexture, nightTexture]) {
      t.anisotropy = renderer.capabilities.getMaxAnisotropy()
    }

    const earthGeometry = new THREE.SphereGeometry(1, 128, 128)
    const earthMaterial = new THREE.ShaderMaterial({
      vertexShader: EARTH_VERTEX,
      fragmentShader: EARTH_FRAGMENT,
      uniforms: {
        dayMap: { value: dayTexture },
        nightMap: { value: nightTexture },
        // Valo tulee vasemmalta ja hieman TAKAA (negatiivinen z), jolloin vain
        // vasen reuna hohtaa valaistuna sirppinä ja suurin osa näkyvästä
        // puoliskosta — Eurooppa mukaan lukien — jää yön puolelle
        // kaupunkivaloineen. Sama sommittelu kuin referenssikuvassa.
        lightDir: { value: new THREE.Vector3(-0.9, 0.25, -0.35).normalize() },
        uTime: { value: 0 },
      },
    })

    const earth = new THREE.Mesh(earthGeometry, earthMaterial)
    // Kiinteä asento: Eurooppa keskellä. Kaava: kulma = −90° − keskitettävä
    // pituuspiiri, joten Keski-Eurooppa (+12°) antaa −102°.
    earth.rotation.y = (-102 * Math.PI) / 180
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

    // Markkerit lisätään maapallon LAPSIKSI, jolloin ne kiertyvät sen mukana —
    // markkerin oman rotaation muuttaminen ei siirtäisi sitä mihinkään.
    const markerGeometry = new THREE.SphereGeometry(0.014, 12, 12)
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x9fe8ff })
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
      opacity: 0.3,
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

    const clock = new THREE.Clock()
    let frame = 0
    const animate = () => {
      const t = clock.getElapsedTime()

      // Tuike ja ilmakehän hengitys ovat hidasta kirkkauden vaihtelua (~0,2 Hz),
      // eivät liikettä ruudulla, joten ne jäävät päälle myös
      // prefers-reduced-motion -tilassa: liikerajoitus koskee liikettä, ja
      // hitaat häivytykset ovat nimenomaan suositeltu vaihtoehto sille.
      earthMaterial.uniforms.uTime.value = t
      atmosphereMaterial.uniforms.strength.value = 2.6 + 0.35 * Math.sin(t * 0.55)

      // Kiertoratojen pyöriminen on oikeaa liikettä — se pysäytetään.
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
      dayTexture.dispose()
      nightTexture.dispose()
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
      aria-label="Maapallo, markkinakeskukset korostettuna"
      role="img"
      className={`aspect-square transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'} ${className}`}
    />
  )
}
