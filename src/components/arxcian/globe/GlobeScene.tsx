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

/**
 * Leveys- ja pituuspiirien ristikko pallon pinnalle — se erottaa
 * "teknologisen" ilmeen pelkästä valokuvamaisesta pallosta.
 *
 * Rakennetaan viivapareina yhteen puskuriin: yksi piirtokutsu koko
 * ristikolle sen sijaan että jokainen piiri olisi oma objektinsa.
 */
function buildGraticule(radius: number, step: number, segments: number): THREE.BufferGeometry {
  const points: number[] = []
  const rad = Math.PI / 180

  // Leveyspiirit. Navat jätetään väliin, koska siellä piirit kutistuvat
  // pisteiksi eivätkä tuo mitään.
  for (let lat = -75; lat <= 75; lat += step) {
    const y = radius * Math.sin(lat * rad)
    const r = radius * Math.cos(lat * rad)
    for (let i = 0; i < segments; i++) {
      const a1 = (i / segments) * Math.PI * 2
      const a2 = ((i + 1) / segments) * Math.PI * 2
      points.push(r * Math.cos(a1), y, r * Math.sin(a1), r * Math.cos(a2), y, r * Math.sin(a2))
    }
  }

  // Pituuspiirit navalta navalle.
  for (let lng = 0; lng < 360; lng += step) {
    const t = lng * rad
    for (let i = 0; i < segments / 2; i++) {
      const p1 = (i / (segments / 2)) * Math.PI - Math.PI / 2
      const p2 = ((i + 1) / (segments / 2)) * Math.PI - Math.PI / 2
      points.push(
        radius * Math.cos(p1) * Math.cos(t), radius * Math.sin(p1), radius * Math.cos(p1) * Math.sin(t),
        radius * Math.cos(p2) * Math.cos(t), radius * Math.sin(p2), radius * Math.cos(p2) * Math.sin(t),
      )
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  return geometry
}

const TONE_COLORS: Record<PointTone, number> = {
  up: 0x3ddc97,
  down: 0xff5c72,
  warn: 0xf5b544,
  neutral: 0x9fe8ff,
}

/**
 * Vesimaski päivätekstuurin väristä — jaettu planeetan ja pilvien shaderin
 * kesken, jotta ne eivät voi ajautua eri linjoille.
 *
 * Kaksi signaalia, koska kumpikaan yksin ei riitä:
 *  A) sininen hallitsee → syvä meri
 *  B) syaani, eli sekä vihreä että sininen ylittävät punaisen → matalikot,
 *     joissa vesi on turkoosia (Bahama, Persianlahti). Pelkkä A luokittelisi
 *     ne maaksi, koska niissä vihreä on sinistä suurempi.
 *
 * Molemmat normalisoidaan kirkkaudella: absoluuttinen ero kutistuu tummissa
 * sävyissä, jolloin kiinteä raja jättäisi syvimmät valtameret puolittain
 * läpinäkymättömiksi. Lumi ja jää ovat lähes harmaita, joten kumpikaan
 * signaali ei nouse eivätkä ne katoa.
 *
 * Vertailu tehdään sRGB-arvoilla eikä lineaarisilla: gammapurku madaltaisi
 * eron meren ja tumman metsän välillä.
 */
const WATER_MASK_GLSL = `
  float waterMask(vec3 srgb) {
    float denom = max(srgb.r, max(srgb.g, srgb.b)) + 0.06;
    float blueDominant = (srgb.b - max(srgb.r, srgb.g)) / denom;
    float cyan = (min(srgb.g, srgb.b) - srgb.r) / denom;
    return smoothstep(0.10, 0.30, max(blueDominant, cyan));
  }
`

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
  uniform sampler2D bgMap;
  uniform vec2 uResolution;
  uniform vec3 lightDir;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;

  vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
  ${WATER_MASK_GLSL}

  void main() {
    vec3 n = normalize(vNormal);
    float lambert = dot(n, normalize(lightDir));

    vec3 daySrgb = texture2D(dayMap, vUv).rgb;
    vec3 day = toLinear(daySrgb);
    vec3 night = toLinear(texture2D(nightMap, vUv).rgb);

    float land = 1.0 - waterMask(daySrgb);

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

    // Reunavalo korostaa ilmakehän rajaa myös itse planeetassa. Vain maalla:
    // merialueilla se piirtäisi hehkuvan sirpin sinne missä ei näy mitään.
    float rim = pow(1.0 - max(dot(n, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
    color += vec3(0.10, 0.34, 0.62) * rim * 0.5;

    // Meret sulautetaan taustaan. Taustasumu luetaan ruutukoordinaateilla
    // samasta tekstuurista jolla se piirretään, joten materiaali pysyy
    // läpinäkymättömänä: ei läpinäkyvyyslajittelua, ja syvyyspuskuri piilottaa
    // edelleen pallon takapuolen ristikkoviivat.
    vec3 bg = texture2D(bgMap, gl_FragCoord.xy / uResolution).rgb;
    gl_FragColor = vec4(mix(bg, color, land), 1.0);
  }
`

// Pilvet käyttävät samaa valosuuntaa kuin maapallo: ne hohtavat valaistulla
// puolella ja häviävät varjoon. Ilman tätä pilvet näkyisivät yhtä kirkkaina
// yön puolella, mikä näyttäisi väärältä kaupunkivalojen päällä.
const CLOUD_FRAGMENT = `
  uniform sampler2D cloudMap;
  uniform sampler2D dayMap;
  uniform vec3 lightDir;
  uniform float uCloudOffset;
  varying vec2 vUv;
  varying vec3 vNormal;
  ${WATER_MASK_GLSL}

  void main() {
    float cloud = texture2D(cloudMap, vUv).r;
    float lambert = dot(normalize(vNormal), normalize(lightDir));
    float dayAmount = smoothstep(-0.25, 0.40, lambert);

    // Sama vesimaski kuin planeetan shaderissa: pilvi valtameren päällä
    // leijuisi tyhjässä, koska sen alla ei enää ole pintaa. Pilvikerros
    // ajautuu pinnan yli omaa tahtiaan, joten päivätekstuuri luetaan
    // vastaavasti siirrettynä — muuten maski kiertyisi pilvien mukana ja
    // pilvet katkeaisivat väärästä kohdasta. Ekvirektangulaarisessa
    // projektiossa y-kierto on tasan u-koordinaatin siirto.
    vec2 landUv = vec2(fract(vUv.x + uCloudOffset), vUv.y);
    float land = 1.0 - waterMask(texture2D(dayMap, landUv).rgb);

    gl_FragColor = vec4(vec3(1.0), cloud * (0.06 + 0.78 * dayAmount) * 0.9 * land);
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

    // Yksi väriperhe: syvä sininen. Aiemmat liila- ja oranssikerrokset on
    // poistettu, jotta tausta ei riitele maapallon ja käyttöliittymän
    // sinisen kanssa.
    vec3 col = vec3(0.010, 0.016, 0.034);
    col += vec3(0.052, 0.125, 0.310) * pow(smoothstep(0.30, 0.82, n1), 1.5);
    col += vec3(0.036, 0.092, 0.235) * pow(smoothstep(0.40, 0.88, n2), 2.2);
    col += vec3(0.060, 0.135, 0.275) * pow(smoothstep(0.56, 0.94, n3), 2.8);

    col += vec3(0.82, 0.89, 1.00) * stars(uv, 210.0, 0.9945, 0.30);
    col += vec3(0.90, 0.95, 1.00) * stars(uv, 78.0, 0.9975, 0.24) * 1.15;

    gl_FragColor = vec4(col, 1.0);
  }
`

// Valmis sumu näytetään yhtenä tekstuurihakuna ja häivytetään PYÖREÄSTI
// läpinäkyväksi, jottei neliön muotoinen piirtoalue erotu sivun taustasta.
//
// Mitoitus: kameran fov 38° ja etäisyys 3,45 → näkymän puolikorkeus
// 3,45·tan(19°) ≈ 1,19, joten säteen 1 maapallon reuna osuu kohtaan r ≈ 0,84.
// Häivytys alkaa vasta sen jälkeen (0,88) ja päättyy nollaan kohdassa 1,12 —
// kulmat (r ≈ 1,41) jäävät täysin läpinäkyviksi, jolloin taustasta tulee
// pehmeä kehä eikä laatikko.
const BLIT_FRAGMENT = `
  uniform sampler2D map;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0 - smoothstep(0.88, 1.12, r));
  }
`

type SceneRefs = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  earth: THREE.Mesh
  pointGroup: THREE.Group
}

/**
 * Kameran etäisyys kun zoom = 0 (kaukana) ja zoom = 1 (lähellä).
 * Perusetäisyys on tarkoituksella lähellä: pallo täyttää kuvan ja Eurooppa
 * erottuu kaupunkivaloineen ilman että käyttäjän pitää zoomata itse.
 */
const CAMERA_Z_FAR = 3.45
const CAMERA_Z_NEAR = 2.35

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
    camera.position.z = CAMERA_Z_FAR

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
    world.rotation.z = (-18 * Math.PI) / 180 // maapallon akselikallistuma
    // Pohjoinen pallonpuolisko kallistuu katsojaa kohti. Kun kamera on lähellä,
    // pelkkä pituuspiirin keskitys ei riitä: ilman tätä Eurooppa (~50°N) jäisi
    // kuvan yläreunaan. Kallistus nostaa sen keskelle.
    world.rotation.x = 0.52
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
        // Taustasumun tekstuuri asetetaan renderNebulassa, joka luo kohteen
        // uudelleen aina kun canvasin koko muuttuu.
        bgMap: { value: null as THREE.Texture | null },
        uResolution: { value: new THREE.Vector2(1, 1) },
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
        dayMap: { value: dayTexture },
        lightDir: { value: new THREE.Vector3(-0.9, 0.25, -0.35).normalize() },
        uCloudOffset: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
    })
    const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial)
    earth.add(clouds)

    // Ristikko maapallon lapsena, jotta se kiertyy pinnan mukana. Syvyystesti
    // piilottaa takapuoliskon viivat pallon taakse, joten läpi ei näy.
    const graticuleGeometry = buildGraticule(1.004, 15, 96)
    const graticuleMaterial = new THREE.LineBasicMaterial({
      color: 0x5aa6ff,
      transparent: true,
      // Hieman vahvempi kuin ennen: kun meret sulautuvat taustaan, ristikko
      // kantaa yksin pallon muodon merialueilla.
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    earth.add(new THREE.LineSegments(graticuleGeometry, graticuleMaterial))

    // Datapisteet maapallon lapsina, jotta ne kiertyvät sen mukana.
    const pointGroup = new THREE.Group()
    earth.add(pointGroup)

    const atmosphereGeometry = new THREE.SphereGeometry(1.13, 64, 64)
    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: ATMOSPHERE_VERTEX,
      fragmentShader: ATMOSPHERE_FRAGMENT,
      uniforms: {
        // Tarkoituksella oma arvo eikä sama kuin teeman --ax-accent:
        // additiivinen sekoitus ja fresnel siirtävät sävyä, joten sama heksa
        // näyttäisi pallolla eri väriltä kuin käyttöliittymässä.
        glowColor: { value: new THREE.Color(0x3f9bff) },
        strength: { value: 1.9 },
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
      // Maapallon shader lukee samaa tekstuuria sulauttaakseen meret taustaan.
      earthMaterial.uniforms.bgMap.value = bgTarget.texture
      earthMaterial.uniforms.uResolution.value.set(size.x, size.y)
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
      atmosphereMaterial.uniforms.strength.value = 1.9 + 0.22 * Math.sin(t * 0.55)

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
      if (!reduceMotion) {
        clouds.rotation.y += 0.00009
        cloudMaterial.uniforms.uCloudOffset.value = clouds.rotation.y / (Math.PI * 2)
      }

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
      graticuleGeometry.dispose()
      graticuleMaterial.dispose()
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
