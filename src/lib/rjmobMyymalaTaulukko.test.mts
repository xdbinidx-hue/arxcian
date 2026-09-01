import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  KASSAKATE_KERROIN, UUSI_LUKULAHDE_ALKAEN, etsiOtsikkorivi, lueSarakkeet,
  myymalaAvain, summaaMyymalat, summaaMyyjat,
} from './rjmobMyymalaTaulukko.ts'
import { isRJMobSeller } from './rjmob.ts'

/**
 * "Myyjät Myymälöittäin" -välilehden jäsennys.
 *
 * Rivit ovat **elokuun 2026 oikeasta työkirjasta** (`Myyntiseuranta 8. Elokuu
 * 2026`, luettu palvelutilillä 1.9.2026), vain kavennettuna: Malmin ja Syken
 * lohkot kokonaan, näyte tapahtumapaikasta (Ylöjärvi) ja yksi vieras myymälä.
 * Luvut ovat siis todettuja eivätkä keksittyjä — juuri siksi kassakatteen
 * asteikon voi kiinnittää tähän.
 */

const OTSIKKO = [
  'Kustannuspaikka', 'Myyjä', 'DNA TV ja kanavapalvelut', 'DNA päivitykset', 'DNA uusmyynti',
  'ELISA  Pakettiliittymät', 'ELISAN päivitykset', 'F-Secure Internet Security', 'F-Secure Total',
  'TELIA TV- ja kanavapalvelut', 'TELIA Yritysliittymä päivitykset', 'TELIA Yritysliittymä uusmyynti',
  'TELIA päivitykset', 'TELIA uusmyynti', 'Kassaprovisio', 'Liittymäprovisio', 'Kassakate',
  'Liittymä kpl', 'F-Secure kpl', 'Provikka', 'Tunnit', 'Teho €/h',
]

/** `[kustannuspaikka, myyjä, fsecInternet, fsecTotal, kassakate, liittEur, liittKpl, tunnit, dnaUusmyynti]` */
function rivi(
  kusta: string, myyja: string,
  fsecInternet: string, fsecTotal: string, kassakate: string,
  liittEur: string, liittKpl: string, tunnit: string, dna = '',
): string[] {
  const r = new Array(OTSIKKO.length).fill('')
  r[0] = kusta
  r[1] = myyja
  r[4] = dna
  r[7] = fsecInternet
  r[8] = fsecTotal
  r[14] = ''
  r[15] = liittEur
  r[16] = kassakate
  r[17] = liittKpl
  r[20] = tunnit
  return r
}

const RIVIT: string[][] = [
  OTSIKKO,
  // Myymälän oma yhteenvetorivi: kustannuspaikka ilman myyjää. Uusi lukutapa
  // ohittaa sen ja summaa myyjärivit — luvun on tultava samaksi.
  rivi('Helsinki, K-Citymarket Malmi', '', '7', '31', '303.00', '2915.50', '314', '421.27'),
  rivi('', 'Vladimir Kogan', '', '5', '28.93', '732.50', '83', '59.00', '33'),
  rivi('', 'Hamza Hanif', '4', '9', '34.43', '466.50', '47', '35.73', '23'),
  rivi('', 'Arbnor Rashica', '', '3', '61.68', '439.50', '47', '66.00', '26'),
  rivi('', 'Kasperi Kemppainen', '1', '5', '31.49', '207.50', '29', '41.25', '11'),
  rivi('', 'Krenar Bajqinovci', '', '1', '34.97', '340.50', '34', '61.40', '20'),
  rivi('', 'Lauri Ukkonen', '', '2', '54.23', '248.00', '27', '57.63', '10'),
  rivi('', 'Ramin Kadiri', '2', '1', '20.90', '218.00', '18', '42.92', '8'),
  // Alec Fambron kassakate on lähteessä päivämuotoiltu solu: muotoiltuna
  // "16.12", raakana päivän sarjanumero. Jäsennin lukee muotoillun arvon.
  rivi('', 'Alec Fambro', '', '2', '16.12', '117.00', '12', '29.17', '5'),
  rivi('', 'Joona Huttunen', '', '2', '12.17', '92.00', '11', '21.00', '7'),
  rivi('', 'Antti Kiljala', '', '1', '6.88', '33.00', '4', '7.17', ''),
  rivi('', 'Albin Rashica', '', '', '1.20', '11.00', '1', '0', '1'),
  rivi('', 'Atte Kröger', '', '', '0.00', '10.00', '1', '0', ''),
  // Syke: mukana kaksi ständimyyjää, jotka kuuluvat pois myymälän tuloksesta.
  rivi('Lahti, Prisma Syke', '', '17', '16', '240.42', '2466.00', '280', '373.33'),
  rivi('', 'Kanerva Jussi', '', '', '0.00', '458.00', '55', '0'),
  rivi('', 'Steven Sainio', '1', '', '19.47', '469.50', '51', '68.17', '7'),
  rivi('', 'Atte Kröger', '4', '1', '56.31', '359.00', '42', '89.00', '12'),
  rivi('', 'Daniel Miettinen', '1', '9', '25.43', '273.50', '29', '69.65', '10'),
  rivi('', 'Leo Rossi', '6', '2', '49.83', '167.50', '22', '48.98', '6'),
  rivi('', 'Joni Viljamaa', '4', '', '26.59', '258.50', '25', '39.00', '14'),
  rivi('', 'Peltola Esa', '', '', '0.00', '188.50', '19', '0'),
  rivi('', 'Jami Tonteri', '', '2', '34.22', '136.00', '16', '37.25', '4'),
  rivi('', 'Hamza Hanif', '1', '2', '18.34', '82.00', '11', '7.00', '3'),
  rivi('', 'Joona Huttunen', '', '', '10.23', '73.50', '10', '14.28', '6'),
  // Tapahtumapaikka: RJ-Mobin omia myyjiä, ei RJ-Mobin myymälä.
  rivi('Ylöjärvi, Prisma Ylöjärvi', '', '20', '46', '446.06', '5493.00', '562', '587.13'),
  rivi('', 'Hamza Hanif', '4', '7', '25.34', '755.00', '69', '31.00', '36'),
  rivi('', 'Vladimir Kogan', '', '3', '14.52', '277.50', '29', '29.00', '10'),
  // Vieras myyjä RJ-Mobin myymälässä ei ole "ulkopuolinen": myymälän tulos on
  // myymälän tulos. Sijoitettu Holmaan, jossa niitä oikeastikin on.
  rivi('Lahti, Prisma Holma', '', '', '', '0.00', '0.00', '0', '0'),
  rivi('', 'Hero Ikko', '', '', '0.00', '175.00', '20', '0'),
  rivi('', 'Leo Rossi', '2', '6', '55.13', '656.00', '69', '62.82', '27'),
]

const HEADER_IDX = etsiOtsikkorivi(RIVIT)
const { sarakkeet, puutteet } = lueSarakkeet(RIVIT[HEADER_IDX])
const kuuluuMyyjiin = (nimi: string) => isRJMobSeller(nimi)

test('otsikkorivi ja sarakkeet löytyvät nimellä, ei kiinteällä indeksillä', () => {
  assert.equal(HEADER_IDX, 0)
  assert.deepEqual(puutteet, [])
  // Kassakate, ei Kassaprovisio: samalla välilehdellä on molemmat, ja
  // osajonohaku "kassa" osuisi väärään.
  assert.equal(OTSIKKO[sarakkeet.kassakate], 'Kassakate')
  assert.equal(OTSIKKO[sarakkeet.liittKpl], 'Liittymä kpl')
  assert.equal(OTSIKKO[sarakkeet.liittEur], 'Liittymäprovisio')
  assert.equal(OTSIKKO[sarakkeet.tunnit], 'Tunnit')
  // "TELIA uusmyynti" ei saa osua DNA-sarakkeeseen.
  assert.equal(OTSIKKO[sarakkeet.dnaUusmyynti], 'DNA uusmyynti')
})

test('puuttuva pakollinen sarake tuottaa puutteen, ei nollaa', () => {
  const ilmanKassakatetta = OTSIKKO.map(h => (h === 'Kassakate' ? 'Jokin muu' : h))
  const { sarakkeet: s, puutteet: p } = lueSarakkeet(ilmanKassakatetta)
  assert.equal(s.kassakate, -1)
  assert.equal(p.length, 1)
  assert.match(p[0], /Kassakate/)
})

test('kassakate näytetään ×10 eli lähteen sarake myyjän asteikolta euroiksi', () => {
  const { myymalat } = summaaMyymalat(RIVIT, HEADER_IDX, sarakkeet, kuuluuMyyjiin)

  // Elokuu 2026, käsin täsmätty: Malmin myyjärivien Kassakate-summa on
  // taulukossa 303,00 ja saman työkirjan tavoite 4 000,00 €. Näytettävä luku
  // on 3 030,00 € — ei 303,00 € eikä 30 300,00 €.
  assert.equal(myymalat['Helsinki, Malmi'].kassaRjmob.toFixed(2), '303.00')
  assert.equal(myymalat['Helsinki, Malmi'].kassa.toFixed(2), '3030.00')
  assert.equal(KASSAKATE_KERROIN, 10)
})

test('myymälän luku on myyjärivien summa ja täsmää välilehden omaan yhteenvetoriviin', () => {
  const { myymalat } = summaaMyymalat(RIVIT, HEADER_IDX, sarakkeet, kuuluuMyyjiin)

  // Malmin yhteenvetorivi: 314 kpl, 2 915,50 €, 421,27 h, 38 F-Securea.
  const malmi = myymalat['Helsinki, Malmi']
  assert.equal(malmi.liittKpl, 314)
  assert.equal(malmi.liittEur.toFixed(2), '2915.50')
  assert.equal(malmi.tunnit.toFixed(2), '421.27')
  assert.equal(malmi.fsecKpl, 38)

  // Syke: yhteenvetorivi 280 kpl, mutta ständit (55 + 19) pois -> 206.
  assert.equal(myymalat['Lahti, Syke'].liittKpl, 206)

  // Tapahtumapaikka ei ole myymälä.
  assert.equal(myymalat['Ylöjärvi, Prisma Ylöjärvi'], undefined)
  assert.equal(myymalaAvain('Ylöjärvi, Prisma Ylöjärvi'), null)
  assert.equal(myymalaAvain('Vantaa, K-Citymarket Kivistö'), 'Vantaa, Kivistö')
})

test('rajauksen ulkopuolelle jäävät rivit eivät katoa vaan selittävät taulukoiden eron', () => {
  const { myymalat, ulkopuoliset } = summaaMyymalat(RIVIT, HEADER_IDX, sarakkeet, kuuluuMyyjiin)
  const { myyjat } = summaaMyyjat(RIVIT, HEADER_IDX, sarakkeet, kuuluuMyyjiin)

  const myymalatYht = Object.values(myymalat).reduce((s, m) => s + m.liittKpl, 0)
  const myyjatYht = myyjat.reduce((s, m) => s + m.liittKpl, 0)

  // Myyjätaulukko kattaa myyjän koko tuloksen, myymälätaulukko vain
  // myymälöissä tehdyn. Erotus on täsmälleen tapahtumamyynti.
  assert.equal(myyjatYht - (myymalatYht - ulkopuoliset.vieraatMyymaloissa.liittKpl),
    ulkopuoliset.omatMuualla.liittKpl)

  // Ylöjärvi 69 + 29 = 98 kpl, ja se näkyy paikkanimellä.
  assert.equal(ulkopuoliset.omatMuualla.liittKpl, 98)
  assert.equal(ulkopuoliset.paikat[0].nimi, 'Ylöjärvi, Prisma Ylöjärvi')
  assert.equal(ulkopuoliset.paikat[0].liittKpl, 98)

  // Ständit (Kanerva 55, Peltola 19) omana eränään, pois myymälästä.
  assert.equal(ulkopuoliset.standi.liittKpl, 74)

  // Hero Ikko on Holmassa mukana myymälän luvussa mutta ei myyjätaulukossa.
  assert.equal(ulkopuoliset.vieraatMyymaloissa.liittKpl, 20)

  // Mikään rivi ei jää minkään erän ulkopuolelle.
  const kaikki = myymalatYht + ulkopuoliset.standi.liittKpl
    + ulkopuoliset.omatMuualla.liittKpl + ulkopuoliset.muut.liittKpl
  const riveilta = RIVIT.slice(HEADER_IDX + 1)
    .filter(r => r[1].trim() !== '')
    .reduce((s, r) => s + Number(r[sarakkeet.liittKpl] || 0), 0)
  assert.equal(kaikki, riveilta)
})

test('myyjärivi on myyjän koko tulos kaikista kustannuspaikoista', () => {
  const { myyjat, standit } = summaaMyyjat(RIVIT, HEADER_IDX, sarakkeet, kuuluuMyyjiin)

  // Hamza: Malmi 47 + Syke 11 + Ylöjärvi 69 = 127, ja kassakate myyjän
  // asteikolla 34,43 + 18,34 + 25,34 = 78,11.
  const hamza = myyjat.find(m => m.nimi === 'Hamza Hanif')!
  assert.equal(hamza.liittKpl, 127)
  assert.equal(hamza.kassaRjmob.toFixed(2), '78.11')
  assert.equal(hamza.kassa.toFixed(2), '781.10')
  assert.equal(hamza.dnaUusmyyntiKpl, 62)
  // F-Securen lajijakauma säilyy: laskeMyyja tarvitsee sen eikä saa joutua
  // johtamaan kertaprovisiota likiarvona.
  assert.equal(hamza.fsecInternetKpl, 9)
  assert.equal(hamza.fsecTotalKpl, 18)

  // Ständit erikseen eivätkä myyjälistalla.
  assert.deepEqual(standit.map(s => s.nimi).sort(), ['Kanerva Jussi', 'Peltola Esa'])
  assert.equal(myyjat.find(m => m.nimi === 'Kanerva Jussi'), undefined)
  // Vieras myyjä ei päädy myyjätaulukkoon.
  assert.equal(myyjat.find(m => m.nimi === 'Hero Ikko'), undefined)
})

test('kuukausiraja on syyskuussa 2026 — elokuu ja vanhemmat eivät saa muuttua', () => {
  assert.equal(UUSI_LUKULAHDE_ALKAEN, 202609)
})
