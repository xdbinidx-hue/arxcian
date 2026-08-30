import { test } from 'node:test'
import assert from 'node:assert/strict'
import { laskeEnnuste, pctTavoitteesta, runRateMittari, runRateTaso } from './rjmob.ts'
import { laskeTyopaivat, tyopaivaIkkuna, viimeinenPaattynytPaiva } from './rjmobWorkdays.ts'
import { laskeVuoroIkkuna, type DayInfo } from './shiftSchedule.ts'

// ---------------------------------------------------------------------------
// Työpäiväikkuna
// ---------------------------------------------------------------------------

test('kuluva päivä ei ole päättynyt työpäivä', () => {
  // 28.8.2026 on perjantai. Elokuussa 2026 ei ole arkipyhiä, sunnuntait ovat
  // 2., 9., 16., 23. ja 30. — päättyneitä 1.–27. on siis 23, ei 24.
  const { paattyneet, kaikki } = tyopaivaIkkuna(2026, 8, new Date(2026, 7, 28))
  assert.equal(paattyneet, 23)
  assert.equal(kaikki, 26)
  // Vanha "kulunut"-luku laskee kuluvan päivän mukaan. Ne ovat eri lukuja
  // tarkoituksella; jos tämä ero katoaa, ennuste heiluu päivän mittaan.
  assert.equal(laskeTyopaivat(2026, 8, 28), 24)
})

test('kuun 1. päivänä päättyneitä ei ole', () => {
  assert.equal(tyopaivaIkkuna(2026, 8, new Date(2026, 7, 1)).paattyneet, 0)
})

test('mennyt kuukausi on kokonaan päättynyt, tuleva ei lainkaan', () => {
  const nyt = new Date(2026, 7, 28)
  assert.deepEqual(tyopaivaIkkuna(2026, 7, nyt), { paattyneet: 27, kaikki: 27, kesken: false })
  assert.equal(tyopaivaIkkuna(2026, 9, nyt).paattyneet, 0)
})

test('vuororaja on eilinen, kuun vaihteen yli oikein', () => {
  // Kuluva kuukausi: eilinen.
  assert.equal(viimeinenPaattynytPaiva(202608, new Date(2026, 7, 28)), '2026-08-27')
  // Kuun 1. päivänä raja menee edelliseen kuukauteen, jolloin yhtäkään tämän
  // kuun vuoroa ei lasketa päättyneeksi.
  assert.equal(viimeinenPaattynytPaiva(202608, new Date(2026, 7, 1)), '2026-07-31')
  // Mennyt kuukausi on kokonaan takana, tuleva ei alkanutkaan.
  assert.equal(viimeinenPaattynytPaiva(202607, new Date(2026, 7, 28)), '2026-07-31')
  assert.equal(viimeinenPaattynytPaiva(202609, new Date(2026, 7, 28)), '2026-08-31')
})

// ---------------------------------------------------------------------------
// Ennuste ja % tavoitteesta
// ---------------------------------------------------------------------------

test('nolla päättynyttä työpäivää ei tuota nollaa vaan puuttuvan ennusteen', () => {
  assert.equal(laskeEnnuste(0, 0, 26), null)
  assert.equal(laskeEnnuste(120, 0, 26), null)
  assert.equal(pctTavoitteesta(null, 300), null)
})

test('puuttuva tai nolla tavoite ei tuota prosenttia', () => {
  assert.equal(pctTavoitteesta(341, null), null)
  assert.equal(pctTavoitteesta(341, 0), null)
})

test('väriportaikko on 100/90 eikä tehon 9/7', () => {
  assert.equal(runRateTaso(118), 'hyva')
  assert.equal(runRateTaso(100), 'hyva')
  assert.equal(runRateTaso(99.9), 'rajalla')
  assert.equal(runRateTaso(90), 'rajalla')
  assert.equal(runRateTaso(89.9), 'heikko')
  assert.equal(runRateTaso(null), 'tuntematon')
})

/**
 * Toimeksiannon tarkistuslaskelma: elokuu 2026, myymälätaso, toteumat 28.8.
 * Jos nämä luvut muuttuvat, laskenta on muuttunut — ei testi.
 */
test('elokuun 2026 tarkistuslaskelma täsmää', () => {
  const paattyneet = 23
  const kaikki = 26
  const odotettu: [string, number, number, number, number][] = [
    // myymälä, tavoite, toteuma, ennuste, %
    ['Lahti, Holma', 290, 302, 341, 118],
    ['Helsinki, Malmi', 330, 263, 297, 90],
    ['Lahti, Syke', 230, 147, 166, 72],
    ['Helsinki, Easton', 190, 141, 159, 84],
    ['Vantaa, Kivistö', 760, 116, 131, 17],
  ]

  for (const [nimi, tavoite, toteuma, ennuste, pct] of odotettu) {
    const m = runRateMittari(toteuma, tavoite, paattyneet, kaikki)
    assert.equal(Math.round(m.ennuste as number), ennuste, `${nimi} ennuste`)
    assert.equal(Math.round(m.pct as number), pct, `${nimi} %`)
  }

  const yhteensa = runRateMittari(969, 1800, paattyneet, kaikki)
  assert.equal(Math.round(yhteensa.ennuste as number), 1095)
  assert.equal(Math.round(yhteensa.pct as number), 61)

  const fsec = runRateMittari(133, 265, paattyneet, kaikki)
  assert.equal(Math.round(fsec.ennuste as number), 150)
  assert.equal(Math.round(fsec.pct as number), 57)

  const kassa = runRateMittari(11529, 15500, paattyneet, kaikki)
  assert.equal(Math.round(kassa.ennuste as number), 13033)
  assert.equal(Math.round(kassa.pct as number), 84)
})

// ---------------------------------------------------------------------------
// Myyjän vuoroikkuna
// ---------------------------------------------------------------------------

function paiva(date: string, myyjat: string[]): DayInfo {
  return {
    date,
    weekday: 1,
    closed: false,
    soloStores: [],
    absences: {},
    shifts: myyjat.map(seller => ({
      store: 'Malmi' as const, seller, start: '10:00', end: '16:00', hours: 6, label: 'aamu',
    })),
  }
}

test('myyjän vuorot lasketaan eiliseen asti, koko kuukausi erikseen', () => {
  const days = [
    paiva('2026-08-26', ['Hamza Hanif', 'Lauri Ukkonen']),
    paiva('2026-08-27', ['Hamza Hanif']),
    paiva('2026-08-28', ['Hamza Hanif']),
    paiva('2026-08-31', ['Lauri Ukkonen']),
  ]
  const ikkuna = laskeVuoroIkkuna(days, '2026-08-27')

  assert.deepEqual(ikkuna['Hamza Hanif'], { paattyneet: 2, kaikki: 3 })
  assert.deepEqual(ikkuna['Lauri Ukkonen'], { paattyneet: 1, kaikki: 2 })
  // Listalta puuttuva myyjä ei saa ikkunaa lainkaan — ei nollaa, jonka
  // kutsuja voisi tulkita mitatuksi.
  assert.equal(ikkuna['Vladimir Kogan'], undefined)
})
