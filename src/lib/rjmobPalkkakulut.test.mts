import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jaaPalkkakulut, type MyyjanKulu } from './rjmobPalkkakulut.ts'

/**
 * Palkkakulun kohdistus myymälöille. Kohdistus tehdään tunneista, joten
 * jakosuhteet ovat se mikä menee helposti väärin — ja väärin kohdistettu
 * kulu tekee kannattavasta myymälästä tappiollisen paperilla.
 */

function myyja(yli: Partial<MyyjanKulu> = {}): MyyjanKulu {
  return { nimi: 'Testi Myyja', pohjapalkka: 1300, provisiot: 700, tyokulu: 2700, ...yli }
}

test('kulu jakautuu tehtyjen tuntien suhteessa', () => {
  const tulos = jaaPalkkakulut(
    [myyja({ nimi: 'Steven Sainio' })],
    { 'Helsinki, Malmi': { 'Steven Sainio': 75 }, 'Helsinki, Easton': { 'Steven Sainio': 25 } },
  )
  const malmi = tulos.myymalat.find(m => m.myymala === 'Malmi')!
  const easton = tulos.myymalat.find(m => m.myymala === 'Easton')!
  assert.equal(malmi.palkkakulu, 2025)
  assert.equal(easton.palkkakulu, 675)
  assert.equal(malmi.tunnit, 75)
  assert.equal(malmi.pohjapalkka, 975)
})

test('alue ei ohjaa kohdistusta — kolmessa myymälässä työskennellyt jakautuu kolmeen', () => {
  const tulos = jaaPalkkakulut(
    [myyja({ nimi: 'Vladimir Kogan', tyokulu: 900 })],
    {
      'Helsinki, Malmi': { 'Vladimir Kogan': 10 },
      'Helsinki, Easton': { 'Vladimir Kogan': 10 },
      'Vantaa, Kivistö': { 'Vladimir Kogan': 10 },
    },
  )
  for (const nimi of ['Malmi', 'Easton', 'Kivistö'] as const) {
    assert.equal(tulos.myymalat.find(m => m.myymala === nimi)!.palkkakulu, 300)
  }
})

test('sama myymälä eri kirjoitusasussa ei jakaudu kahtia', () => {
  const tulos = jaaPalkkakulut(
    [myyja({ tyokulu: 1000 })],
    { 'Helsinki, Malmi': { 'Testi Myyja': 50 }, 'K-Citymarket Malmi': { 'Testi Myyja': 50 } },
  )
  assert.equal(tulos.myymalat.find(m => m.myymala === 'Malmi')!.palkkakulu, 1000)
  assert.equal(tulos.myymalat.find(m => m.myymala === 'Easton')!.palkkakulu, 0)
})

test('tunniton mutta kuluinen myyjä näkyy kohdistamattomana eikä jakaudu tasan', () => {
  // Tasajako olisi arvaus, ja arvattu kulu näyttäisi mitatulta.
  const tulos = jaaPalkkakulut([myyja({ nimi: 'Krenar Bajqinovci', tyokulu: 1500 })], {
    'Helsinki, Malmi': { 'Steven Sainio': 100 },
  })
  assert.deepEqual(tulos.kohdistamaton, [{ nimi: 'Krenar Bajqinovci', tyokulu: 1500 }])
  assert.equal(tulos.myymalat.every(m => m.palkkakulu === 0), true)
  assert.equal(tulos.yhteensa, 1500)
})

test('omistajan nollakulu ei päädy kohdistamattomiin', () => {
  const tulos = jaaPalkkakulut(
    [myyja({ nimi: 'Arbnor Rashica', pohjapalkka: 0, provisiot: 0, tyokulu: 0 })],
    {},
  )
  assert.deepEqual(tulos.kohdistamaton, [])
})

test('päällikköbonus tulee myymälän kuluun sivukuluineen', () => {
  const tulos = jaaPalkkakulut(
    [myyja({ tyokulu: 1000 })],
    { 'Helsinki, Easton': { 'Testi Myyja': 100 } },
    { Easton: 325 },
  )
  const easton = tulos.myymalat.find(m => m.myymala === 'Easton')!
  assert.equal(easton.bonus, 325)
  assert.equal(easton.bonusKulu, 438.75)
  assert.equal(easton.yhteensa, 1438.75)
})

test('bonukseton myymälä ei saa bonuskulua', () => {
  const tulos = jaaPalkkakulut([myyja({ tyokulu: 1000 })], { 'Helsinki, Malmi': { 'Testi Myyja': 100 } }, { Easton: 325 })
  assert.equal(tulos.myymalat.find(m => m.myymala === 'Malmi')!.bonusKulu, 0)
})

test('yhteensä sisältää sekä kohdistetun että kohdistamattoman', () => {
  const tulos = jaaPalkkakulut(
    [myyja({ nimi: 'A', tyokulu: 1000 }), myyja({ nimi: 'B', tyokulu: 500 })],
    { 'Helsinki, Malmi': { A: 100 } },
    { Malmi: 100 },
  )
  assert.equal(tulos.yhteensa, 1000 + 135 + 500)
})
