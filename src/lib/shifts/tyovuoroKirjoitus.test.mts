import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  rakennaKirjoitussuunnitelma, muotoileAika, EKA_SARAKE, VIKA_SARAKE,
  MYYMALA_VARIT, MYYMALA_SOLO_VARIT, TAPAHTUMA_VARI,
} from './tyovuoroKirjoitus.ts'
import { MYYJA_SARAKKEET, TAPAHTUMAT_SARAKE, TOIVEET_SARAKE, sarakeIndeksi } from './tyovuoroExcel.ts'
import { EVENT_PLACE } from '../shiftSchedule.ts'
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

test('tapahtumavuoro kirjoitetaan x:nä eikä myymälävärillä', () => {
  // Tapahtumassa oleva myyjä on töissä muttei miehitä myymälää. Merkintä on
  // käsin tehty; generaattori ei tuota sitä. Väri on neutraali harmaa, jotta
  // se ei näytä miltään myymälältä taulukossa.
  const lauri = MYYJA_SARAKKEET.find(s => s.seller === 'Lauri Ukkonen')!
  const s = rakennaKirjoitussuunnitelma([
    paiva('2026-09-04', {
      shifts: [{ store: EVENT_PLACE, seller: 'Lauri Ukkonen', start: '10:00', end: '18:00', hours: 8, label: 'käsin' }],
    }),
  ], 2026, 9)
  assert.equal(s.arvot[3][lauri.myymala - EKA_SARAKE], 'x')
  assert.equal(s.varit[3][lauri.myymala - EKA_SARAKE], TAPAHTUMA_VARI)
  assert.equal(s.arvot[3][lauri.tunnit - EKA_SARAKE], '8')
})

test('tapahtumavuoro ei ole soolo vaikka päivässä olisi onnenpäivä', () => {
  // `solo` on onnenpäivän myymäläkohtainen merkintä. Ilman tapahtuman
  // tarkistusta ensin väri-indeksointi osuisi tyhjään.
  const lauri = MYYJA_SARAKKEET.find(s => s.seller === 'Lauri Ukkonen')!
  const s = rakennaKirjoitussuunnitelma([
    paiva('2026-09-09', {
      soloStores: ['Easton', 'Kivistö'],
      shifts: [{ store: EVENT_PLACE, seller: 'Lauri Ukkonen', start: '10:00', end: '18:00', hours: 8, label: 'käsin', solo: true }],
    }),
  ], 2026, 9)
  assert.equal(s.varit[8][lauri.myymala - EKA_SARAKE], TAPAHTUMA_VARI)
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

test('kasin merkitty sunnuntaivuoro kirjoitetaan Driveen', () => {
  // Generaattori ei sijoita sunnuntaille mitaan, mutta tapahtuma tai
  // erikoisaukiolo voi vaatia vuoron ja sen saa merkita kasin. Kirjoitus ei
  // saa suodattaa sita pois `closed`-lipun perusteella — merkinta joka ei
  // paady taulukkoon olisi juuri se hiljainen no-op jota vastaan varotaan.
  const hamza = MYYJA_SARAKKEET.find(s => s.seller === 'Hamza Hanif')!
  const s = rakennaKirjoitussuunnitelma([
    paiva('2026-09-06', {
      weekday: 0, closed: true,
      shifts: [{ store: 'Malmi', seller: 'Hamza Hanif', start: '12:00', end: '16:00', hours: 4, label: 'käsin' }],
    }),
  ], 2026, 9)
  assert.equal(s.arvot[5][hamza.vuoro - EKA_SARAKE], '12-16')
  assert.equal(s.arvot[5][hamza.myymala - EKA_SARAKE], 'm')
  assert.equal(s.vuoroja, 1)
})

test('sunnuntai ei saa vuoroja mutta rivi on silti olemassa', () => {
  const s = rakennaKirjoitussuunnitelma([
    paiva('2026-09-06', { weekday: 0, closed: true }),
  ], 2026, 9)
  assert.ok(s.arvot[5].every(v => v === ''))
  assert.equal(s.vuoroja, 0)
})

test('sarakkeeton myyjä raportoidaan eikä pudoteta hiljaa', () => {
  // Keifa aloitti 1.10.2026 eikä hänen sarakkeensa ole vielä kartassa. Ilman
  // `puuttuvatSarakkeet`ia hänen vuoronsa katoaisivat äänettömästi ja Vahvista
  // raportoisi `ok: true` pienemmällä vuoromäärällä — juuri se `"ok": true`
  // jonka takana ei tapahdu mitään. Kirjoituspolku kieltäytyy tämän listan
  // perusteella, kuiva-ajo näyttää nimet.
  const s = rakennaKirjoitussuunnitelma([
    paiva('2026-10-01', {
      weekday: 4,
      shifts: [
        { store: 'Malmi', seller: 'Hamza Hanif', start: '10:00', end: '16:00', hours: 6, label: 'aamu' },
        { store: 'Easton', seller: 'Keifa', start: '12:00', end: '19:00', hours: 7, label: 'ilta' },
      ],
    }),
  ], 2026, 10)
  assert.deepEqual(s.puuttuvatSarakkeet, ['Keifa'])
  assert.equal(s.vuoroja, 1, 'vain sarakkeellinen myyjä päätyy soluihin')
})

test('kaikilla sarakkeellisilla myyjillä puuttuvat-lista on tyhjä', () => {
  const s = rakennaKirjoitussuunnitelma([
    paiva('2026-09-01', {
      weekday: 2,
      shifts: [{ store: 'Malmi', seller: 'Hamza Hanif', start: '10:00', end: '16:00', hours: 6, label: 'aamu' }],
    }),
  ], 2026, 9)
  assert.deepEqual(s.puuttuvatSarakkeet, [])
})
