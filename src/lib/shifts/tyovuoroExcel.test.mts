import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  jasennaTyovuorotaulukko, soloMyymalat, onPoissaolo, sarakeIndeksi,
  MYYJA_SARAKKEET, TAPAHTUMAT_SARAKE, TOIVEET_SARAKE, ENSIMMAINEN_PAIVARIVI,
  viimeinenPaivarivi,
} from './tyovuoroExcel.ts'
import { ROSTER_COLUMNS } from '../shiftSchedule.ts'

test('sarakekirjaimet kääntyvät indekseiksi', () => {
  assert.equal(sarakeIndeksi('A'), 0)
  assert.equal(sarakeIndeksi('B'), 1)
  assert.equal(sarakeIndeksi('Z'), 25)
  assert.equal(sarakeIndeksi('AA'), 26)
  assert.equal(sarakeIndeksi('AR'), 43)
  assert.equal(sarakeIndeksi('AU'), 46)
})

test('myyjäsarakkeet vastaavat toimeksiannon karttaa', () => {
  const kartta = Object.fromEntries(MYYJA_SARAKKEET.map(s => [s.seller.split(' ')[0], s.vuoro]))
  assert.equal(kartta.Albin, sarakeIndeksi('B'))
  assert.equal(kartta.Arbnor, sarakeIndeksi('E'))
  assert.equal(kartta.Alec, sarakeIndeksi('H'))
  assert.equal(kartta.Joona, sarakeIndeksi('K'))
  assert.equal(kartta.Krenar, sarakeIndeksi('N'))
  assert.equal(kartta.Kasperi, sarakeIndeksi('Q'))
  assert.equal(kartta.Vladimir, sarakeIndeksi('T'))
  assert.equal(kartta.Hamza, sarakeIndeksi('W'))
  assert.equal(kartta.Lauri, sarakeIndeksi('Z'))
  assert.equal(kartta.Antti, sarakeIndeksi('AC'))
  assert.equal(kartta.Ramin, sarakeIndeksi('AF'))
  // Kolme saraketta per myyjä, peräkkäin.
  for (const s of MYYJA_SARAKKEET) {
    assert.equal(s.tunnit, s.vuoro + 1)
    assert.equal(s.myymala, s.vuoro + 2)
  }
})

test('lukijan myyjälista pysyy synkassa rosterin kanssa', () => {
  // Nimet on kirjoitettu lukijaan käsin (ajonaikaista importtia ei voi
  // käyttää), joten tämä testi on ainoa este sille että ne erkanevat.
  assert.deepEqual([...MYYJA_SARAKKEET.map(s => s.seller)].sort(), [...ROSTER_COLUMNS].sort())
})

test('oman myymälän tapahtuma ja onnenpäivä tunnistuvat', () => {
  assert.deepEqual(soloMyymalat('Malmi Tapahtuma'), ['Malmi'])
  assert.deepEqual(soloMyymalat('Easton, Kivistö OP'), ['Easton', 'Kivistö'])
  assert.deepEqual(soloMyymalat('Easton OP / Kivistö OP'), ['Easton', 'Kivistö'])
  assert.deepEqual(soloMyymalat('Kivisto OP'), ['Kivistö'], 'ä:tön kirjoitusasu kelpaa')
})

test('muiden myymälöiden tapahtumat eivät ole soolopäiviä', () => {
  assert.deepEqual(soloMyymalat('Iisalmi Tapahtuma'), [], 'Iisalmi ei ole Malmi')
  assert.deepEqual(soloMyymalat('Holma OP'), [])
  assert.deepEqual(soloMyymalat('Syke Tapahtuma'), [])
  assert.deepEqual(soloMyymalat('Nokia Tapahtuma'), [])
  assert.deepEqual(soloMyymalat(''), [])
})

test('pelkkä myymälän nimi ilman OP:ta tai tapahtumaa ei riitä', () => {
  assert.deepEqual(soloMyymalat('Malmi remontti'), [])
})

test('poissaolo erottuu kellonajasta', () => {
  // Nämä sanat lukevat työvuorosivun kentän ohjetekstissä, ja sama funktio
  // ratkaisee siellä onko syöte vuoro vai poissaolo. Jos jokin niistä lakkaa
  // kelpaamasta, käyttöliittymä lupaa jotain jota lukija ei ymmärrä.
  assert.equal(onPoissaolo('Nizza'), true)
  assert.equal(onPoissaolo('loma'), true)
  assert.equal(onPoissaolo('vapaa'), true)
  assert.equal(onPoissaolo('saikku'), true)
  assert.equal(onPoissaolo('10-16'), false)
  assert.equal(onPoissaolo('10.00-16.00'), false)
  assert.equal(onPoissaolo('10:00 – 19:00'), false)
  assert.equal(onPoissaolo(''), false)
  assert.equal(onPoissaolo('  '), false)
  assert.equal(onPoissaolo('7'), false, 'irrallinen numero on näppäilyvirhe, ei loma')
})

/** Rakentaa ruudukon jossa on vain halutut solut täytettyinä. */
function ruudukko(solut: { rivi: number; sarake: number; arvo: string }[]): string[][] {
  const out: string[][] = []
  for (const { rivi, sarake, arvo } of solut) {
    while (out.length < rivi) out.push([])
    const r = out[rivi - 1]
    while (r.length <= sarake) r.push('')
    r[sarake] = arvo
  }
  return out
}

test('jäsennys poimii tapahtumat, soolot ja poissaolot oikeilta riveiltä', () => {
  const arbnor = MYYJA_SARAKKEET.find(s => s.seller === 'Arbnor Rashica')!
  const hamza = MYYJA_SARAKKEET.find(s => s.seller === 'Hamza Hanif')!
  const rivit = ruudukko([
    // Päivä 6 → rivi 9
    { rivi: ENSIMMAINEN_PAIVARIVI + 5, sarake: TAPAHTUMAT_SARAKE, arvo: 'Easton, Kivistö OP' },
    { rivi: ENSIMMAINEN_PAIVARIVI + 5, sarake: arbnor.vuoro, arvo: 'Nizza' },
    { rivi: ENSIMMAINEN_PAIVARIVI + 5, sarake: hamza.vuoro, arvo: '10-16' },
    // Päivä 20 → rivi 23
    { rivi: ENSIMMAINEN_PAIVARIVI + 19, sarake: TAPAHTUMAT_SARAKE, arvo: 'Iisalmi Tapahtuma' },
  ])

  const syote = jasennaTyovuorotaulukko(rivit, 2026, 9)
  assert.equal(syote.paivat.length, 30)

  const kuudes = syote.paivat[5]
  assert.equal(kuudes.date, '2026-09-06')
  assert.deepEqual(kuudes.soloMyymalat, ['Easton', 'Kivistö'])
  assert.deepEqual(kuudes.poissaolot, [{ seller: 'Arbnor Rashica', label: 'Nizza' }])

  const kahdeskymmenes = syote.paivat[19]
  assert.deepEqual(kahdeskymmenes.tapahtumat, ['Iisalmi Tapahtuma'])
  assert.deepEqual(kahdeskymmenes.soloMyymalat, [], 'Iisalmi ei miehitä omaa myymälää')
  assert.deepEqual(kahdeskymmenes.poissaolot, [])
})

test('Toiveet-saraketta ei lueta', () => {
  // AU sisältää legendatekstiä jossa esiintyy myymälöiden nimiä ja "OP".
  // Jos se vuotaisi lukuun, tästä syntyisi valheellinen onnenpäivä.
  const rivit = ruudukko([
    { rivi: ENSIMMAINEN_PAIVARIVI, sarake: TOIVEET_SARAKE, arvo: 'Malmi OP = onnenpäivä, Easton OP' },
  ])
  const syote = jasennaTyovuorotaulukko(rivit, 2026, 9)
  assert.deepEqual(syote.paivat[0].soloMyymalat, [])
  assert.deepEqual(syote.paivat[0].tapahtumat, [])
})

test('31 päivän kuukausi ulottuu riville 34, ei pidemmälle', () => {
  // Syyskuussa (30 pv) viimeinen päivärivi on 33, elokuussa (31 pv) 34.
  // Rivi 35 on tuntisummakaavat — sinne ei mennä kummassakaan.
  assert.equal(viimeinenPaivarivi(2026, 9), 33)
  assert.equal(viimeinenPaivarivi(2026, 8), 34)
  assert.equal(jasennaTyovuorotaulukko([], 2026, 8).paivat.length, 31)
})

test('rivin 35 kaavat ja Huoltolista eivät vuoda lukuun', () => {
  const rivit = ruudukko([
    { rivi: 35, sarake: TAPAHTUMAT_SARAKE, arvo: 'Malmi OP' },
    { rivi: 40, sarake: TAPAHTUMAT_SARAKE, arvo: 'Easton Tapahtuma' },
  ])
  const syote = jasennaTyovuorotaulukko(rivit, 2026, 8)
  assert.equal(syote.paivat.length, 31)
  assert.ok(syote.paivat.every(p => p.soloMyymalat.length === 0))
  assert.ok(syote.paivat.every(p => p.tapahtumat.length === 0))
})

test('puuttuvat rivit eivät kaada jäsennystä', () => {
  const syote = jasennaTyovuorotaulukko([], 2026, 9)
  assert.equal(syote.paivat.length, 30)
  assert.ok(syote.paivat.every(p => p.tapahtumat.length === 0 && p.poissaolot.length === 0))
})
