import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  kuukausiTiedostonimesta, parseMyymalaTavoitteet, parseMyyjaTavoitteet, tavoiteYhteensa,
} from './rjmobTavoiteTaulukko.ts'
import { RJ_MOB_SELLERS } from './rjmob.ts'

/**
 * Fikstuurit ovat Albinin lohko sellaisenaan Driven oikeista tiedostoista
 * (`Elokuu_2026_Tavoitteet.xlsx`, `Syyskuu_2026_Tavoitteet.xlsx`, luettu
 * 30.8.2026). Rivinvaihdot otsikkosoluissa on korvattu välilyönnillä ja
 * sarakkeet erotettu putkella pelkän luettavuuden vuoksi.
 *
 * Kaksi asiaa joita fikstuureista ei saa siivota, koska ne ovat juuri ne
 * tapaukset joissa jäsennys menisi rikki:
 *
 * - **"Elokuun tapahtuma" seisoo heti "Elokuun tavoite" -sarakkeen edessä.**
 *   Osajonovertailu osuisi siihen ja lukisi tapahtumaosuuden koko tavoitteen
 *   paikalle.
 * - **Sama otsikko "Elokuun tavoite" esiintyy kolmesti**, kerran kunkin
 *   mittarin ryhmässä. Ilman ryhmärajausta kassakate lukisi liittymäluvun.
 */
const rivit = (fikstuuri: string[]) => fikstuuri.map(r => r.split('|'))

const ELOKUU = rivit([
  'Albin – myymäläkohtaiset tavoitteet',
  'Myymälä|LIITTYMÄT|||||F-SECURE||||KASSAKATE (ALV 0)',
  '|Heinäkuun tavoite|Heinäkuun ennuste|Normalisoitu heinäkuu|Elokuun tapahtuma|Elokuun tavoite|Heinäkuun tavoite|Heinäkuun ennuste|Normalisoitu heinäkuu|Elokuun tavoite|Heinäkuun tavoite|Heinäkuun toteuma 30.7.|Elokuun tavoite',
  'Lahti Holma|1000|1433|285.88888888888886|0|290|60|49|33.2962962962963|53|2880|2928.01|3000',
  'Lahti Syke|275|225.85714285714286|225.85714285714286|0|230|60|53.14285714285714|53.14285714285714|53|2500|2131.54|2200',
  'Helsinki Malmi|375|329.92857142857144|329.9285714285714|0|330|100|70.85714285714286|70.85714285714285|53|4500|3878.95|4000',
  'Helsinki Easton|275|182.67857142857144|182.67857142857144|0|190|60|36.535714285714285|36.535714285714285|53|2880|3321.69|3300',
  'Vantaa Kivistö|180|91.89285714285714|91.89285714285715|27.8.–29.8.|760|40|6.642857142857142|6.642857142857142|53|2880|3061.57|3000',
  'ALBIN YHTEENSÄ|2105||||1800|320|||265|15640|15321.76|15500',
])

const SYYSKUU = rivit([
  'Albin – myymäläkohtaiset tavoitteet',
  'Myymälä|LIITTYMÄT|||||F-SECURE||||KASSAKATE (ALV 0)',
  '|Elokuun tavoite|Elokuun ennuste|Normalisoitu elokuu|Syyskuun tapahtuma|Syyskuun tavoite|Elokuun tavoite|Elokuun ennuste|Normalisoitu elokuu|Syyskuun tavoite|Elokuun tavoite|Elokuun ennuste|Syyskuun tavoite',
  'Lahti Holma|290|333.3|333.3||300|53|45.7|45.7|53|3000|2544.38|3000',
  'Lahti Syke|230|179|179||230|53|34.6|34.6|40|2200|2430.84|2200',
  'Helsinki Malmi|330|323.5|323.5|600|900|53|39.5|39.5|80|4000|3527.7|4000',
  'Helsinki Easton|190|174.1|174.1||190|53|30.9|30.9|40|3300|3364.69|3300',
  'Vantaa Kivistö|760|#DIV/0!|#DIV/0!||180|53|#DIV/0!|#DIV/0!|40|3000|#DIV/0!|3000',
  'ALBIN YHTEENSÄ|1800|#DIV/0!|#DIV/0!||1800|265|#DIV/0!|#DIV/0!|253|15500|#DIV/0!|15500',
])

test('kuukausi luetaan tiedostonimestä', () => {
  assert.deepEqual(kuukausiTiedostonimesta('Elokuu_2026_Tavoitteet.xlsx'), { order: 202608, nimi: 'Elokuu' })
  assert.deepEqual(kuukausiTiedostonimesta('Syyskuu_2026_Tavoitteet.xlsx'), { order: 202609, nimi: 'Syyskuu' })
  assert.equal(kuukausiTiedostonimesta('Tavoitteet.xlsx'), null)
  assert.equal(kuukausiTiedostonimesta('Elokuu_Tavoitteet.xlsx'), null)
})

test('syyskuun myymälätavoitteet luetaan Albinin lohkosta', () => {
  const { rivit: r, varoitukset } = parseMyymalaTavoitteet(SYYSKUU, 'Syyskuu')
  assert.deepEqual(varoitukset, [])
  assert.deepEqual(r.map(x => [x.storeKey, x.liittymat, x.fsecure, x.kassakate]), [
    ['Lahti, Holma', 300, 53, 3000],
    ['Lahti, Syke', 230, 40, 2200],
    ['Helsinki, Malmi', 900, 80, 4000],
    ['Helsinki, Easton', 190, 40, 3300],
    ['Vantaa, Kivistö', 180, 40, 3000],
  ])
  assert.deepEqual(tavoiteYhteensa(r), { liittymat: 1800, fsecure: 253, kassakate: 15500 })
})

test('tapahtumasarake ei mene tavoitteen tilalle', () => {
  // Malmin syyskuun tavoite on 900, josta 600 on tapahtumaa. Osajonolla
  // etsitty "Syyskuun ..." osuisi tapahtumaan ja antaisi 600.
  const malmi = parseMyymalaTavoitteet(SYYSKUU, 'Syyskuu').rivit.find(r => r.myymala === 'Malmi')
  assert.equal(malmi?.liittymat, 900)
})

test('elokuun tavoitteet luetaan samasta rakenteesta eri sarakkeista', () => {
  const { rivit: r, varoitukset } = parseMyymalaTavoitteet(ELOKUU, 'Elokuu')
  assert.deepEqual(varoitukset, [])
  assert.deepEqual(r.map(x => x.liittymat), [290, 230, 330, 190, 760])
  assert.deepEqual(r.map(x => x.fsecure), [53, 53, 53, 53, 53])
  assert.deepEqual(tavoiteYhteensa(r), { liittymat: 1800, fsecure: 265, kassakate: 15500 })
})

test('#DIV/0! luetaan tyhjänä eikä nollana', () => {
  // Kivistön elokuun ennuste on kaavavirhe syyskuun tiedostossa; nollana se
  // näyttäisi mitatulta tulokselta. Tavoitesarake on silti luettavissa.
  const kivisto = parseMyymalaTavoitteet(SYYSKUU, 'Syyskuu').rivit.find(r => r.myymala === 'Kivistö')
  assert.equal(kivisto?.liittymat, 180)
})

test('väärä kuukausi ei tuota vääriä lukuja vaan varoituksen', () => {
  const { rivit: r, varoitukset } = parseMyymalaTavoitteet(SYYSKUU, 'Lokakuu')
  assert.equal(varoitukset.length, 3)
  assert.deepEqual(r.map(x => x.liittymat), [null, null, null, null, null])
})

test('puuttuva lohko on virhe eikä tyhjä tulos', () => {
  const { rivit: r, varoitukset } = parseMyymalaTavoitteet(SYYSKUU, 'Syyskuu', 'Magnus')
  assert.deepEqual(r, [])
  assert.match(varoitukset[0], /Magnus/)
})

test('myyjätavoitteet luetaan litteästä taulukosta', () => {
  // Oikea rakenne Drivestä ("Myyjäkohtaiset Tavoitteet 9. Syyskuu 2026",
  // luettu 30.8.2026). Kuukausi on tiedostossa eikä sarakeotsikossa, joten
  // tässä ei ole kuukausiparametria lainkaan.
  const myyjat = rivit([
    'Myyjä|Liittymätavoite|F-Secure Tavoite|Kassakate Tavoite',
    'Krenar Bajqinovci|150|15|800,00 €',
    'Hamza Hanif|260|40|1 500,00 €',
    'Kogan Vladimir|125|25|1 000,00 €',
    'Tuntematon Tyyppi|10|1|50,00 €',
    'Albin Rashica|-|-|-',
    'Yhteensä|2525|380|17 800,00 €',
  ])
  const { rivit: r, varoitukset } = parseMyyjaTavoitteet(myyjat, RJ_MOB_SELLERS)
  assert.deepEqual(r, [
    { nimi: 'Krenar Bajqinovci', liittymat: 150, fsecure: 15, kassakate: 800 },
    // Tuhaterotin on sitkeä välilyönti ja desimaalierotin pilkku.
    { nimi: 'Hamza Hanif', liittymat: 260, fsecure: 40, kassakate: 1500 },
    // Käänteinen nimijärjestys normalisoituu kanoniseksi kuten muuallakin.
    { nimi: 'Vladimir Kogan', liittymat: 125, fsecure: 25, kassakate: 1000 },
    // Viiva on "ei tavoitetta" eikä nolla: nolla olisi tavoite jonka
    // jokainen ylittää ja rivi värittyisi vihreäksi tyhjästä.
    { nimi: 'Albin Rashica', liittymat: null, fsecure: null, kassakate: null },
  ])
  assert.equal(varoitukset.length, 1)
  assert.match(varoitukset[0], /Tuntematon Tyyppi/)
})

test('yhteensä-rivi päättää myyjätaulukon eikä päädy myyjäksi', () => {
  const { rivit: r } = parseMyyjaTavoitteet(rivit([
    'Myyjä|Liittymätavoite|F-Secure Tavoite|Kassakate Tavoite',
    'Hamza Hanif|260|40|1 500,00 €',
    'Yhteensä|260|40|1 500,00 €',
  ]), RJ_MOB_SELLERS)
  assert.equal(r.length, 1)
})

test('otsikkorivin puuttuminen on virhe eikä tyhjä tulos', () => {
  const { rivit: r, varoitukset } = parseMyyjaTavoitteet(rivit(['Jotain muuta|1|2|3']), RJ_MOB_SELLERS)
  assert.deepEqual(r, [])
  assert.match(varoitukset[0], /otsikkoriviä/)
})
