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

/* ---------------------------------------------------------------
   Avaruustausta.

   Sumu ja tähdet lasketaan proseduraalisesti kohinasta — valmista
   taustakuvaa ei ladata, joten se ei maksa tavuakaan siirtoa ja on
   tarkka millä tahansa resoluutiolla.

   Tausta on staattinen, joten se renderöidään KERRAN tekstuuriksi.
   Kohinan laskeminen joka ruudulla olisi tuhlausta: viisi oktaavia
   3D-kohinaa yli miljoonalle pikselille 60 kertaa sekunnissa söisi
   akkua puhelimessa turhaan.
   --------------------------------------------------------------- */

const QUAD_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

// Sumu lasketaan RUUTUKOORDINAATEISSA eikä pallon pinnalla. Pallolle
// kiedottuna tekstuuri kattaisi 360°, mutta kamera näkee siitä vain noin 38°,
// jolloin näkyviin jäisi pieni venytetty pala eikä rakenne erottuisi.
const NEBULA_FRAGMENT = `
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(233.34, 851.73));
    p += dot(p, p + 23.45);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.07;
      a *= 0.5;
    }
    return v;
  }

  // Pyöreä tähti solun keskellä: solu arvotaan hashilla ja etäisyys
  // keskipisteestä pehmentää reunan, jolloin tähdistä ei tule neliöitä.
  float stars(vec2 uv, float density, float threshold, float size) {
    vec2 p = uv * density;
    vec2 cell = floor(p);
    if (hash(cell) < threshold) return 0.0;
    float d = length(fract(p) - 0.5);
    return smoothstep(size, 0.0, d) * (0.45 + 0.75 * hash(cell + 7.3));
  }

  void main() {
    vec2 uv = vUv;

    float n1 = fbm(uv * 3.4);
    float n2 = fbm(uv * 7.1 + 21.7);
    float n3 = fbm(uv * 12.5 - 4.3);

    vec3 col = vec3(0.012, 0.020, 0.045);
    col += vec3(0.075, 0.170, 0.400) * pow(smoothstep(0.28, 0.80, n1), 1.4);
    col += vec3(0.200, 0.075, 0.320) * pow(smoothstep(0.38, 0.86, n2), 2.1);
    col += vec3(0.250, 0.115, 0.040) * pow(smoothstep(0.54, 0.92, n3), 2.6);

    col += vec3(0.85, 0.90, 1.00) * stars(uv, 210.0, 0.9930, 0.32);
    col += vec3(0.95, 0.97, 1.00) * stars(uv, 78.0, 0.9970, 0.26) * 1.4;

    gl_FragColor = vec4(col, 1.0);
  }
`

// Valmis sumu näytetään yhtenä tekstuurihakuna ja häivytetään PYÖREÄSTI
// läpinäkyväksi, jottei neliön muotoinen piirtoalue erotu sivun taustasta.
//
// Mitoitus: kameran fov 38° ja etäisyys 4,2 → näkymän puolikorkeus
// 4,2·tan(19°) ≈ 1,45, joten säteen 1 maapallon reuna osuu kohtaan r ≈ 0,69.
// Häivytys alkaa vasta sen jälkeen (0,74) ja päättyy nollaan kohdassa 1,02
// eli juuri canvasin reunalla — kulmat (r ≈ 1,41) jäävät täysin
// läpinäkyviksi, jolloin taustasta tulee pehmeä kehä eikä laatikko.
const BLIT_FRAGMENT = `
  uniform sampler2D map;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0 - smoothstep(0.74, 1.02, r));
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

    /* --- Avaruustausta ---
       Sumu on staattinen, joten se lasketaan KERRAN tekstuuriksi canvasin
       kokoisena. Viiden oktaavin kohinan laskeminen joka ruudulla söisi
       akkua turhaan; näin ruutua kohden jää yksi tekstuurihaku.
       Tausta piirretään omana vaiheenaan ennen pääkohtausta. */
    const bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quadGeometry = new THREE.PlaneGeometry(2, 2)

    const nebulaScene = new THREE.Scene()
    const nebulaMaterial = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX,
      fragmentShader: NEBULA_FRAGMENT,
    })
    nebulaScene.add(new THREE.Mesh(quadGeometry, nebulaMaterial))

    let bgTarget = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    })

    const blitScene = new THREE.Scene()
    const blitMaterial = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX,
      fragmentShader: BLIT_FRAGMENT,
      uniforms: { map: { value: bgTarget.texture } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    blitScene.add(new THREE.Mesh(quadGeometry, blitMaterial))

    /** Piirtää sumun uudelleen kun canvasin koko muuttuu. */
    const renderNebula = () => {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2())
      if (size.x === 0) return
      bgTarget.dispose()
      bgTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      })
      blitMaterial.uniforms.map.value = bgTarget.texture
      renderer.setRenderTarget(bgTarget)
      renderer.render(nebulaScene, bgCamera)
      renderer.setRenderTarget(null)
    }

    refs.current = { scene, camera, renderer, earth, pointGroup }

    // --- Koko ---
    const resize = () => {
      const size = container.clientWidth
      if (size === 0) return
      renderer.setSize(size, size, false)
      camera.aspect = 1
      camera.updateProjectionMatrix()
      renderNebula()
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

      // Pilvien ajautuminen on oikeaa liikettä — se pysäytetään.
      if (!reduceMotion) clouds.rotation.y += 0.00009

      // Tausta omana vaiheenaan ennen pääkohtausta, jolloin syvyyspuskuri ei
      // sekaannu eikä piirtojärjestys riipu läpinäkyvyyslajittelusta.
      renderer.clear()
      renderer.render(blitScene, bgCamera)
      renderer.render(scene, camera)
      frame = requestAnimationFrame(animate)
    }
    renderer.autoClear = false
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
      quadGeometry.dispose()
      nebulaMaterial.dispose()
      blitMaterial.dispose()
      bgTarget.dispose()
      atmosphereGeometry.dispose()
      atmosphereMaterial.dispose()
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
