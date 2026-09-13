import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MALMI_SYYSKUU_2026, tapahtumaOikaisut, tapahtumaMittari } from './rjmobTapahtumaRunRate.ts'
import { runRateMittari } from './rjmob.ts'
import { myymalaRivit, yhteensaRivi, tapahtumaYhteensa } from './rjmobRunRateRivit.ts'
import type { DayInfo, ShiftPlace } from './shiftSchedule.ts'

function paiva(date: string, seller: string, store: ShiftPlace): DayInfo {
  return { date, weekday: 4, closed: false, soloStores: [], absences: {}, shifts: [{ seller, store, start: '10:00', end: '18:00', hours: 8, label: 'aamu' }] }
}
const ikkuna = { paattyneet: 11, kaikki: 26 }
const malmi = tapahtumaOikaisut(202609, '2026-09-12', [], []).myymalat['Helsinki, Malmi']

test('vahvistettu myyjäerittely täsmää Malmin 515 liittymään', () => {
  assert.equal(Object.values(MALMI_SYYSKUU_2026.myyjat).reduce((a, b) => a + b, 0), 515)
})
test('Malmin tapahtumamyynti säilyy kerran, loppukuu ennustetaan normaalipäivistä', () => {
  const r = tapahtumaMittari(runRateMittari(611, 900, 11, 26), ikkuna, malmi)
  assert.equal(r.toteuma, 611)
  assert.equal(r.tavoite, 900)
  assert.equal(r.ennuste, 791) // 611 + (611 - 515) / (11 - 3) * (26 - 11)
  assert.equal(r.pct, 791 / 900 * 100)
})
test('myyjän muiden myymälöiden vuorot samoilla päivillä pysyvät normaalivuoroina', () => {
  const o = tapahtumaOikaisut(202609, '2026-09-12', [
    paiva('2026-09-10', 'Krenar Bajqinovci', 'Malmi'),
    paiva('2026-09-11', 'Krenar Bajqinovci', 'Easton'),
    paiva('2026-09-12', 'Krenar Bajqinovci', 'Malmi'),
  ], []).myyjat['Krenar Bajqinovci']
  assert.equal(o.kaikki, 2)
  assert.equal(o.paattyneet, 2)
  assert.equal(o.puute, undefined)
  const r = tapahtumaMittari(runRateMittari(60, 150, 10, 23), { paattyneet: 10, kaikki: 23 }, o)
  assert.equal(r.ennuste, 125)
})
test('Lahden x-vuorot yhdistetään vahvistettuun osallistujaan ja sairauspoissaolo ei synny vuoroksi', () => {
  const o = tapahtumaOikaisut(202609, '2026-09-12', [], [
    { seller: 'Joni Viljamaa', date: '2026-09-10', paikka: 'x', tunnit: 9 },
    { seller: 'Joni Viljamaa', date: '2026-09-11', paikka: 'x', tunnit: 9 },
    { seller: 'Daniel Miettinen', date: '2026-09-04', paikka: 'S+H', tunnit: 7 },
  ])
  assert.equal(o.myyjat['Joni Viljamaa'].kaikki, 2)
  assert.equal(o.myyjat['Daniel Miettinen'], undefined)
  assert.equal(o.myyjat['Steven Sainio'], undefined)
})
test('muu toteutunut tai tuleva tapahtuma estää epätäydellisen normaalitahtiennusteen', () => {
  for (const date of ['2026-09-04', '2026-09-20']) {
    const o = tapahtumaOikaisut(202609, '2026-09-12', [
      paiva('2026-09-10', 'Hamza Hanif', 'Malmi'), paiva(date, 'Hamza Hanif', 'Tapahtuma'),
    ], []).myyjat['Hamza Hanif']
    assert.match(o.puute!, date < '2026-09-12' ? /Muiden tapahtumien/ : /Tulevien tapahtumavuorojen/)
    const r = tapahtumaMittari(runRateMittari(296, 450, 11, 23), { paattyneet: 11, kaikki: 23 }, o)
    assert.equal(r.ennuste, null)
    assert.equal(r.toteuma, 296)
  }
})
test('puuttuva tapahtumavuoro ja useat saman päivän vuorot ilmoitetaan', () => {
  const o = tapahtumaOikaisut(202609, '2026-09-12', [], []).myyjat['Albin Rashica']
  assert.match(o.puute!, /tapahtumavuoro puuttuu/)
  const p = paiva('2026-09-10', 'Krenar Bajqinovci', 'Malmi')
  p.shifts.push(paiva(p.date, 'Krenar Bajqinovci', 'Easton').shifts[0])
  assert.match(tapahtumaOikaisut(202609, '2026-09-12', [p], []).myyjat['Krenar Bajqinovci'].puute!, /useita vuoroja/)
})
test('eri kuukausi tai vuosi ei saa Malmin erittelyä; keskeneräisestä tapahtumasta ei ennusteta', () => {
  for (const order of [202608, 202610, 202709]) assert.deepEqual(tapahtumaOikaisut(order, '2027-09-30', [], []), { myymalat: {}, myyjat: {} })
  const o = tapahtumaOikaisut(202609, '2026-09-11', [], []).myymalat['Helsinki, Malmi']
  assert.equal(tapahtumaMittari(runRateMittari(611, 900, 10, 26), { paattyneet: 10, kaikki: 26 }, o).ennuste, null)
})
test('ristiriitainen myynti tai puuttuva normaalihistoria ei tuota negatiivista tai keksittyä ennustetta', () => {
  assert.equal(tapahtumaMittari(runRateMittari(500, 900, 11, 26), ikkuna, malmi).ennuste, null)
  assert.equal(tapahtumaMittari(runRateMittari(515, 900, 3, 26), { paattyneet: 3, kaikki: 26 }, malmi).ennuste, null)
})
test('päättyneen kuukauden ennuste on toteuma', () => {
  assert.equal(tapahtumaMittari(runRateMittari(950, 900, 26, 26), { paattyneet: 26, kaikki: 26 }, malmi).ennuste, 950)
})
test('muiden myymälöiden luvut säilyvät ja yhteisennuste on korjattujen rivien summa', () => {
  const toteumat = [
    { nimi: 'Helsinki, Malmi', liittymat: 611, fsecure: 51, kassakate: 2087 },
    { nimi: 'Helsinki, Easton', liittymat: 156, fsecure: 22, kassakate: 1199 },
  ]
  const tavoitteet = { 'Helsinki, Malmi': { liittymat: 900, fsecure: 80, kassakate: 4000 } }
  const ennen = myymalaRivit(toteumat, tavoitteet, ikkuna)
  const jalkeen = myymalaRivit(toteumat, tavoitteet, ikkuna, { 'Helsinki, Malmi': malmi })
  assert.deepEqual(jalkeen[1], ennen[1])
  assert.deepEqual(jalkeen[0].fsecure, ennen[0].fsecure)
  assert.deepEqual(jalkeen[0].kassakate, ennen[0].kassakate)
  const sum = tapahtumaYhteensa(yhteensaRivi(toteumat, { liittymat: 1090, fsecure: 120, kassakate: 7300 }, ikkuna), jalkeen)
  assert.equal(sum.liittymat.ennuste, 791 + 156 / 11 * 26)
  jalkeen[0].liittymat.ennuste = null
  assert.equal(tapahtumaYhteensa(sum, jalkeen).liittymat.ennuste, null)
})
