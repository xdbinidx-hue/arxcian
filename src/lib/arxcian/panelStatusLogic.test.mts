import { test } from 'node:test'
import assert from 'node:assert/strict'
import { yhdistaHakutilat, TUNTEMATON } from './panelStatusLogic.ts'

/**
 * Paneelin hakutilan yhdistely.
 *
 * Ydinkysymys: kumpi kertoo datan iän, cronin hakutila vai välimuistin
 * kirjekuori? Kirjekuori, aina kun se on uudempi — muuten paneeli näyttää
 * cronin kellonajan sekunteja sitten haetulle luvulle.
 */

const KLO_8 = Date.parse('2026-08-23T08:00:00+03:00')
const KLO_12 = Date.parse('2026-08-23T12:00:00+03:00')
const KLO_1230 = Date.parse('2026-08-23T12:30:00+03:00')

test('cronin aikaleima kelpaa kun sivu ei ole hakenut itse', () => {
  const tila = yhdistaHakutilat([{ lastAttempt: KLO_8, lastSuccess: KLO_8, failed: [] }], KLO_8)
  assert.equal(tila.fetchedAt, KLO_8)
  assert.equal(tila.stale, false)
})

test('sivun oma haku voittaa cronin aikaleiman kun se on uudempi', () => {
  // Sään TTL on 20 min mutta cron ajaa 4 h välein, joten tämä on se paneelin
  // normaalitila: luku on juuri haettu, mutta cron onnistui viimeksi klo 8.
  const tila = yhdistaHakutilat([{ lastAttempt: KLO_8, lastSuccess: KLO_8, failed: [] }], KLO_12)
  assert.equal(tila.fetchedAt, KLO_12, 'näytettävä hakuaika on oman haun hetki')
  assert.equal(tila.attemptedAt, KLO_8, 'yrityshetki on yhä cronin')
})

test('vanhempaa kirjekuorta ei käytetä cronin tuoreemman onnistumisen sijaan', () => {
  const tila = yhdistaHakutilat([{ lastAttempt: KLO_12, lastSuccess: KLO_12, failed: [] }], KLO_8)
  assert.equal(tila.fetchedAt, KLO_12)
})

test('onnistunut oma haku kumoaa kaatuneen cron-ajon merkin', () => {
  // Aamun cron kaatui klo 8. Sivu haki luvut itse onnistuneesti klo 12.
  // Ilman kumoamista paneeli olisi punaisena koko päivän tuoreen datan päällä.
  const tila = yhdistaHakutilat(
    [{ lastAttempt: KLO_12, lastSuccess: KLO_8, failed: ['Open-Meteo'] }],
    KLO_1230,
  )
  assert.equal(tila.stale, false, 'ei merkkiä, koska oma haku on yritystä uudempi')
  assert.deepEqual(tila.failed, [], 'mennyt kaatuminen ei kuulu tuoreen datan päälle')
  assert.equal(tila.fetchedAt, KLO_1230)
})

test('kaatunut cron näkyy yhä kun omaa hakua ei ole tapahtunut sen jälkeen', () => {
  const tila = yhdistaHakutilat(
    [{ lastAttempt: KLO_12, lastSuccess: KLO_8, failed: ['Open-Meteo'] }],
    KLO_8,
  )
  assert.equal(tila.stale, true, 'näytetty data on aidosti vanhempaa kuin miltä näyttää')
  assert.deepEqual(tila.failed, ['Open-Meteo'])
  assert.equal(tila.fetchedAt, KLO_8)
})

test('ilman yhtään onnistumista kirjekuori kelpaa hakuajaksi mutta merkki jää', () => {
  const tila = yhdistaHakutilat(
    [{ lastAttempt: KLO_12, lastSuccess: null, failed: ['Aladhan'] }],
    KLO_8,
  )
  assert.equal(tila.fetchedAt, KLO_8)
  assert.equal(tila.stale, true)
})

test('monta avainta yhdistetään pessimistisesti', () => {
  // Watchin postilaatikko: kaksi listaa, toinen kaatunut. Sisältö on vajaa
  // vaikka toinen olisi tuore, joten vanhin onnistuminen ja stale voittavat.
  const tila = yhdistaHakutilat([
    { lastAttempt: KLO_12, lastSuccess: KLO_12, failed: [] },
    { lastAttempt: KLO_12, lastSuccess: KLO_8, failed: ['personal'] },
  ])
  assert.equal(tila.fetchedAt, KLO_8, 'niin tuore kuin huonoin lähde')
  assert.equal(tila.stale, true)
  assert.deepEqual(tila.failed, ['personal'])
})

test('monen avaimen kutsuja ei välitä kirjekuorta, joten kumoaminen ei kosketa sitä', () => {
  const tila = yhdistaHakutilat([
    { lastAttempt: KLO_1230, lastSuccess: KLO_8, failed: ['trading'] },
    { lastAttempt: KLO_1230, lastSuccess: KLO_1230, failed: [] },
  ])
  assert.equal(tila.stale, true)
  assert.deepEqual(tila.failed, ['trading'])
})

test('puuttuva avain antaa tuntemattoman tilan, ei hälytystä', () => {
  // Ennen ensimmäistä ajoa avainta ei ole. Konfiguroimaton ja rikki ovat eri
  // tiloja, ja vain jälkimmäinen ansaitsee merkin.
  assert.deepEqual(yhdistaHakutilat([]), TUNTEMATON)
  assert.deepEqual(yhdistaHakutilat([], KLO_8), { ...TUNTEMATON, fetchedAt: KLO_8 })
})
