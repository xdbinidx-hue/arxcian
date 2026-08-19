import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  laskeMyyja, tehoTaso, TEHO_HYVA, TEHO_LIITT_HYVA, TEHO_HEIKKO,
  type SellerRaw,
} from './rjmob.ts'

/**
 * Kolmen teholuvun säännöt. Teho on euroa provisiota per työtunti eli
 * myyjän tuntipalkan päälle tuleva osuus, ja johtamiskeskustelu käydään
 * siitä — siksi rajat ja järjestys on lukittu testillä eikä jätetty
 * silmämääräisen tarkistuksen varaan.
 */

const KUUKAUSI = 202608

function raaka(yli: Partial<SellerRaw> = {}): SellerRaw {
  return {
    nimi: 'Testi Myyja', liittEur: 900, liittKpl: 30,
    fsecKpl: 8, fsecTotalKpl: 8, fsecInternetKpl: 0, fsecEur: 120,
    kassa: 200, tunnit: 100, palkkaTunnit: 100, dnaUusmyyntiKpl: 0,
    ...yli,
  }
}

test('liittymäteholla on oma matalampi vihreän raja', () => {
  // 8,5–8,99 on juuri se väli jossa asteikot eroavat. Jos tämä hajoaa,
  // liittymäsarake on palannut yhteiselle 9 €/h rajalle ja näyttää
  // keltaista silloinkin kun liittymämyynti on tavoitteessa.
  assert.equal(tehoTaso(8.5, true), 'hyva')
  assert.equal(tehoTaso(8.5), 'rajalla')
  assert.equal(tehoTaso(8.99, true), 'hyva')
  assert.equal(tehoTaso(8.99), 'rajalla')

  // Heikon raja on sama molemmilla, eikä 9 muuta mitään liittymäpuolella.
  assert.equal(tehoTaso(7, true), 'rajalla')
  assert.equal(tehoTaso(7), 'rajalla')
  assert.equal(tehoTaso(6.99, true), 'heikko')
  assert.equal(tehoTaso(6.99), 'heikko')
  assert.equal(tehoTaso(9, true), 'hyva')
  assert.equal(tehoTaso(9), 'hyva')

  assert.equal(TEHO_HYVA, 9)
  assert.equal(TEHO_LIITT_HYVA, 8.5)
  assert.equal(TEHO_HEIKKO, 7)
})

test('kolme tehoa kasvavat kapeimmasta laajimpaan', () => {
  // liittymä ⊂ liittymä+kassa ⊂ +F-Secure. Jos järjestys kääntyy, jokin
  // luku on laskettu eri jakajalla tai eri asteikolla kuin muut.
  const r = laskeMyyja(raaka(), KUUKAUSI)
  assert.ok(r.tehoLiitt <= r.teho, 'liittymäteho ei saa ylittää liittymä+kassaa')
  assert.ok(r.teho <= r.tehoTotal, 'liittymä+kassa ei saa ylittää totalia')
  assert.ok(r.myyntiTehoLiitt <= r.myyntiTeho)
  assert.ok(r.myyntiTeho <= r.myyntiTehoTotal)
})

test('bonukset eivät ole missään kolmesta tehosta', () => {
  // DNA-uusmyyntibonus on portaittainen kertasuoritus jota ei ansaita
  // tunnissa, joten sen lisääminen ei saa liikuttaa yhtäkään teholukua.
  // 40 kpl ylittää 30 kpl:n portaan (dnaBonus), 12 ei ylittänyt mitään.
  const ilman = laskeMyyja(raaka({ dnaUusmyyntiKpl: 0 }), KUUKAUSI)
  const kanssa = laskeMyyja(raaka({ dnaUusmyyntiKpl: 40 }), KUUKAUSI)
  assert.ok(kanssa.dnaBonus > 0, 'testin oletus: bonus todella syntyy')
  assert.equal(kanssa.tehoLiitt, ilman.tehoLiitt)
  assert.equal(kanssa.teho, ilman.teho)
  assert.equal(kanssa.tehoTotal, ilman.tehoTotal)

  // Sama F-Secure-bonukselle (oma porrasrajansa, ei sama kuin leikkurin).
  const fsecIlman = laskeMyyja(raaka({ fsecKpl: 8, fsecTotalKpl: 8 }), KUUKAUSI)
  const fsecKanssa = laskeMyyja(raaka({ fsecKpl: 20, fsecTotalKpl: 20 }), KUUKAUSI)
  assert.ok(fsecKanssa.fsecBonus > 0, 'testin oletus: F-Secure-bonus todella syntyy')
  // Kappalemäärä kasvattaa F-Secure-provisiota, joten teho saa muuttua —
  // mutta vain provision verran, ei bonuksen. Tarkistetaan että ero on
  // täsmälleen provisiokasvu eikä sisällä bonuseuroja.
  const provEro = (fsecKanssa.fsecEur - fsecIlman.fsecEur) / raaka().tunnit
  assert.ok(Math.abs((fsecKanssa.tehoTotal - fsecIlman.tehoTotal) - provEro) < 0.01,
    'tehoTotalin muutos saa tulla vain F-Secure-provisiosta, ei bonuksesta')
})

test('F-Secure-leikkuri pienentää kaikkia kolmea tehoa', () => {
  // Leikkuri koskee sitä mitä myyjälle maksetaan, ja teho kertoo juuri sen.
  const taysi = laskeMyyja(raaka({ fsecKpl: 8, fsecTotalKpl: 8 }), KUUKAUSI)
  const leikattu = laskeMyyja(raaka({ fsecKpl: 3, fsecTotalKpl: 3, fsecEur: 120 }), KUUKAUSI)
  assert.equal(taysi.fsecLeikkuri, false)
  assert.equal(leikattu.fsecLeikkuri, true)
  assert.ok(leikattu.tehoLiitt < taysi.tehoLiitt)
  assert.ok(leikattu.teho < taysi.teho)
  assert.ok(leikattu.tehoTotal < taysi.tehoTotal)
})

test('Krenarilla on kaksi asteikkoa, muilla yksi', () => {
  // Tuottoseuranta mittaa mitä myyjälle maksetaan (Krenarin sopimus ×4),
  // myyntiseuranta vertaa myyntisuoritusta myyjien kesken (×1 kaikilla).
  const krenar = laskeMyyja(raaka({ nimi: 'Krenar Bajqinovci' }), KUUKAUSI)
  assert.ok(krenar.tehoLiitt > krenar.myyntiTehoLiitt * 3.9)
  assert.ok(krenar.tehoLiitt < krenar.myyntiTehoLiitt * 4.1)

  const muu = laskeMyyja(raaka(), KUUKAUSI)
  assert.equal(muu.tehoLiitt, muu.myyntiTehoLiitt)
  assert.equal(muu.teho, muu.myyntiTeho)
  assert.equal(muu.tehoTotal, muu.myyntiTehoTotal)
})

test('tehoStatus seuraa keskimmäistä lukua, ei liittymätehoa', () => {
  // tehoStatus värittää tuottoseurannan ja run raten. Se on kalibroitu
  // liittymä+kassalle; jos se alkaisi lukea tehoLiittiä, samat myyjät
  // putoaisivat punaiselle molemmilla sivuilla.
  const r = laskeMyyja(raaka(), KUUKAUSI)
  const odotettu = tehoTaso(r.teho) === 'hyva' ? 'green'
    : tehoTaso(r.teho) === 'rajalla' ? 'amber' : 'red'
  assert.equal(r.tehoStatus, odotettu)
})

test('nolla tuntia ei tuota äärettömiä tehoja', () => {
  const r = laskeMyyja(raaka({ tunnit: 0, palkkaTunnit: 0 }), KUUKAUSI)
  for (const n of [r.tehoLiitt, r.teho, r.tehoTotal, r.myyntiTehoLiitt, r.myyntiTeho, r.myyntiTehoTotal]) {
    assert.equal(n, 0)
  }
})
