// Syyskuun 2026 tilannekuva ja sääntötestit.
//
// ⚠️ Luvut EIVÄT ole Coworkin referenssilista. Albin muutti sääntöjä
// 19.8.2026 (lauantain miehitys 7 -> 4 vuoroa, Antti Kivistöön etuoikeudella,
// Albin vain hätävaraksi, Malmi tasan kokoaikaisten kesken) ja 26.8.2026
// (myyjäkohtaiset aikarajoitteet, ks. `sopiiVuoro`). Alla olevat luvut ovat
// **nykyisten sääntöjen tuottama tilannekuva**, joka on kertaalleen katsottu
// läpi ja hyväksytty.
//
// Coworkin Python-referenssi 26.8.2026 päätyi 1 189 tuntiin, tämä 1 115:een.
// Ero **ei ole valintajärjestyksessä vaan vuoropohjissa**: referenssi miehittää
// enemmän paikkoja kuin `BASE_SHIFTS`/`MAPE_SHIFTS`/`SATURDAY_SHIFTS` yhteensä
// tuottavat (lauantain keventäminen 7 -> 4 vuoroa on tästä suurin yksittäinen
// erä). Päälliköiden luvut täsmäävät referenssiin tasan, koska heidän
// sijoittelunsa on sääntöohjattua; muiden lukuja ei voi verrata riviltä
// riville. Vertailukelpoinen on **sama päivä**: pe 18.9. on ainoa vajepäivä
// molemmissa.
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
  VLADIMIR, ANTTI, RAMIN, ALBIN, ANTTI_MAX_SHIFTS_PER_WEEK,
  RAMIN_MAX_SHIFTS_PER_WEEK, VLADIMIR_MAX_SHIFTS_PER_WEEK, sopiiVuoro,
  laskeVajeet, laskeTunnit,
  type DayInfo, type KuukaudenSyote, type PaivanSyote, type StoreName,
} from './shiftSchedule.ts'

const TAPAHTUMAT: Record<number, string> = {
  4: 'Iisalmi Tapahtuma', 5: 'Iisalmi Tapahtuma', 6: 'Iisalmi Tapahtuma',
  8: 'Holma OP', 9: 'Easton, Kivistö OP',
  10: 'Malmi Tapahtuma', 11: 'Malmi Tapahtuma', 12: 'Malmi Tapahtuma',
  // 17.–19.9. korjattiin Sykestä Turkuun 26.8.2026.
  17: 'Turku Tapahtuma', 18: 'Turku Tapahtuma', 19: 'Turku Tapahtuma',
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

/**
 * Päivät kalenteriviikoittain (maanantai-avain) — sama jako kuin
 * generaattorilla, jotta viikkokatot testataan siltä viikolta jota ne
 * oikeasti rajaavat eivätkä kuukauden alusta laskien.
 */
function viikoittain(days: DayInfo[]): DayInfo[][] {
  const viikot = new Map<string, DayInfo[]>()
  for (const d of days) {
    const pvm = new Date(d.date)
    const iso = pvm.getDay() === 0 ? 7 : pvm.getDay()
    const ma = new Date(pvm)
    ma.setDate(pvm.getDate() - (iso - 1))
    const avain = ma.toISOString().slice(0, 10)
    if (!viikot.has(avain)) viikot.set(avain, [])
    viikot.get(avain)!.push(d)
  }
  return [...viikot.values()]
}

/** Montako vuoroa myyjällä on tänä viikkona. */
function vuorojaViikossa(viikko: DayInfo[], seller: string): number {
  return viikko.reduce((n, d) => n + d.shifts.filter(s => s.seller === seller).length, 0)
}

test('syyskuun tuntisummat pysyvät ennallaan', () => {
  const odotettu: Record<string, number> = {
    'Alec Fambro': 156,
    'Joona Huttunen': 155,
    'Arbnor Rashica': 131,
    'Lauri Ukkonen': 107,
    'Vladimir Kogan': 105,
    'Antti Kiljala': 98,
    'Hamza Hanif': 96,
    'Kasperi Kemppainen': 90,
    'Krenar Bajqinovci': 86,
    'Ramin Kadiri': 79,
    'Albin Rashica': 12,
  }
  assert.deepEqual(tulos.tunnit, odotettu)
  assert.equal(Object.values(tulos.tunnit).reduce((a, b) => a + b, 0), 1115)
})

test('Antti ja Vladimir tekevät kumpikin viikkokattonsa verran', () => {
  // Albinin linjaus 27.8.2026: molemmat maksimiin. Vladimir on 17 vuorossa
  // eli teoreettisessa maksimissaan (4/vko × neljä täyttä viikkoa + ti 29.9.),
  // Antti 14:ssä (3/vko, viimeisellä vajaalla viikolla kaksi).
  //
  // Nämä ovat tilannekuvaa, eivät invariantteja: viikkokattoa vartioi oma
  // testinsä. Tämä on tässä siksi että **lasku alaspäin on oire** — se
  // tarkoittaisi että joku muu on ottanut heidän vuoronsa.
  assert.equal(tulos.vuorot[VLADIMIR], 17, 'Vladimir ei ole maksimissaan')
  assert.equal(tulos.vuorot[ANTTI], 14, 'Antti ei ole maksimissaan')
})

test('Albin on hätävara: enintään muutama tunti kuukaudessa', () => {
  // Albin on viimeinen keino, ei osa miehitystä. Jos hänen tuntinsa
  // nousevat, joku muu on jäänyt ilman vuoroja — se on oire eikä normaali
  // tila. Antti sen sijaan on osa-aikainen jolle vuoroja kuuluu.
  assert.ok(tulos.tunnit['Albin Rashica'] <= 12,
    `Albin ${tulos.tunnit['Albin Rashica']} h — hätävaralle liikaa`)
  assert.ok(tulos.tunnit['Antti Kiljala'] > tulos.tunnit['Albin Rashica'],
    'Antin pitää tehdä enemmän kuin Albinin')
})

test('ainoa vaje on pe 18.9. Malmilla', () => {
  // Vladimirin aikarajoite kaventaa arkiaamujen kapasiteettia, ja perjantai
  // (Malmi 4 + Easton 3) on se päivä joka ensimmäisenä jää vajaaksi. 18.9.
  // osuu Arbnorin Nizza-viikkoon, joten Malmilta puuttuu myös päällikkö.
  //
  // **Vaje on hyväksyttävämpi kuin sääntörikko**: Vladimiria ei sijoiteta
  // aamuvuoroon paikkaamaan tätä. Sama päivä on Coworkin referenssilistan
  // ainoa vajepäivä.
  assert.deepEqual(tulos.vajeet, [
    { date: '2026-09-18', weekday: 5, store: 'Malmi', saatu: 3, tarve: 4 },
  ])
})

// ===================== Myyjäkohtaiset rajoitteet =====================
//
// Nämä ovat KOVIA invariantteja, eivät tilannekuvaa. Jos jokin näistä kaatuu,
// lista rikkoo Albinin 26.8.2026 vahvistamaa sääntöä eikä sitä saa viedä
// tuotantoon — toisin kuin tuntisummat, joita saa päivittää harkinnan jälkeen.

test('Vladimirilla ei ole yhtään vuoroa maanantaina, keskiviikkona eikä sunnuntaina', () => {
  for (const d of tulos.days) {
    if (![1, 3, 0].includes(d.weekday)) continue
    const oma = d.shifts.filter(s => s.seller === VLADIMIR)
    assert.equal(oma.length, 0, `${d.date} (wd${d.weekday}): Vladimirille tuli vuoro`)
  }
})

test('Vladimirilla ei ole yhtään arkivuoroa joka alkaa ennen klo 12', () => {
  for (const d of tulos.days) {
    if (d.weekday === 6) continue // lauantaina 10–16 käy
    for (const s of d.shifts.filter(x => x.seller === VLADIMIR)) {
      assert.ok(s.start >= '12:00', `${d.date}: Vladimir aloittaa ${s.start}`)
    }
  }
})

test('Vladimir on töissä jokaisena kuukauden lauantaina', () => {
  const lauantait = tulos.days.filter(d => d.weekday === 6)
  assert.equal(lauantait.length, 4, 'syyskuussa 2026 on neljä lauantaita')
  for (const d of lauantait) {
    assert.ok(d.shifts.some(s => s.seller === VLADIMIR),
      `${d.date}: Vladimir ei ole töissä`)
  }
})

test('viikkokatot pitävät jokaisella kalenteriviikolla', () => {
  // Antin katto varmistetaan mittaamalla eikä oletetaan vakion perusteella:
  // `canWork` voisi ohittua varajärjestyksen jossain haarassa.
  const katot: [string, number][] = [
    [VLADIMIR, VLADIMIR_MAX_SHIFTS_PER_WEEK],
    [ANTTI, ANTTI_MAX_SHIFTS_PER_WEEK],
    [RAMIN, RAMIN_MAX_SHIFTS_PER_WEEK],
  ]
  for (const viikko of viikoittain(tulos.days)) {
    for (const [seller, katto] of katot) {
      const n = vuorojaViikossa(viikko, seller)
      assert.ok(n <= katto,
        `viikko ${viikko[0].date}–${viikko[viikko.length - 1].date}: ${seller} ${n} vuoroa (katto ${katto})`)
    }
  }
})

test('sopiiVuoro rajaa vain Vladimiria', () => {
  // Sääntö on puhtaana funktiona, jotta sitä ei tarvitse toistaa testissä.
  assert.equal(sopiiVuoro(VLADIMIR, 1, '14:00'), false, 'maanantai ei kelpaa kellonajasta riippumatta')
  assert.equal(sopiiVuoro(VLADIMIR, 2, '11:59'), false)
  assert.equal(sopiiVuoro(VLADIMIR, 2, '12:00'), true)
  assert.equal(sopiiVuoro(VLADIMIR, 6, '10:00'), true, 'lauantain 10–16 käy')
  assert.equal(sopiiVuoro(RAMIN, 1, '10:00'), true, 'muita ei rajata')
})

test('Albin saa vuoron vasta kun Ramin ja Antti ovat estyneitä', () => {
  // Huom. "molemmat viikkokatossaan" ei voi päteä kirjaimellisesti: Antti
  // tekee vain Kivistöä eikä voi paikata Malmin vajetta vaikka kiintiötä
  // olisi jäljellä. Testi tarkistaa siksi oikean asian — kumpikaan ei olisi
  // voinut ottaa juuri tätä vuoroa.
  for (const viikko of viikoittain(tulos.days)) {
    for (const d of viikko) {
      for (const s of d.shifts.filter(x => x.seller === ALBIN)) {
        const este = (seller: string, myymalaKay: boolean) =>
          !myymalaKay
          || d.absences[seller] !== undefined
          || d.shifts.some(x => x.seller === seller)
          || vuorojaViikossa(viikko, seller) >= (seller === ANTTI
            ? ANTTI_MAX_SHIFTS_PER_WEEK : RAMIN_MAX_SHIFTS_PER_WEEK)

        assert.ok(este(RAMIN, true),
          `${d.date} ${s.store}: Albin sai vuoron vaikka Ramin oli vapaana`)
        assert.ok(este(ANTTI, s.store === 'Kivistö'),
          `${d.date} ${s.store}: Albin sai vuoron vaikka Antti oli vapaana`)
      }
    }
  }
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
  //
  // Sallittu ero oli 2 ennen Vladimirin aikarajoitetta ja on nyt 3. Ero ei ole
  // löysennys vaan rajoitteen rakenteellinen seuraus: Malmin aamu (10–16) ja
  // väli (ti/to 11–18) eivät kelpaa hänelle lainkaan, ja perjantain 12–18 on
  // ankkuripaikka, joten hänen Malmi-mahdollisuutensa ovat kapeammat kuin
  // muiden. **Älä kiristä tätä takaisin kahteen** — se onnistuu vain
  // sijoittamalla hänet aamuvuoroon.
  const malmi = FULL_TIME_SELLERS.map(s =>
    tulos.days.reduce((n, d) => n + d.shifts.filter(x => x.seller === s && x.store === 'Malmi').length, 0))
  const ero = Math.max(...malmi) - Math.min(...malmi)
  assert.ok(ero <= 3, `Malmi-vuorojen ero kokoaikaisten välillä on ${ero} (${malmi.join(', ')})`)
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

test('sunnuntaivuoro lasketaan tunteihin muttei tuota vajetta', () => {
  // Sunnuntai on suljettu, joten silla ei ole miehitystarvetta — kasin
  // merkitty vuoro ei siis saa nayttaa vajetta muissa myymaloissa. Tunnit
  // sen sijaan kuuluvat myyjalle: han oli toissa.
  const su = tulos.days.find(d => d.weekday === 0)!
  const muokattu = tulos.days.map(d => d.date === su.date
    ? { ...d, shifts: [{ store: 'Malmi' as const, seller: ALBIN, start: '12:00', end: '16:00', hours: 4, label: 'käsin' }] }
    : d)
  assert.deepEqual(laskeVajeet(muokattu), tulos.vajeet, 'sunnuntai ei saa lisata vajeita')
  assert.equal(laskeTunnit(muokattu).tunnit[ALBIN], tulos.tunnit[ALBIN] + 4)
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
