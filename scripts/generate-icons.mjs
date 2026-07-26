/**
 * Generoi arxcianin PWA-ikonit ilman ulkoisia kuvakirjastoja.
 * Ajo: node scripts/generate-icons.mjs
 *
 * Merkki on sama kuin käyttöliittymän hub-ikoni: rengas, keskipiste ja
 * neljä pientä viivaa. Maskable-ikonissa merkki pidetään keskimmäisen
 * 60 %:n sisällä, jotta Androidin rajaus ei leikkaa sitä.
 */

import { deflateSync, crc32 } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BG = [5, 7, 10]
const ACCENT = [53, 214, 208]

/** Pehmeä reuna: kuinka suuri osa pikselistä on muodon sisällä. */
function coverage(dist, edge, softness = 1.2) {
  if (dist <= edge - softness) return 1
  if (dist >= edge + softness) return 0
  return (edge + softness - dist) / (softness * 2)
}

function blend(dst, i, color, alpha) {
  if (alpha <= 0) return
  for (let c = 0; c < 3; c++) {
    dst[i + c] = Math.round(dst[i + c] * (1 - alpha) + color[c] * alpha)
  }
  dst[i + 3] = 255
}

function draw(size) {
  const px = new Uint8Array(size * size * 4)

  // Tausta täyteen reunoihin asti
  for (let i = 0; i < size * size; i++) {
    const o = i * 4
    px[o] = BG[0]
    px[o + 1] = BG[1]
    px[o + 2] = BG[2]
    px[o + 3] = 255
  }

  const c = size / 2
  const ringR = size * 0.26
  const ringW = size * 0.022
  const dotR = size * 0.072
  const tickInner = size * 0.33
  const tickOuter = size * 0.395
  const tickW = size * 0.022

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4
      const dx = x + 0.5 - c
      const dy = y + 0.5 - c
      const dist = Math.hypot(dx, dy)

      // Hehku keskeltä
      const glow = Math.max(0, 1 - dist / (size * 0.5)) ** 3 * 0.14
      blend(px, o, ACCENT, glow)

      // Rengas
      const ring = coverage(Math.abs(dist - ringR), ringW / 2)
      blend(px, o, ACCENT, ring * 0.75)

      // Keskipiste
      blend(px, o, ACCENT, coverage(dist, dotR))

      // Neljä viivaa: ylä, ala, vasen, oikea
      const onVertical = Math.abs(dx) < tickW / 2 && Math.abs(dy) > tickInner && Math.abs(dy) < tickOuter
      const onHorizontal = Math.abs(dy) < tickW / 2 && Math.abs(dx) > tickInner && Math.abs(dx) < tickOuter
      if (onVertical || onHorizontal) blend(px, o, ACCENT, 0.85)
    }
  }

  return px
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(px, size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bittisyvyys
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // Jokainen rivi alkaa suodatintavulla 0
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const from = y * size * 4
    raw[y * (size * 4 + 1)] = 0
    Buffer.from(px.buffer, from, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const outDir = join(process.cwd(), 'public', 'icons')
mkdirSync(outDir, { recursive: true })

for (const size of [192, 512, 180]) {
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`
  const file = join(outDir, name)
  writeFileSync(file, encodePng(draw(size), size))
  console.log(`${name} (${size}x${size})`)
}
