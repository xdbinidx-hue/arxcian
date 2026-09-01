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
  generateMonth, STORE_MANAGERS, MANAGER_NAMES,
  VLADIMIR, ANTTI, RAMIN, ALBIN, ANTTI_MAX_SHIFTS_PER_WEEK,
  RAMIN_MAX_SHIFTS_PER_WEEK, VLADIMIR_MAX_SHIFTS_PER_WEEK, sopiiVuoro,
  laskeVajeet, laskeTunnit, KEIFA, MAX_SHIFTS_PER_WEEK, rosterKuussa,
  jaaAnkkurit, onVoimassa, voimassaKuussa,
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
  // Kuukauden kokoaikaiset, ei kaikkien aikojen lista: Keifa aloittaa vasta
  // 1.10.2026, ja hänen nollansa mukana ero olisi 11 eikä 3.
  const malmi = rosterKuussa(2026, 9).fullTime.map(s =>
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
  const kokoaikaiset = rosterKuussa(2026, 9).fullTime.map(s => tulos.tunnit[s])
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

// ===================== Myyjän voimassaolo =====================
//
// Albinin vahvistus 1.9.2026: Antin viimeinen työpäivä on 30.9.2026 ja Keifa
// aloittaa 1.10.2026. Nämä ovat KOVIA invariantteja.
//
// Lokakuu ajetaan **tyhjällä syötteellä** — ei tapahtumia, ei onnenpäiviä, ei
// poissaoloja. Se on juuri se tilanne jossa Albinin tuntien pitää olla nolla:
// jos hän saa vuoron silloin kun kukaan ei ole poissa, jokin sääntö toimii
// väärin eikä kyse ole normaalista vaihtelusta.

function tyhjaSyote(vuosi: number, kuukausi: number): KuukaudenSyote {
  const paivia = new Date(vuosi, kuukausi, 0).getDate()
  const paivat: PaivanSyote[] = []
  for (let d = 1; d <= paivia; d++) {
    paivat.push({
      date: `${vuosi}-${String(kuukausi).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      tapahtumat: [], soloMyymalat: [], poissaolot: [],
    })
  }
  return { vuosi, kuukausi, paivat }
}

const lokakuu = generateMonth(2026, 10, tyhjaSyote(2026, 10))

test('voimassaolo rajaa päivä- ja kuukausitasolla', () => {
  assert.equal(onVoimassa(ANTTI, '2026-09-30'), true)
  assert.equal(onVoimassa(ANTTI, '2026-10-01'), false)
  assert.equal(onVoimassa(KEIFA, '2026-09-30'), false)
  assert.equal(onVoimassa(KEIFA, '2026-10-01'), true)
  // Merkitsemätön myyjä on aina listalla.
  assert.equal(onVoimassa(VLADIMIR, '2020-01-01'), true)

  assert.equal(voimassaKuussa(ANTTI, 2026, 9), true)
  assert.equal(voimassaKuussa(ANTTI, 2026, 10), false)
  assert.equal(voimassaKuussa(KEIFA, 2026, 9), false)
  assert.equal(voimassaKuussa(KEIFA, 2026, 10), true)
})

test('Anttia ei poisteta listalta — hän on syyskuussa mukana', () => {
  // Poistaminen näyttäisi siivoukselta mutta pyyhkisi hänet myös menneiltä
  // kuukausilta. Voimassaoloväli hoitaa saman ilman sitä hintaa.
  assert.ok(rosterKuussa(2026, 9).on(ANTTI), 'Antti puuttuu syyskuun rosterista')
  assert.ok(tulos.vuorot[ANTTI] > 0, 'Antti jäi ilman syyskuun vuoroja')
})

test('Antilla ei ole yhtään vuoroa lokakuussa 2026', () => {
  assert.equal(rosterKuussa(2026, 10).on(ANTTI), false)
  for (const d of lokakuu.days) {
    assert.ok(!d.shifts.some(s => s.seller === ANTTI), `${d.date}: Antille tuli vuoro`)
  }
  assert.equal(lokakuu.tunnit[ANTTI] ?? 0, 0)
})

test('Keifalla ei ole yhtään vuoroa syyskuussa 2026', () => {
  assert.equal(rosterKuussa(2026, 9).on(KEIFA), false)
  for (const d of tulos.days) {
    assert.ok(!d.shifts.some(s => s.seller === KEIFA), `${d.date}: Keifalle tuli vuoro`)
  }
  assert.equal(tulos.tunnit[KEIFA] ?? 0, 0)
})

test('Keifalla on enintään viisi vuoroa jokaisella lokakuun viikolla', () => {
  assert.ok(lokakuu.vuorot[KEIFA] > 0, 'Keifa jäi kokonaan ilman vuoroja')
  for (const viikko of viikoittain(lokakuu.days)) {
    const n = vuorojaViikossa(viikko, KEIFA)
    assert.ok(n <= MAX_SHIFTS_PER_WEEK,
      `viikko ${viikko[0].date}: Keifa ${n} vuoroa (katto ${MAX_SHIFTS_PER_WEEK})`)
  }
})

test('Albin ei tee yhtään tuntia lokakuussa kun kukaan ei ole poissa', () => {
  // Albinin tunnit ovat oire, eivät miehitystä. Tyhjällä syötteellä hänen
  // pitää jäädä nollaan; jos ei jää, joku muu on jäänyt ilman vuoroja.
  //
  // Tämä kaatui toteutuksen aikana 4 tunnilla (pe 30.10. Malmi 10–14), ja syy
  // oli swingin ehdoton etuoikeus `fallbackFor`issa: swing söi paikkausvuorot
  // ohi tuntikirjanpidon, kaksi kokoaikaista tuli viikkokattoonsa torstaihin
  // mennessä eikä perjantain yhdeksänteen paikkaan jäänyt ketään. Ks.
  // `fallbackFor`in kommentti.
  assert.equal(lokakuu.tunnit[ALBIN] ?? 0, 0,
    `Albin ${lokakuu.tunnit[ALBIN]} h lokakuussa ilman poissaoloja`)
})

test('lokakuussa ei ole yhtään vajetta kun kukaan ei ole poissa', () => {
  assert.deepEqual(lokakuu.vajeet, [])
})

test('kokoaikaisten tuntiero pysyy alle 15 tunnissa', () => {
  // Toimeksiannon raja 1.9.2026. Swingiksi joutuva ei saa jäädä ankkuroituja
  // huonompaan — eikä parempaan: mitattu joulukuu 2026 oli 38 h ero ennen kuin
  // swingin ehdoton etuoikeus poistettiin.
  for (const [vuosi, kuukausi] of [[2026, 10], [2026, 11], [2026, 12]] as [number, number][]) {
    const t = generateMonth(vuosi, kuukausi, tyhjaSyote(vuosi, kuukausi))
    const h = rosterKuussa(vuosi, kuukausi).fullTime.map(s => t.tunnit[s] ?? 0)
    const ero = Math.max(...h) - Math.min(...h)
    assert.ok(ero <= 15, `${vuosi}-${kuukausi}: kokoaikaisten tuntiero ${ero} h (${h.join(', ')})`)
  }
})

test('päälliköiden tunnit ovat kokoaikaisten yläpuolella myös lokakuussa', () => {
  const paallikot = MANAGER_NAMES.map(m => lokakuu.tunnit[m])
  const kokoaikaiset = rosterKuussa(2026, 10).fullTime.map(s => lokakuu.tunnit[s])
  assert.ok(Math.min(...paallikot) > Math.max(...kokoaikaiset),
    `pienin päällikkö ${Math.min(...paallikot)} h ei ylitä suurinta kokoaikaista ${Math.max(...kokoaikaiset)} h`)
})

test('keskiviikkoisin kaikki kolme päällikköä ovat Malmilla myös lokakuussa', () => {
  for (const d of lokakuu.days.filter(x => x.weekday === 3)) {
    const malmilla = d.shifts.filter(s => s.store === 'Malmi').map(s => s.seller)
    for (const mgr of MANAGER_NAMES) {
      assert.ok(malmilla.includes(mgr), `${d.date}: ${mgr} ei ole Malmilla`)
    }
  }
})

// ===================== Vladimirin rajoitteet regressiona lokakuussa =====================
//
// Nämä on jo testattu syyskuulta. Toisto lokakuulta on tahallinen: myyjälistan
// muutos on juuri se hetki jolloin aikarajoite voi pudota huomaamatta.

test('Vladimirin rajoitteet pitävät myös lokakuussa 2026', () => {
  for (const d of lokakuu.days) {
    const omat = d.shifts.filter(s => s.seller === VLADIMIR)
    if ([1, 3, 0].includes(d.weekday)) {
      assert.equal(omat.length, 0, `${d.date} (wd${d.weekday}): Vladimirille tuli vuoro`)
    }
    if (d.weekday !== 6) {
      for (const s of omat) assert.ok(s.start >= '12:00', `${d.date}: Vladimir aloittaa ${s.start}`)
    }
  }
  const lauantait = lokakuu.days.filter(d => d.weekday === 6)
  assert.equal(lauantait.length, 5, 'lokakuussa 2026 on viisi lauantaita')
  for (const d of lauantait) {
    assert.ok(d.shifts.some(s => s.seller === VLADIMIR), `${d.date}: Vladimir ei ole töissä`)
  }
})

test('Vladimir ei saa ankkuria vaikka ankkuroitavia on viisi', () => {
  // Jokainen ankkuripaikka on aamuvuoro. Jos hän jää kiertoon, hänen
  // paikkansa jää tyhjäksi joka viikko ja hän itse melkein kokonaan listalta.
  assert.ok(!rosterKuussa(2026, 10).anchorable.includes(VLADIMIR))
})

// ===================== Swing-kierto =====================

test('swing syntyy vasta kun ankkuroitavia on enemmän kuin paikkoja', () => {
  const nelja = ['A', 'B', 'C', 'D']
  assert.equal(jaaAnkkurit(nelja, {}, {}, null).swing, null,
    'neljä ankkuroitavaa ja neljä paikkaa — swingiä ei pidä syntyä')
  assert.equal(Object.keys(jaaAnkkurit(nelja, {}, {}, null).anchors).length, 4)

  const viisi = ['A', 'B', 'C', 'D', 'E']
  assert.equal(jaaAnkkurit(viisi, {}, {}, null).swing, 'E')
  assert.equal(Object.keys(jaaAnkkurit(viisi, {}, {}, null).anchors).length, 4)
})

test('sama myyjä ei jää swingiksi kahtena peräkkäisenä viikkona', () => {
  const viisi = ['A', 'B', 'C', 'D', 'E']
  // Tasatilanne (kaikki nollissa) on juuri se joka toistuu kuukauden
  // tynkäviikon jälkeen: ilman edellisen swingin muistia E olisi swing myös
  // toisella viikolla.
  assert.equal(jaaAnkkurit(viisi, {}, {}, null).swing, 'E')
  assert.equal(jaaAnkkurit(viisi, {}, {}, 'E').swing, 'D')
  // Vaihto tehdään viimeisen ankkuroidun kanssa, joten E saa ankkuripaikan.
  assert.ok(jaaAnkkurit(viisi, {}, {}, 'E').anchors['E'])
})

test('swing ei toistu peräkkäisillä viikoilla oikeilla kuukausilla', () => {
  // Mitattu vika: marraskuu 2026 alkaa sunnuntaista, joten ensimmäinen viikko
  // on tynkä ilman vuoroja ja Malmi-kertymät ovat nollia myös toisen viikon
  // alkaessa. Ilman edellisen swingin muistia Keifa olisi swing kahdesti.
  for (const [vuosi, kuukausi] of [[2026, 10], [2026, 11], [2026, 12], [2027, 1]] as [number, number][]) {
    const roster = rosterKuussa(vuosi, kuukausi)
    const malmi: Record<string, number> = {}
    let edellinen: string | null = null
    // Karkea toisinto: kertymät eivät ole tässä oikeat, mutta tasatilanne on
    // juuri se jossa vika esiintyi.
    for (let viikko = 0; viikko < 6; viikko++) {
      const jako = jaaAnkkurit(roster.anchorable, malmi, {}, edellinen)
      assert.notEqual(jako.swing, edellinen,
        `${vuosi}-${kuukausi} viikko ${viikko}: swing toistui (${jako.swing})`)
      if (jako.swing) malmi[jako.swing] = (malmi[jako.swing] ?? 0) + 1
      edellinen = jako.swing
    }
  }
})
