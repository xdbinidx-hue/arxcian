import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avainKelpaa } from './jaettuAvain.ts'

test('oikea avain kelpaa', () => {
  assert.equal(avainKelpaa('salainen', 'salainen'), true)
})

test('väärä avain ei kelpaa, myöskään eri pituisena', () => {
  assert.equal(avainKelpaa('vaara', 'salainen'), false)
  assert.equal(avainKelpaa('salainen-mutta-pidempi', 'salainen'), false)
  assert.equal(avainKelpaa('s', 'salainen'), false)
})

test('puuttuva odotettu avain ei kelpaa millään annetulla', () => {
  // Ilman tätä konfiguroimaton ympäristö avaisi reitin tyhjällä otsakkeella.
  assert.equal(avainKelpaa('', undefined), false)
  assert.equal(avainKelpaa('mitä tahansa', undefined), false)
  assert.equal(avainKelpaa('', ''), false)
})

test('puuttuva annettu avain ei kelpaa', () => {
  assert.equal(avainKelpaa(null, 'salainen'), false)
  assert.equal(avainKelpaa(undefined, 'salainen'), false)
  assert.equal(avainKelpaa('', 'salainen'), false)
})
