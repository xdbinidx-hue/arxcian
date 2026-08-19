// Syyskuun 2026 tilannekuva ja sääntötestit.
//
// ⚠️ Luvut EIVÄT ole enää Coworkin alkuperäinen referenssilista. Albin muutti
// sääntöjä 19.8.2026 (lauantain miehitys 7 -> 4 vuoroa, Antti vain Kivistöön,
// Malmi tasan kokoaikaisten kesken), joten vanha referenssi (1 184 h) on
// tarkoituksella vanhentunut. Alla olevat luvut ovat **uusien sääntöjen
// tuottama tilannekuva**, joka on kertaalleen katsottu läpi ja hyväksytty.
//
// Sääntö säilyy silti: jos muutat logiikkaa ja nämä luvut muuttuvat, oletus on
// että muutos on väärä. Päivitä odotukset vasta kun olet lukenut uuden listan
// läpi ja todennut sen paremmaksi — älä koskaan siksi että testi on punainen.
//
// Ajetaan: npm test  (node --test, ei erillistä testiajuria)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateMonth, STORE_MANAGERS, FULL_TIME_SELLERS, MANAGER_NAMES,
  type KuukaudenSyote, type PaivanSyote, type StoreName,
} from './shiftSchedule.ts'

const TAPAHTUMAT: Record<number, string> = {
  4: 'Iisalmi Tapahtuma', 5: 'Iisalmi Tapahtuma', 6: 'Iisalmi Tapahtuma',
  8: 'Holma OP', 9: 'Easton, Kivistö OP',
  10: 'Malmi Tapahtuma', 11: 'Malmi Tapahtuma', 12: 'Malmi Tapahtuma',
  17: 'Syke Tapahtuma', 18: 'Syke Tapahtuma', 19: 'Syke Tapahtuma',
  22: 'Holma OP', 23: 'Easton OP / Kivistö OP',
  24: 'Nokia Tapahtuma', 25: 'Nokia Tapahtuma', 26: 'Nokia Tapahtuma',
}

const SOLO: Record<number, StoreName[]> = {
  9: ['Easton', 'Kivistö'],
  10: ['Malmi'], 11: ['Malmi'], 12: ['Malmi'],
  23: ['Easton', 'Kivistö'],
}

/** Arbnor on Nizzassa ma–to 14.–17.9. — ainoa poissaolo syyskuussa. */
const POISSA: Record<number, { seller: string; label: string }[]> = {
  14: [{ seller: STORE_MANAGERS.Malmi, label: 'Nizza' }],
  15: [{ seller: STORE_MANAGERS.Malmi, label: 'Nizza' }],
  16: [{ seller: STORE_MANAGERS.Malmi, label: 'Nizza' }],
  17: [{ seller: STORE_MANAGERS.Malmi, label: 'Nizza' }],
}

function syyskuunSyote(): KuukaudenSyote {
  const paivat: PaivanSyote[] = []
  for (let d = 1; d <= 30; d++) {
    paivat.push({
      date: `2026-09-${String(d).padStart(2, '0')}`,
      tapahtumat: TAPAHTUMAT[d] ? [TAPAHTUMAT[d]] : [],
      soloMyymalat: SOLO[d] ?? [],
      poissaolot: POISSA[d] ?? [],
    })
  }
  return { vuosi: 2026, kuukausi: 9, paivat }
}

const tulos = generateMonth(2026, 9, syyskuunSyote())

test('syyskuun tuntisummat pysyvät ennallaan', () => {
  const odotettu: Record<string, number> = {
    'Alec Fambro': 156,
    'Joona Huttunen': 155,
    'Arbnor Rashica': 131,
    'Lauri Ukkonen': 122,
    'Kasperi Kemppainen': 122,
    'Krenar Bajqinovci': 117,
    'Vladimir Kogan': 107,
    'Hamza Hanif': 103,
    'Ramin Kadiri': 85,
    'Albin Rashica': 13,
  }
  assert.deepEqual(tulos.tunnit, odotettu)
  assert.equal(Object.values(tulos.tunnit).reduce((a, b) => a + b, 0), 1111)
})

test('syyskuussa on täsmälleen yksi vajepäivä: pe 18.9.', () => {
  // Arbnor on Nizzassa ma–to, ja perjantai on viikon raskain päivä
  // (Malmi 4 + Easton 3) — siksi juuri tähän jää paikkoja tyhjäksi.
  assert.deepEqual(
    tulos.vajeet.map(v => `${v.date} ${v.store} ${v.saatu}/${v.tarve}`),
    ['2026-09-18 Malmi 3/4', '2026-09-18 Easton 2/3'],
  )
})

test('Antti ei saa Malmin eikä Eastonin vuoroja', () => {
  const antinMyymalat = new Set(
    tulos.days.flatMap(d => d.shifts.filter(s => s.seller === 'Antti Kiljala').map(s => s.store)),
  )
  for (const store of antinMyymalat) {
    assert.equal(store, 'Kivistö', `Antti sai vuoron myymälästä ${store}`)
  }
})

test('lauantaina Malmilla kaksi limittäistä vuoroa, muissa yksi', () => {
  const lauantait = tulos.days.filter(d => d.weekday === 6 && d.soloStores.length === 0)
  assert.ok(lauantait.length >= 3)
  for (const d of lauantait) {
    const malmi = d.shifts.filter(s => s.store === 'Malmi')
    assert.equal(malmi.length, 2, `${d.date}: Malmilla ${malmi.length} myyjää`)
    assert.deepEqual(
      malmi.map(s => `${s.start}-${s.end}`).sort(),
      ['10:00-14:00', '12:00-16:00'],
    )
    for (const store of ['Easton', 'Kivistö'] as const) {
      const vuorot = d.shifts.filter(s => s.store === store)
      assert.equal(vuorot.length, 1, `${d.date}: ${store} ${vuorot.length} myyjää`)
      assert.equal(`${vuorot[0].start}-${vuorot[0].end}`, '10:00-16:00')
    }
  }
})

test('Malmi jakautuu tasan kokoaikaisten kesken', () => {
  // Malmi on paras myyntipaikka, joten sen jakautuminen on oma tavoitteensa
  // eikä saa olla tuntitasauksen sivutuote.
  const malmi = FULL_TIME_SELLERS.map(s =>
    tulos.days.reduce((n, d) => n + d.shifts.filter(x => x.seller === s && x.store === 'Malmi').length, 0))
  const ero = Math.max(...malmi) - Math.min(...malmi)
  assert.ok(ero <= 2, `Malmi-vuorojen ero kokoaikaisten välillä on ${ero} (${malmi.join(', ')})`)
})

test('keskiviikkoisin kaikki kolme päällikköä ovat Malmilla', () => {
  // Vain soolottomat keskiviikot: onnenpäivänä myymälän oma päällikkö on
  // sidottu omaan myymäläänsä (esim. ke 9.9. Easton + Kivistö soolona),
  // eikä kolmikkosääntö voi silloin toteutua — sekin on oikein.
  const keskiviikot = tulos.days.filter(d => d.weekday === 3 && d.soloStores.length === 0)
  assert.ok(keskiviikot.length >= 3, `soolottomia keskiviikkoja odotettiin, saatiin ${keskiviikot.length}`)
  for (const d of keskiviikot) {
    const malmilla = d.shifts.filter(s => s.store === 'Malmi').map(s => s.seller)
    for (const mgr of MANAGER_NAMES) {
      if (d.absences[mgr]) continue // esim. Arbnor Nizzassa ke 16.9.
      assert.ok(malmilla.includes(mgr), `${d.date}: ${mgr} ei ole Malmilla (${malmilla.join(', ')})`)
    }
  }
})

test('onnenpäivänä vain päällikkö, mutta muut myymälät toimivat normaalisti', () => {
  // 9.9. Easton + Kivistö soolona → Malmin pitää silti olla täydessä
  // miehityksessä. Tämä oli vanhan toteutuksen bugi: kaikki muut myymälät
  // jäivät tyhjiksi.
  const d = tulos.days.find(x => x.date === '2026-09-09')!
  assert.deepEqual(d.soloStores, ['Easton', 'Kivistö'])
  assert.deepEqual(d.shifts.filter(s => s.store === 'Easton').map(s => s.seller), [STORE_MANAGERS.Easton])
  assert.deepEqual(d.shifts.filter(s => s.store === 'Kivistö').map(s => s.seller), [STORE_MANAGERS.Kivistö])
  assert.equal(d.shifts.filter(s => s.store === 'Malmi').length, 3, 'Malmi normaalisti miehitetty (ke)')

  // Soolovuoro on arkena 10–19 ja merkitty solo-lipulla värjäystä varten.
  const solo = d.shifts.find(s => s.store === 'Easton')!
  assert.equal(solo.start, '10:00')
  assert.equal(solo.end, '19:00')
  assert.equal(solo.solo, true)
})

test('päälliköiden tunnit ovat kokoaikaisten yläpuolella', () => {
  const paallikot = MANAGER_NAMES.map(m => tulos.tunnit[m])
  const kokoaikaiset = FULL_TIME_SELLERS.map(s => tulos.tunnit[s])
  assert.ok(
    Math.min(...paallikot) > Math.max(...kokoaikaiset),
    `pienin päällikkö ${Math.min(...paallikot)} h ei ylitä suurinta kokoaikaista ${Math.max(...kokoaikaiset)} h`,
  )
})

test('sunnuntait ovat suljettuja eikä kukaan ole töissä', () => {
  const sunnuntait = tulos.days.filter(d => d.weekday === 0)
  assert.equal(sunnuntait.length, 4)
  for (const d of sunnuntait) {
    assert.equal(d.closed, true)
    assert.equal(d.shifts.length, 0)
  }
})

test('poissaoleva ei saa yhtään vuoroa', () => {
  for (const date of ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17']) {
    const d = tulos.days.find(x => x.date === date)!
    assert.equal(d.absences[STORE_MANAGERS.Malmi], 'Nizza')
    assert.ok(
      !d.shifts.some(s => s.seller === STORE_MANAGERS.Malmi),
      `${date}: Arbnorille tuli vuoro vaikka hän on Nizzassa`,
    )
  }
})

test('kukaan ei tee kahta vuoroa samana päivänä', () => {
  for (const d of tulos.days) {
    const sellers = d.shifts.map(s => s.seller)
    assert.equal(new Set(sellers).size, sellers.length, `${d.date}: sama myyjä kahdesti`)
  }
})
