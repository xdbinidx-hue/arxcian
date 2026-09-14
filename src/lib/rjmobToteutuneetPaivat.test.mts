import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toteutuneetPaivat, toteumaIkkunat, yhdistaVuorot } from './rjmobToteutuneetPaivat.ts'
import { myyjaRivit } from './rjmobRunRateRivit.ts'
import { jasennaLahtiVuorot } from './shifts/lahtiVuorot.ts'
import { myyjaSarakkeet } from './shifts/tyovuoroExcel.ts'

test('tehdyt päivät korvaavat menneen suunnitelman, tulevat lisätään erikseen', () => {
  const paivat = toteutuneetPaivat([['Nimi', 'Toteutuneet työpäivät(pv)'], ['Rashica Arbnor', '6'], ['Sainio Steven', ''], ['Kiljala Antti', '0']])
  assert.deepEqual(paivat, {'Arbnor Rashica': 6, 'Antti Kiljala': 0})
  const vuorot = Array.from({length:20}, (_, i) => ({seller:'Arbnor Rashica',date:`2026-09-${String(i+1).padStart(2,'0')}`,paikka:'m',tunnit:7}))
  const ikkuna = toteumaIkkunat(vuorot, paivat, '2026-09-10')
  assert.deepEqual(ikkuna['Arbnor Rashica'], {paattyneet:6,kaikki:16})
  const [rivi] = myyjaRivit([{nimi:'Arbnor Rashica',liittymat:59,fsecure:6,kassakate:300}],{},ikkuna,{'Arbnor Rashica':{toteuma:48,paattyneet:3,kaikki:3,selite:''}})
  assert.equal(Math.round(rivi.liittymat.ennuste!),96)
  assert.equal(rivi.fsecure.ennuste,16)
})

test('kaksi välilehteä täydentävät myyjää mutta sama päivä ei tuplaannu', () => {
  const v = (date:string) => ({seller:'Albin Rashica',date,paikka:'m',tunnit:7})
  const tulos = yhdistaVuorot([v('2026-09-01'),v('2026-09-02')],[{...v('2026-09-02'),paikka:'h'},v('2026-09-03')])
  assert.equal(tulos.length,3)
  assert.equal(tulos[1].paikka,'h')
  assert.deepEqual(toteumaIkkunat(tulos,{},'2026-09-01'),{})
})

test('PK-taulukon muutokset ja sairauspoissaolot luetaan suoraan soluista', () => {
  const rivit = [[],[],[],['','10-17','7','m'],['','saikku','7','m']]
  assert.equal(jasennaLahtiVuorot(rivit,2026,9,myyjaSarakkeet(2026,9)).length,1)
  rivit[3][1]='vapaa'
  assert.equal(jasennaLahtiVuorot(rivit,2026,9,myyjaSarakkeet(2026,9)).length,0)
})
