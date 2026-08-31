import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mittari, nimiAvaimet, myymalaPerMyyja } from './yhteenvetoRivit.ts'

test('osuus on desimaali eikä prosenttiluku', () => {
  // PDF:n tekijä muotoilee; API ei saa lähettää valmista prosenttitekstiä
  // eikä 0-100-lukua johon lisätään myöhemmin toinen jako.
  const m = mittari({ tavoite: 1800, toteuma: 969, ennuste: 1008, pct: 56 })
  assert.equal(m.osuus, 0.56)
  assert.equal(m.tavoite, 1800)
  assert.equal(m.toteuma, 969)
  assert.equal(m.ennuste, 1008)
})

test('puuttuva ennuste ja osuus pysyvät nollina eikä nollana', () => {
  // Nolla päättynyttä työpäivää tarkoittaa ettei ennustetta ole olemassa.
  // Nolla näyttäisi mitatulta tulokselta ja värittyisi punaiseksi.
  const m = mittari({ tavoite: null, toteuma: 12, ennuste: null, pct: null })
  assert.equal(m.ennuste, null)
  assert.equal(m.osuus, null)
  assert.equal(m.toteuma, 12)
})

test('nimi tunnistetaan molemmissa kirjoitusjärjestyksissä', () => {
  assert.deepEqual(nimiAvaimet('Alec Fambro'), ['alec fambro', 'fambro alec'])
  assert.deepEqual(nimiAvaimet('Fambro Alec'), ['fambro alec', 'alec fambro'])
  assert.deepEqual(nimiAvaimet('Kasper'), ['kasper'])
})

test('myyjä kohdistuu myymälään jossa on eniten tunteja', () => {
  const kartta = myymalaPerMyyja({
    'Malmi': { 'Alec Fambro': 40 },
    'Lahti, Holma': { 'Alec Fambro': 90, 'Steven Sainio': 30 },
  })
  assert.equal(kartta['alec fambro'], 'Lahti, Holma')
  assert.equal(kartta['steven sainio'], 'Lahti, Holma')
})

test('käänteinen nimijärjestys myymäläerittelyssä löytyy silti', () => {
  // Myymäläerittely voi kirjoittaa "Sukunimi Etunimi" vaikka myyjätaulukko
  // kirjoittaa toisin päin — ilman kumpaakin avainta kohdistus katoaisi.
  const kartta = myymalaPerMyyja({ 'Kivistö': { 'Fambro Alec': 50 } })
  assert.equal(kartta['alec fambro'], 'Kivistö')
  assert.equal(kartta['fambro alec'], 'Kivistö')
})

test('tyhjä tuntierittely ei keksi kohdistusta', () => {
  assert.deepEqual(myymalaPerMyyja({}), {})
})
