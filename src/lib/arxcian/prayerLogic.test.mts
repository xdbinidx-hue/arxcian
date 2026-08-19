import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextPrayer, addDays, type PrayerDay } from './prayerLogic.ts'

/**
 * Rukousaikojen "mikä on seuraava" -logiikka.
 *
 * Kellonajat ovat oikeita Aladhanin vastauksia Helsingille (method=3,
 * latitudeAdjustmentMethod=3) eivätkä keksittyjä: kesäkuun Isha keskiyön yli
 * on juuri se tapaus jonka takia nämä testit ovat olemassa, eikä sitä voi
 * keksiä uskottavasti ilman todellista dataa.
 */

/** 21.6.2026 — Isha 00:16 eli seuraavan vuorokauden puolella. */
const kesapaiva: PrayerDay = {
  date: '2026-06-21',
  timings: { Fajr: '02:23', Dhuhr: '13:22', Asr: '17:39', Maghrib: '22:50', Isha: '00:16' },
  hijri: '6 Muharram 1448',
}

const kesahuominen: PrayerDay = {
  date: '2026-06-22',
  timings: { Fajr: '02:24', Dhuhr: '13:22', Asr: '17:39', Maghrib: '22:50', Isha: '00:16' },
  hijri: '7 Muharram 1448',
}

/** 20.8.2026 — tavallinen järjestys, Isha 23:29 ennen keskiyötä. */
const elopaiva: PrayerDay = {
  date: '2026-08-20',
  timings: { Fajr: '03:08', Dhuhr: '13:24', Asr: '17:24', Maghrib: '21:00', Isha: '23:29' },
  hijri: '7 Rabi al-awwal 1448',
}

const elohuominen: PrayerDay = {
  date: '2026-08-21',
  timings: { Fajr: '03:11', Dhuhr: '13:24', Asr: '17:22', Maghrib: '20:57', Isha: '23:25' },
  hijri: '8 Rabi al-awwal 1448',
}

const kesa = [kesapaiva, kesahuominen]
const elo = [elopaiva, elohuominen]

/** "23:00" → minuutteja keskiyöstä, testien luettavuuden vuoksi. */
function klo(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

test('keskiyön yli mennyt Isha on yhä edessä klo 23 — ei "päivä ohi"', () => {
  // Tämä on se bugi: ennen korjausta paluuarvo oli huomisen Fajr 02:24,
  // eli paneeli väitti päivän rukousten olevan ohi vaikka Isha oli edessä.
  const next = nextPrayer(kesa, '2026-06-21', klo('23:00'))
  assert.deepEqual(next, { key: 'Isha', time: '00:16', tomorrow: false })
})

test('keskiyön yli mennyt Isha on edessä myös heti Maghribin jälkeen', () => {
  const next = nextPrayer(kesa, '2026-06-21', klo('22:55'))
  assert.deepEqual(next, { key: 'Isha', time: '00:16', tomorrow: false })
})

test('aamuyöllä ennen keskiyön yli mennyttä Ishaa seuraava on Isha, ei Fajr', () => {
  const next = nextPrayer(kesa, '2026-06-21', klo('00:10'))
  assert.deepEqual(next, { key: 'Isha', time: '00:16', tomorrow: false })
})

test('Ishan mentyä aamuyöllä seuraava on saman päivän Fajr', () => {
  const next = nextPrayer(kesa, '2026-06-21', klo('00:20'))
  assert.deepEqual(next, { key: 'Fajr', time: '02:23', tomorrow: false })
})

test('keskiyön yli mennyt Isha ei ohita päivän muita rukouksia', () => {
  assert.deepEqual(nextPrayer(kesa, '2026-06-21', klo('01:00')), {
    key: 'Fajr', time: '02:23', tomorrow: false,
  })
  assert.deepEqual(nextPrayer(kesa, '2026-06-21', klo('12:00')), {
    key: 'Dhuhr', time: '13:22', tomorrow: false,
  })
  assert.deepEqual(nextPrayer(kesa, '2026-06-21', klo('18:00')), {
    key: 'Maghrib', time: '22:50', tomorrow: false,
  })
})

test('tavallinen päivä: Isha ennen keskiyötä käyttäytyy ennallaan', () => {
  assert.deepEqual(nextPrayer(elo, '2026-08-20', klo('22:00')), {
    key: 'Isha', time: '23:29', tomorrow: false,
  })
  assert.deepEqual(nextPrayer(elo, '2026-08-20', klo('06:00')), {
    key: 'Dhuhr', time: '13:24', tomorrow: false,
  })
})

test('tavallisen päivän Ishan jälkeen seuraava on huomisen Fajr', () => {
  const next = nextPrayer(elo, '2026-08-20', klo('23:40'))
  assert.deepEqual(next, { key: 'Fajr', time: '03:11', tomorrow: true })
})

test('vanhentunut data eri päivältä ei tuota mitään', () => {
  // Sama suoja kuin pickSunDayssa: eilisen aikoja ei näytetä tämän päivän
  // lukuina, vaan paneeli menee tyhjään tilaan.
  assert.equal(nextPrayer(elo, '2026-08-22', klo('12:00')), null)
})

test('puuttuva huominen ei kaada, vaan palauttaa null', () => {
  assert.equal(nextPrayer([elopaiva], '2026-08-20', klo('23:40')), null)
})

test('rikkinäistä huomista ei näytetä viivana', () => {
  const rikki: PrayerDay = {
    date: '2026-08-21',
    timings: { Fajr: '—', Dhuhr: '—', Asr: '—', Maghrib: '—', Isha: '—' },
    hijri: '',
  }
  assert.equal(nextPrayer([elopaiva, rikki], '2026-08-20', klo('23:40')), null)
})

test('addDays ylittää kuukauden ja kesäajan vaihdon oikein', () => {
  assert.equal(addDays('2026-08-31', 1), '2026-09-01')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  // Kesäajan loppu Suomessa 25.10.2026 — vuorokausi on 25 tuntia, joten
  // nykyhetkeen lisätyt 24 h osuisivat samaan päivään.
  assert.equal(addDays('2026-10-25', 1), '2026-10-26')
  assert.equal(addDays('2026-03-29', 1), '2026-03-30')
})
