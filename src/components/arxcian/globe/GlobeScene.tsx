'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { latLngToVec3, faceLongitude } from '@/lib/arxcian/globe/geo'
import type { GlobeLayer, GlobePoint, PointTone } from '@/lib/arxcian/globe/types'

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
 * Datapisteet tulevat kerroksina (ks. lib/arxcian/globe/types.ts) — kohtaus
 * ei tiedä mitään yksittäisen kerroksen sisällöstä.
 */

/** Keskitettävä pituuspiiri: Keski-Eurooppa. */
const CENTER_LNG = 12

const TONE_COLORS: Record<PointTone, number> = {
  up: 0x3ddc97,
  down: 0xff5c72,
  warn: 0xf5b544,
  neutral: 0x9fe8ff,
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

// Pilvet käyttävät samaa valosuuntaa kuin maapallo: ne hohtavat valaistulla
// puolella ja häviävät varjoon. Ilman tätä pilvet näkyisivät yhtä kirkkaina
// yön puolella, mikä näyttäisi väärältä kaupunkivalojen päällä.
const CLOUD_FRAGMENT = `
  uniform sampler2D cloudMap;
  uniform vec3 lightDir;
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    float cloud = texture2D(cloudMap, vUv).r;
    float lambert = dot(normalize(vNormal), normalize(lightDir));
    float dayAmount = smoothstep(-0.25, 0.40, lambert);
    gl_FragColor = vec4(vec3(1.0), cloud * (0.06 + 0.78 * dayAmount) * 0.9);
  }
`

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

type SceneRefs = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  earth: THREE.Mesh
  pointGroup: THREE.Group
}

/** Kameran etäisyys kun zoom = 0 (kaukana) ja zoom = 1 (lähellä). */
const CAMERA_Z_FAR = 4.2
const CAMERA_Z_NEAR = 2.7

type Props = {
  layer: GlobeLayer
  selectedId: string | null
  onSelectPoint: (point: GlobePoint | null) => void
  /** 0 = kaukana, 1 = lähellä */
  zoom: number
  onZoomChange: (zoom: number) => void
}

export default function GlobeScene({
  layer,
  selectedId,
  onSelectPoint,
  zoom,
  onZoomChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const refs = useRef<SceneRefs | null>(null)
  const [ready, setReady] = useState(false)

  // Zoom ja tarkennuskulma luetaan refeistä animaatiosilmukassa, jottei
  // kohtausta tarvitse rakentaa uudelleen kun propsit muuttuvat.
  const zoomRef = useRef(zoom)
  const focusRef = useRef<number | null>(null)

  // Callback refin kautta, jottei kohtausta tarvitse rakentaa uudelleen kun
  // vanhemman komponentin funktioviite vaihtuu.
  const onSelectRef = useRef(onSelectPoint)
  useEffect(() => {
    onSelectRef.current = onSelectPoint
  }, [onSelectPoint])

  const onZoomRef = useRef(onZoomChange)
  useEffect(() => {
    onZoomRef.current = onZoomChange
  }, [onZoomChange])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  // Valinta kääntää maapallon niin että piste tulee kameraa kohti.
  useEffect(() => {
    const point = layer.points.find(p => p.id === selectedId)
    focusRef.current = point ? faceLongitude(point.lng) : null
  }, [selectedId, layer])

  // --- Kohtaus rakennetaan kerran ---
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    // Etäisyys mitoitettu niin että uloin kiertorata (säde 1.42) mahtuu kuvaan:
    // näkymän puolikorkeus = z * tan(fov/2) = z * 0.344.
    camera.position.z = 4.2

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    // Kiinteä 2×: window.devicePixelRatio voi olla ALLE 1 (esim. 0,9 kun selain
    // on zoomattu ulos), jolloin Math.min(dpr, 2) piirtäisi natiivia pienemmällä
    // tarkkuudella ja kuva skaalattaisiin ylös sumeaksi.
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
    // colorSpace jätetään oletukseksi (raaka), koska shader purkaa sRGB:n itse.
    const dayTexture = loader.load('/textures/earth-day.jpg', onTextureLoad)
    const nightTexture = loader.load('/textures/earth-night.jpg', onTextureLoad)
    // Pilvet eivät estä esiintuloa: ne ovat koriste, ja niiden odottaminen
    // viivästyttäisi maapallon näkymistä turhaan.
    const cloudTexture = loader.load('/textures/earth-clouds.jpg')
    for (const t of [dayTexture, nightTexture, cloudTexture]) {
      t.anisotropy = renderer.capabilities.getMaxAnisotropy()
    }

    const earthGeometry = new THREE.SphereGeometry(1, 128, 128)
    const earthMaterial = new THREE.ShaderMaterial({
      vertexShader: EARTH_VERTEX,
      fragmentShader: EARTH_FRAGMENT,
      uniforms: {
        dayMap: { value: dayTexture },
        nightMap: { value: nightTexture },
        // Valo vasemmalta ja hieman takaa: vain vasen reuna hohtaa sirppinä ja
        // Eurooppa jää keskelle yön puolelle kaupunkivaloineen.
        lightDir: { value: new THREE.Vector3(-0.9, 0.25, -0.35).normalize() },
        uTime: { value: 0 },
      },
    })

    const earth = new THREE.Mesh(earthGeometry, earthMaterial)
    earth.rotation.y = faceLongitude(CENTER_LNG)
    world.add(earth)

    // Pilvikerros maapallon lapsena, jotta se seuraa raahausta. Oma hidas
    // kiertonsa saa sään ajautumaan pinnan yli.
    const cloudGeometry = new THREE.SphereGeometry(1.006, 96, 96)
    const cloudMaterial = new THREE.ShaderMaterial({
      vertexShader: EARTH_VERTEX,
      fragmentShader: CLOUD_FRAGMENT,
      uniforms: {
        cloudMap: { value: cloudTexture },
        lightDir: { value: new THREE.Vector3(-0.9, 0.25, -0.35).normalize() },
      },
      transparent: true,
      depthWrite: false,
    })
    const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial)
    earth.add(clouds)

    // Datapisteet maapallon lapsina, jotta ne kiertyvät sen mukana.
    const pointGroup = new THREE.Group()
    earth.add(pointGroup)

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
    scene.add(new THREE.Mesh(atmosphereGeometry, atmosphereMaterial))

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

    // Tähtitausta: pisteitä satunnaisilla suunnilla kaukana pallosta. Luodaan
    // kerran puskuriin, ei omaa geometriaa per tähti.
    const STAR_COUNT = 1100
    const starPositions = new Float32Array(STAR_COUNT * 3)
    for (let i = 0; i < STAR_COUNT; i++) {
      // acos(2u−1) antaa tasaisen jakauman pallon pinnalle; pelkkä
      // satunnainen kulma kasaisi tähdet navoille.
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 22 + Math.random() * 18
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      starPositions[i * 3 + 2] = r * Math.cos(phi)
    }
    const starGeometry = new THREE.BufferGeometry()
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    const starMaterial = new THREE.PointsMaterial({
      color: 0xd6e9ff,
      size: 0.17,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    })
    scene.add(new THREE.Points(starGeometry, starMaterial))

    refs.current = { scene, camera, renderer, earth, pointGroup }

    // --- Koko ---
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

    // --- Raahaus ja klikkaus ---
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let dragStartX: number | null = null
    let dragStartY = 0
    let dragStartRotation = 0
    let dragged = false

    // Aktiiviset osoittimet nipistystä varten. Kahdella sormella zoomataan,
    // yhdellä käännetään.
    const pointers = new Map<number, { x: number; y: number }>()
    let pinchStartDistance = 0
    let pinchStartZoom = 0

    const pinchDistance = () => {
      const [a, b] = Array.from(pointers.values())
      return Math.hypot(a.x - b.x, a.y - b.y)
    }

    const onPointerDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      renderer.domElement.setPointerCapture(e.pointerId)

      if (pointers.size === 2) {
        pinchStartDistance = pinchDistance()
        pinchStartZoom = zoomRef.current
        dragStartX = null // nipistys keskeyttää käännön
        return
      }

      dragStartX = e.clientX
      dragStartY = e.clientY
      dragStartRotation = earth.rotation.y
      dragged = false
      renderer.domElement.style.cursor = 'grabbing'
    }

    const onPointerMove = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (pointers.size === 2 && pinchStartDistance > 0) {
        const ratio = pinchDistance() / pinchStartDistance
        onZoomRef.current(Math.min(1, Math.max(0, pinchStartZoom + (ratio - 1))))
        return
      }

      if (dragStartX === null) return
      const dx = e.clientX - dragStartX
      // Yli 5 px liike tulkitaan raahaukseksi, jottei pieni tärähdys
      // klikatessa jää tunnistamatta valinnaksi.
      if (Math.abs(dx) > 5 || Math.abs(e.clientY - dragStartY) > 5) dragged = true
      // Käsin kääntäminen kumoaa tarkennuksen, muuten ne kilpailisivat.
      if (dragged) focusRef.current = null
      earth.rotation.y = dragStartRotation + dx / 180
    }

    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinchStartDistance = 0

      const wasDragging = dragStartX !== null
      dragStartX = null
      renderer.domElement.style.cursor = 'grab'
      if (!wasDragging || dragged) return

      // Klikkaus: osumatesti datapisteisiin.
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(pointGroup.children, false)
      // Piste luetaan meshin userDatasta, jolloin klikkauskäsittelijä ei
      // tarvitse viittausta kerrokseen eikä vanhene sulkeuman mukana.
      onSelectRef.current(hits.length > 0 ? (hits[0].object.userData.point as GlobePoint) : null)
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

      // Valittu piste sykkii, jotta sen erottaa muista.
      for (const p of pointGroup.children) {
        const base = (p.userData.baseScale as number) ?? 1
        p.scale.setScalar(p.userData.selected ? base * (1.35 + 0.15 * Math.sin(t * 3)) : base)
      }

      // Kamera liukuu kohti zoom-tasoa. reduceMotion-tilassa hypätään suoraan.
      const targetZ = CAMERA_Z_FAR + (CAMERA_Z_NEAR - CAMERA_Z_FAR) * zoomRef.current
      camera.position.z = reduceMotion
        ? targetZ
        : camera.position.z + (targetZ - camera.position.z) * 0.08

      // Tarkennus valittuun pisteeseen: käännetään lyhintä reittiä, siksi
      // kulmaero normalisoidaan välille [−π, π].
      if (focusRef.current !== null) {
        const diff = Math.atan2(
          Math.sin(focusRef.current - earth.rotation.y),
          Math.cos(focusRef.current - earth.rotation.y),
        )
        if (Math.abs(diff) < 0.002) {
          earth.rotation.y = focusRef.current
          focusRef.current = null
        } else {
          earth.rotation.y += reduceMotion ? diff : diff * 0.07
        }
      }

      // Kiertoratojen pyöriminen ja pilvien ajautuminen ovat oikeaa liikettä
      // — ne pysäytetään.
      if (!reduceMotion) {
        rings[0].rotation.z += 0.0006
        rings[1].rotation.z -= 0.0004
        rings[2].rotation.z += 0.0003
        clouds.rotation.y += 0.00009
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
      for (const child of pointGroup.children as THREE.Mesh[]) {
        child.geometry.dispose()
        ;(child.material as THREE.Material).dispose()
      }
      earthGeometry.dispose()
      earthMaterial.dispose()
      dayTexture.dispose()
      nightTexture.dispose()
      cloudGeometry.dispose()
      cloudMaterial.dispose()
      cloudTexture.dispose()
      starGeometry.dispose()
      starMaterial.dispose()
      atmosphereGeometry.dispose()
      atmosphereMaterial.dispose()
      ringGeometry.dispose()
      ringMaterial.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      refs.current = null
    }
  }, [])

  // --- Datapisteet rakennetaan uudelleen kun kerros vaihtuu ---
  //
  // Pisteitä on kerrosta kohden vain kymmeniä, joten erilliset meshit ovat
  // yksinkertaisempia ja riittävän nopeita. Jos jokin kerros kasvaa satoihin
  // pisteisiin, tämä kannattaa vaihtaa InstancedMeshiin.
  useEffect(() => {
    const current = refs.current
    if (!current) return
    const { pointGroup } = current

    for (const child of [...pointGroup.children] as THREE.Mesh[]) {
      pointGroup.remove(child)
      child.geometry.dispose()
      ;(child.material as THREE.Material).dispose()
    }

    for (const point of layer.points) {
      const radius = 0.012 + 0.016 * (point.weight ?? 0.5)
      const geometry = new THREE.SphereGeometry(radius, 16, 16)
      const material = new THREE.MeshBasicMaterial({
        color: TONE_COLORS[point.tone ?? 'neutral'],
      })
      const mesh = new THREE.Mesh(geometry, material)
      const pos = latLngToVec3(point.lat, point.lng, 1.015)
      mesh.position.set(pos.x, pos.y, pos.z)
      mesh.userData.point = point
      mesh.userData.baseScale = 1
      mesh.userData.selected = point.id === selectedId
      pointGroup.add(mesh)
    }
  }, [layer, selectedId])

  return (
    <div
      ref={containerRef}
      aria-label={`Maapallo, kerros: ${layer.label}`}
      role="img"
      className={`aspect-square transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`}
    />
  )
}
