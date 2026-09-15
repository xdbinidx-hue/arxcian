import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRjMobSelection, rjMobComparisons, rjMobViewData, viewFingerprint } from './rjmobView.ts'
import type { RunRateData } from '../rjmobRunRate.ts'
import type { TargetRow } from '../rjmobTargets.ts'

for (const month of [202609, 202610, 202612, 202701]) {
  test(`Oracle ja näkymä: ${month}, myyjäprovisio x10, tavoite ilman myyntiä, nolla`, () => {
    const runrate = { kuukausiOrder: month, tyopaivat: { paattyneet: 5, kaikki: 20 }, tavoitteet: { myymalat: [], myyjat: [{ nimi: 'A', liittymat: 100, fsecure: 10, kassakate: 1000 }, { nimi: 'B', liittymat: 100, fsecure: null, kassakate: null }], yhteensa: { liittymat: 100, fsecure: 10, kassakate: 1000 } }, myyjaVuorot: { A: { paattyneet: 5, kaikki: 10 } } } as unknown as RunRateData
    const data = rjMobComparisons({ sellers: [{ nimi: 'A', tyyppi: 'normal', liittKpl: 0, fsecKpl: 2, kassa: 30 }, { nimi: 'Ständi', tyyppi: 'standi', liittKpl: 999, fsecKpl: 999, kassa: 999 }], stores: {} }, runrate, [{ nimi: 'A', kassaKate: 300 } as TargetRow])
    assert.equal(data.sellers.length, 2)
    assert.equal(data.sellers[0].liittymat.toteuma, 0)
    assert.equal(data.sellers[0].kassakate.toteuma, 300)
    assert.equal(data.sellers[0].kassakate.ennuste, 600)
    assert.equal(data.sellers[0].kassakate.pct, 60)
    assert.equal(data.sellers[1].liittymat.toteuma, null)
    assert.equal(data.sellerTotal?.liittymat.toteuma, null)
    assert.equal(data.storeTotal?.kassakate.toteuma, null)
    assert.equal(data.sellers[1].kassakate.tavoite, null)
    assert.deepEqual(data.cash({ nimi: 'A', kassaKate: 300 } as TargetRow), data.sellers[0].kassakate)
    assert.equal(data.cash({ nimi: 'A', kassaKate: null } as TargetRow).toteuma, null)
    assert.equal(rjMobViewData('kassamyynti', data, null).sellers, null)
  })
}
test('puuttuva yhteissumma erotetaan nollasta myös tyhjälle listalle', () => {
  assert.equal(rjMobComparisons({ sellers: [], stores: {} }, null, []).cashTotal.toteuma, null)
  const data = rjMobComparisons({ sellers: [], stores: {} }, null, [{ nimi: 'A', kassaKate: 0 } as TargetRow])
  assert.equal(data.cashTotal.toteuma, 0)
  assert.equal(data.cashTotal.pct, null)
  assert.equal(rjMobViewData('uusmyynti', data, []).total?.yhteensa, null)
})
test('näkymän rajaus ja muuttuneet luvut', () => {
  const selection = { route: '/arxcian/rj-mob/etela', fileId: 'september_2026', view: 'tavoitteet' }
  assert.deepEqual(parseRjMobSelection(selection), selection)
  for (const bad of [{ ...selection, route: '/arxcian/personal' }, { ...selection, view: 'kaikki' }, { ...selection, fileId: '../secret' }]) assert.throws(() => parseRjMobSelection(bad))
  assert.equal(viewFingerprint([{ nimi: 'A', value: 0 }, { nimi: 'B', value: null }]), viewFingerprint([{ value: null, nimi: 'B' }, { value: 0, nimi: 'A' }]))
  assert.notEqual(viewFingerprint({ value: 0 }), viewFingerprint({ value: null }))
})

test('myyjien näyttöjärjestys ei muuta desimaalisumman Oracle-tarkistetta', () => {
  const sellers = [0.1, 0.2, 0.3].map((kassa, i) => ({ nimi: String(i), tyyppi: 'normal', liittKpl: 1, fsecKpl: 1, kassa: kassa / 10 }))
  const runrate = { tyopaivat: { paattyneet: 5, kaikki: 20 }, tavoitteet: { myymalat: [], myyjat: sellers.map(s => ({ nimi: s.nimi, liittymat: 10, fsecure: 10, kassakate: 10 })), yhteensa: { liittymat: 30, fsecure: 30, kassakate: 30 } }, myyjaVuorot: {} } as unknown as RunRateData
  const calculate = (rows: typeof sellers) => rjMobViewData('tavoitteet', rjMobComparisons({ sellers: rows, stores: {} }, runrate, []), [])
  assert.equal(viewFingerprint(calculate(sellers)), viewFingerprint(calculate([...sellers].reverse())))
  assert.deepEqual(calculate(sellers).sellerTotal, calculate([...sellers].reverse()).sellerTotal)
})
