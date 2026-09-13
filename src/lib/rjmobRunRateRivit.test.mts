import { test } from 'node:test'
import assert from 'node:assert/strict'
import { myyjaTavoiteRivit } from './rjmobRunRateRivit.ts'

test('tallennettu tavoite näkyy ilman myyntiriviä, toteumaa keksimättä', () => {
  const rows = myyjaTavoiteRivit([], { 'Joni Viljamaa': { liittymat: 150, fsecure: 25, kassakate: 1200 } }, {})
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0].liittymat, { tavoite: 150, toteuma: null, ennuste: null, pct: null })
  assert.equal(rows[0].kassakate.tavoite, 1200)
})

test('toteuma yhdistetään myyjään ja tavoitteen puute pysyy nullina', () => {
  const rows = myyjaTavoiteRivit([
    { nimi: 'Joni Viljamaa', liittymat: 20, fsecure: 3, kassakate: 100 },
    { nimi: 'Steven Sainio', liittymat: 10, fsecure: 0, kassakate: 0 },
  ], { 'Joni Viljamaa': { liittymat: 150, fsecure: 25, kassakate: 1200 } }, {})
  assert.equal(rows.length, 2)
  assert.equal(rows[0].liittymat.tavoite, 150)
  assert.equal(rows[0].liittymat.toteuma, 20)
  assert.equal(rows[1].liittymat.tavoite, null)
})
