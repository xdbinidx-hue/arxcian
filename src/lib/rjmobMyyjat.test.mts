import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseMyyjat, tuntipalkatTiedostosta, vertaaNimikorjauksiin,
} from './rjmobMyyjat.ts'

/**
 * Jäsennys ajetaan **oikeaa dokumenttitekstiä vasten**, ei siistittyä
 * markdownia vasten: Google Docsin tekstivienti sisentää luettelokohdat
 * kahdella välilyönnillä ja pakenee muotokuvauksen viivan `\-`:ksi, ja juuri
 * ne kohdat menisivät ohi jos fixture kirjoitettaisiin käsin siistiksi.
 */
const TEKSTI = `# RJ-Mob — myyjät, nimikorjaukset ja tuntipalkat

Päivitetty: (täytä) · Ylläpitäjä: Albin

-----

## Muoto

\\- Koko nimi | aliakset (pilkulla erotettuna) | rooli | myymälä | tuntipalkka €/h

  - Koko nimi = se muoto jota käytetään kaikkialla raporteissa.

-----

## Päälliköt

  - Arbnor Rashica | Arbnor | päällikkö | Malmi | 0 (omistaja, ei tuntipalkkaa eikä bonusta)
  - Joni Viljamaa | Joni | päällikkö | Holma | 14
  - Leo Rossi | Leo | päällikkö | Syke | 14
  - Alec Fambro | Alec | päällikkö | Easton | 14
  - Joona Huttunen | Joona | päällikkö | Kivistö | 14

## Myyjät

  - Krenar Bajqinovci | | myyjä | kiertävä |
  - Steven Sainio | Steven | myyjä | Malmi | 13

## Poistuneet

  - Koko nimi | aliakset | rooli | myymälä | tuntipalkka | päättyi PP.KK.VVVV
  - Petri Kaijanniemi | Petri | myyjä | Malmi | 13 | päättyi 31.03.2026
`

test('päälliköiden rivit jäsentyvät kentiksi', () => {
  const t = parseMyyjat(TEKSTI)
  const joni = t.rivit.find(r => r.nimi === 'Joni Viljamaa')!
  assert.equal(joni.rooli, 'päällikkö')
  assert.equal(joni.myymala, 'Holma')
  assert.equal(joni.tuntipalkka, 14)
  assert.deepEqual(joni.aliakset, ['Joni'])
  assert.equal(joni.poistunut, false)
})

test('omistajan 0 €/h säilyy nollana ja syy talteen', () => {
  const t = parseMyyjat(TEKSTI)
  const arbnor = t.rivit.find(r => r.nimi === 'Arbnor Rashica')!
  assert.equal(arbnor.tuntipalkka, 0)
  assert.match(arbnor.palkkaHuomio ?? '', /omistaja/)
})

test('täyttämätön palkka on null eikä nolla', () => {
  // "ei täytetty" ja "ei tuntipalkkaa" ovat eri asioita: nollaksi tulkittu
  // tyhjä kenttä laskisi myyjän palkaksi 0 € sen sijaan että kertoisi puutteesta.
  const t = parseMyyjat(TEKSTI)
  const krenar = t.rivit.find(r => r.nimi === 'Krenar Bajqinovci')!
  assert.equal(krenar.tuntipalkka, null)
  assert.deepEqual(krenar.aliakset, [])
  assert.ok(t.varoitukset.some(v => v.includes('Krenar Bajqinovci') && v.includes('tuntipalkka')))
})

test('muoto-osion mallirivi ei päädy myyjäksi', () => {
  const t = parseMyyjat(TEKSTI)
  assert.equal(t.rivit.some(r => r.nimi.toLowerCase() === 'koko nimi'), false)
  assert.equal(t.rivit.some(r => r.nimi.startsWith('Koko nimi =')), false)
})

test('poistuneet luetaan mutta eivät tuota puuttuvan palkan varoitusta', () => {
  const t = parseMyyjat(TEKSTI)
  const petri = t.rivit.find(r => r.nimi === 'Petri Kaijanniemi')!
  assert.equal(petri.poistunut, true)
  assert.equal(petri.paattyi, '31.03.2026')
  assert.equal(t.varoitukset.some(v => v.includes('Petri')), false)
})

test('tyhjä tai väärin otsikoitu tiedosto on virhe eikä tyhjä tulos', () => {
  const t = parseMyyjat('# Otsikko\n\nEi mitään listoja.\n')
  assert.equal(t.rivit.length, 0)
  assert.ok(t.varoitukset.some(v => v.includes('yhtään myyjäriviä')))
})

test('tuntipalkat poimitaan sekä nimelle että aliaksille', () => {
  const palkat = tuntipalkatTiedostosta(parseMyyjat(TEKSTI))
  assert.equal(palkat['Joni Viljamaa'], 14)
  assert.equal(palkat['Joni'], 14)
  assert.equal(palkat['Arbnor Rashica'], 0)
  // Täyttämätöntä ei kirjata lainkaan, jottei se peitä oletuspalkkaa nollalla.
  assert.equal('Krenar Bajqinovci' in palkat, false)
})

test('nimikorjaustaulun ja myyjat.md:n ero raportoidaan molempiin suuntiin', () => {
  const t = parseMyyjat(TEKSTI)
  const varoitukset = vertaaNimikorjauksiin(t, [
    { alias: 'Joni', nimi: 'Joni Viljamaa' },
    { alias: 'Kasperi K.', nimi: 'Kasperi Kemppainen' },
  ])
  // Excelissä oleva pari jota md ei tunne.
  assert.ok(varoitukset.some(v => v.includes('Kasperi K.') && v.includes('puuttuu myyjat.md')))
  // md:ssä oleva alias jota Excel ei tunne.
  assert.ok(varoitukset.some(v => v.includes('"Alec"') && v.includes('puuttuu Excelin')))
  // Täsmäävästä parista ei valiteta.
  assert.equal(varoitukset.some(v => v.includes('"Joni"') && v.includes('puuttuu myyjat.md')), false)
})

test('ristiriitainen kohde nimetään, ei korjata', () => {
  const t = parseMyyjat(TEKSTI)
  const varoitukset = vertaaNimikorjauksiin(t, [{ alias: 'Joni', nimi: 'Joni Virtanen' }])
  assert.ok(varoitukset.some(v => v.includes('Joni Virtanen') && v.includes('Joni Viljamaa')))
})
