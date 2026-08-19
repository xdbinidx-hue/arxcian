import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  rakennaKirjoitussuunnitelma, muotoileAika, EKA_SARAKE, VIKA_SARAKE,
  MYYMALA_VARIT, MYYMALA_SOLO_VARIT,
} from './tyovuoroKirjoitus.ts'
import { MYYJA_SARAKKEET, TAPAHTUMAT_SARAKE, TOIVEET_SARAKE, sarakeIndeksi } from './tyovuoroExcel.ts'
import type { DayInfo } from '../shiftSchedule.ts'

function paiva(date: string, muut: Partial<DayInfo> = {}): DayInfo {
  return {
    date, weekday: 1, closed: false, soloStores: [], absences: {}, shifts: [], ...muut,
  }
}

test('aika muotoillaan taulukon tapaan', () => {
  assert.equal(muotoileAika('10:00'), '10')
  assert.equal(muotoileAika('09:00'), '9')
  assert.equal(muotoileAika('19:00'), '19')
  assert.equal(muotoileAika('10:30'), '10.30')
})

test('kirjoitusalue on B..AH eikä ulotu A:han, AR:ään tai AU:hun', () => {
  const s = rakennaKirjoitussuunnitelma([], 2026, 9)
  assert.equal(s.alue, 'B4:AH33')
  assert.equal(s.ekaSarake, sarakeIndeksi('B'))
  assert.equal(s.vikaSarake, sarakeIndeksi('AH'))
  // Sarake A (Pvm), AR (Tapahtumat) ja AU (Toiveet) ovat alueen ulkopuolella.
  assert.ok(s.ekaSarake > sarakeIndeksi('A'))
  assert.ok(s.vikaSarake < TAPAHTUMAT_SARAKE)
  assert.ok(s.vikaSarake < TOIVEET_SARAKE)
})

test('kirjoitus ei ulotu riville 35 (tuntisummakaavat)', () => {
  assert.equal(rakennaKirjoitussuunnitelma([], 2026, 9).vikaRivi, 33)
  assert.equal(rakennaKirjoitussuunnitelma([], 2026, 8).vikaRivi, 34)
  // Rivi 35 ja Huoltolista (37-68) jäävät aina alueen ulkopuolelle.
  for (const kk of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    assert.ok(rakennaKirjoitussuunnitelma([], 2026, kk).vikaRivi < 35, `kuukausi ${kk}`)
  }
})

test('vuoro kirjoittaa kolme saraketta ja värittää vain myymäläsarakkeen', () => {
  const alec = MYYJA_SARAKKEET.find(s => s.seller === 'Alec Fambro')!
  const s = rakennaKirjoitussuunnitelma([
    paiva('2026-09-01', {
      shifts: [{ store: 'Easton', seller: 'Alec Fambro', start: '10:00', end: '17:00', hours: 7, label: 'aamu' }],
    }),
  ], 2026, 9)

  const r = 0 // 1.9. = rivi 4 = ensimmäinen kirjoitettava
  assert.equal(s.arvot[r][alec.vuoro - EKA_SARAKE], '10-17')
  assert.equal(s.arvot[r][alec.tunnit - EKA_SARAKE], '7')
  assert.equal(s.arvot[r][alec.myymala - EKA_SARAKE], 'e', 'myymäläkirjain pienellä')

  assert.equal(s.varit[r][alec.vuoro - EKA_SARAKE], null, 'vuorosarake jää valkoiseksi')
  assert.equal(s.varit[r][alec.tunnit - EKA_SARAKE], null, 'tuntisarake jää valkoiseksi')
  assert.equal(s.varit[r][alec.myymala - EKA_SARAKE], MYYMALA_VARIT.Easton)
  assert.equal(s.vuoroja, 1)
})

test('soolovuoro saa kirkkaan värin', () => {
  const joona = MYYJA_SARAKKEET.find(s => s.seller === 'Joona Huttunen')!
  const s = rakennaKirjoitussuunnitelma([
    paiva('2026-09-02', {
      soloStores: ['Kivistö'],
      shifts: [{ store: 'Kivistö', seller: 'Joona Huttunen', start: '10:00', end: '19:00', hours: 9, label: 'OP', solo: true }],
    }),
  ], 2026, 9)
  assert.equal(s.varit[1][joona.myymala - EKA_SARAKE], MYYMALA_SOLO_VARIT.Kivistö)
})

test('poissaolomerkintä kirjoitetaan takaisin eikä katoa', () => {
  // Kirjoitusalue on sama jossa Albinin "Nizza" on. Jos merkintää ei
  // palautettaisi, vahvistus söisi sen ja seuraava generointi luulisi
  // Arbnorin olevan töissä.
  const arbnor = MYYJA_SARAKKEET.find(s => s.seller === 'Arbnor Rashica')!
  const s = rakennaKirjoitussuunnitelma([
    paiva('2026-09-14', { absences: { 'Arbnor Rashica': 'Nizza' } }),
  ], 2026, 9)
  assert.equal(s.arvot[13][arbnor.vuoro - EKA_SARAKE], 'Nizza')
  assert.equal(s.arvot[13][arbnor.tunnit - EKA_SARAKE], '')
  assert.equal(s.poissaoloja, 1)
})

test('tyhjä päivä tyhjentää solut (vanhat jäänteet eivät jää)', () => {
  const s = rakennaKirjoitussuunnitelma([paiva('2026-09-01')], 2026, 9)
  assert.ok(s.arvot[0].every(v => v === ''), 'koko rivi tyhjä')
  assert.ok(s.varit[0].every(v => v === null), 'ei värejä')
})

test('suunnitelman muoto vastaa aluetta', () => {
  const s = rakennaKirjoitussuunnitelma([], 2026, 9)
  assert.equal(s.arvot.length, s.vikaRivi - s.ekaRivi + 1)
  assert.equal(s.arvot[0].length, VIKA_SARAKE - EKA_SARAKE + 1)
  assert.equal(s.varit.length, s.arvot.length)
  assert.equal(s.varit[0].length, s.arvot[0].length)
})

test('sunnuntai ei saa vuoroja mutta rivi on silti olemassa', () => {
  const s = rakennaKirjoitussuunnitelma([
    paiva('2026-09-06', { weekday: 0, closed: true }),
  ], 2026, 9)
  assert.ok(s.arvot[5].every(v => v === ''))
  assert.equal(s.vuoroja, 0)
})
