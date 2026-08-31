import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  jasennaLahtiVuorot, lahtiVuoroIkkuna, LAHTI_MYYJA_SARAKKEET,
} from './lahtiVuorot.ts'
import { sarakeIndeksi } from './tyovuoroExcel.ts'

/**
 * Rivit rakennetaan sarakekirjaimista, koska LAHTI-välilehdellä on 25
 * saraketta ennen ensimmäistä kiinnostavaa arvoa — putkilistana testi olisi
 * lukukelvoton eikä kertoisi mistä sarakkeesta on kyse.
 */
function rivi(solut: Record<string, string>): string[] {
  const r: string[] = []
  for (const [kirjaimet, arvo] of Object.entries(solut)) r[sarakeIndeksi(kirjaimet)] = arvo
  for (let i = 0; i < r.length; i++) if (r[i] === undefined) r[i] = ''
  return r
}

/** Taulukko jossa rivit 1–3 ovat otsikoita ja päivät alkavat riviltä 4. */
function taulukko(...paivarivit: string[][]): string[][] {
  return [[], [], [], ...paivarivit]
}

test('sarakekartta vastaa taulukon riviä 3', () => {
  // Luettu Drivestä 31.8.2026: B=Albin, E=Arbnor, H=Steven, K=Jami,
  // N=Joni, Q=Atte, T=Leo, W=Daniel.
  assert.deepEqual(
    LAHTI_MYYJA_SARAKKEET.map(s => s.seller),
    ['Albin Rashica', 'Arbnor Rashica', 'Steven Sainio', 'Jami Tonteri',
      'Joni Viljamaa', 'Atte Kröger', 'Leo Rossi', 'Daniel Miettinen'],
  )
  assert.equal(LAHTI_MYYJA_SARAKKEET[2].vuoro, sarakeIndeksi('H'))
  assert.equal(LAHTI_MYYJA_SARAKKEET[2].myymala, sarakeIndeksi('J'))
})

test('vuoro luetaan tuntisarakkeesta, myymäläkirjain säilyy', () => {
  const v = jasennaLahtiVuorot(taulukko(
    rivi({ A: 'ma.3.8.', H: '14-19', I: '5', J: 'H', K: '12-19', L: '7', M: 'S' }),
  ), 2026, 8)

  assert.deepEqual(v, [
    { seller: 'Steven Sainio', date: '2026-08-01', paikka: 'H', tunnit: 5 },
    { seller: 'Jami Tonteri', date: '2026-08-01', paikka: 'S', tunnit: 7 },
  ])
})

test('tapahtumapäivä ilman kellonaikaa on silti työpäivä', () => {
  // Taulukossa on Jyväskylän tapahtumapäiviä muodossa "| 10 | jkl", eli
  // kellonaika puuttuu mutta tunnit ja paikka on merkitty. Kellonaikaa
  // vaatimalla nämä katoaisivat ja myyjän kuukausi lyhenisi.
  const v = jasennaLahtiVuorot(taulukko(
    rivi({ A: 'to.6.8.', T: '', U: '10', V: 'jkl' }),
  ), 2026, 8)

  assert.deepEqual(v, [{ seller: 'Leo Rossi', date: '2026-08-01', paikka: 'jkl', tunnit: 10 }])
})

test('vapaa ja tyhjä eivät ole vuoroja', () => {
  const v = jasennaLahtiVuorot(taulukko(
    rivi({ A: 'la.1.8.', H: 'vapaa', N: 'loma', W: '' }),
  ), 2026, 8)
  assert.deepEqual(v, [])
})

test('tapahtumakoodi on työpäivä, sairauspoissaolo ei — vaikka molemmilla on tunnit', () => {
  // Tämä on LAHTI-välilehden koko ero PK-puoleen. "YLÖ" (Ylöjärven
  // tapahtuma) ja "Saikku" ovat molemmat pelkkää tekstiä tuntien kanssa,
  // joten PK:n `onPoissaolo` pudottaisi molemmat — Steven menettäisi kolme
  // 11 tunnin tapahtumapäivää elokuulta 2026.
  const v = jasennaLahtiVuorot(taulukko(
    rivi({ A: 'to.20.8.', H: 'YLÖ', I: '11', J: '', K: 'Saikku', L: '9', M: 'S' }),
  ), 2026, 8)

  assert.deepEqual(v, [
    { seller: 'Steven Sainio', date: '2026-08-01', paikka: '', tunnit: 11 },
  ])
})

test('tuntematon koodi lasketaan työpäiväksi, ei kadoteta', () => {
  // Uusi tapahtumapaikka on todennäköisempi kuin uusi poissaolosana, ja
  // hiljaa kadonnut pitkä tapahtumapäivä vääristää nimittäjää enemmän kuin
  // yksi liikaa laskettu.
  const v = jasennaLahtiVuorot(taulukko(
    rivi({ A: 'to.20.8.', H: 'TRE', I: '9', J: '' }),
  ), 2026, 8)
  assert.equal(v.length, 1)
  assert.equal(v[0].tunnit, 9)
})

test('nolla tuntia ei ole vuoro', () => {
  // Tyhjäksi jäänyt rivi jolle on vahingossa jäänyt nolla ei saa nostaa
  // nimittäjää — se laskisi myyjän ennustetta ilman että hän oli töissä.
  const v = jasennaLahtiVuorot(taulukko(
    rivi({ A: 'la.1.8.', H: '10-16', I: '0', J: 'H' }),
  ), 2026, 8)
  assert.deepEqual(v, [])
})

test('luku ei ulotu päivärivien ulkopuolelle', () => {
  // Elokuussa on 31 päivää eli päivärivit 4–34. Rivi 35 on tuntisummakaavat,
  // ja niiden lukeminen tekisi jokaisesta myyjästä yhden ylimääräisen vuoron.
  const paivat = Array.from({ length: 31 }, (_, i) =>
    rivi({ A: `x.${i + 1}.8.`, H: '10-16', I: '6', J: 'H' }))
  const summarivi = rivi({ A: '', H: '', I: '186', J: '' })
  const v = jasennaLahtiVuorot(taulukko(...paivat, summarivi), 2026, 8)
  assert.equal(v.length, 31)
})

test('ikkuna laskee eiliseen asti ja koko kuukauden erikseen', () => {
  const vuorot = [
    { seller: 'Leo Rossi', date: '2026-08-28', paikka: 'H', tunnit: 6 },
    { seller: 'Leo Rossi', date: '2026-08-29', paikka: 'S', tunnit: 6 },
    { seller: 'Leo Rossi', date: '2026-08-31', paikka: 'H', tunnit: 6 },
    { seller: 'Atte Kröger', date: '2026-08-31', paikka: 'S', tunnit: 6 },
  ]
  const ikkuna = lahtiVuoroIkkuna(vuorot, '2026-08-29')

  assert.deepEqual(ikkuna['Leo Rossi'], { paattyneet: 2, kaikki: 3 })
  // Vain tulevia vuoroja: ennustetta ei ole, mutta rivi on olemassa.
  assert.deepEqual(ikkuna['Atte Kröger'], { paattyneet: 0, kaikki: 1 })
  assert.equal(ikkuna['Basri Salihi'], undefined)
})
