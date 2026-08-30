import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseMyyjat, tuntipalkatTiedostosta, tuntipalkkaKuukaudelle,
  vertaaTuntipalkkoihin, vertaaNimikorjauksiin,
} from './rjmobMyyjat.ts'
import { getTuntipalkka } from './rjmob.ts'

/**
 * Jäsennys ajetaan **oikeaa Docs-vientitekstiä vasten**, ei siistittyä
 * markdownia vasten. Kaksi kohtaa menisi ohi siistillä fixturella ja
 * molemmat ovat tuotannossa: osioiden otsikot ovat paljaita rivejä (Docs
 * pudottaa otsikkotason), ja muotokuvauksen mallirivit näyttävät
 * täsmälleen datariveiltä.
 */
const TEKSTI = `RJ-Mob — myyjät, nimikorjaukset ja tuntipalkat
Päivitetty: 26.8.2026 · Ylläpitäjä: Albin

________________

Muoto
- Tunnus | Koko nimi | alue | tuntipalkka €/h | tila

* Tunnus = miten nimi kirjoitetaan Winposissa / kassalla. Tämä on se jota korjataan.
* Alue = Lahti tai PK-seutu. Ei myymälä — myyjät kiertävät.

Varoitus: Kasper (Kasper Hiltunen) ja Kasperi K. (Kasperi Kemppainen) ovat eri ihmisiä.

________________

Omistajat
* Albin | Albin Rashica | molemmat | ei tuntipalkkaa | Kyllä
* Arbnor | Arbnor Rashica | PK-seutu | ei tuntipalkkaa | Kyllä

Omistajille ei makseta tuntipalkkaa eikä päällikköbonusta.
Lahti
* Steven | Steven Sainio | Lahti | 13,00 | Kyllä
* Joni V | Joni Viljamaa | Lahti | 14,00 | Kyllä (päällikkö, Holma)
* Leo | Leo Rossi | Lahti | 14,00 | Kyllä (päällikkö, Syke)
* Daniel | Daniel Miettinen | Lahti | 10,00 | Kyllä
PK-seutu
* Alec | Alec Fambro | PK-seutu | 14,00 | Kyllä (päällikkö, Easton)
* Joona | Joona Huttunen | PK-seutu | 14,00 | Kyllä (päällikkö, Kivistö)
* Krenar | Krenar Bajqinovci | PK-seutu | ei tuntipalkkaa | Kyllä (avoin: miten kulu lasketaan?)
* Kasperi K. | Kasperi Kemppainen | PK-seutu | 13,00 | Kyllä
* Vladimir K. | Vladimir Kogan | PK-seutu | 10,00 | Kyllä
* Antti | Antti Kiljala | PK-seutu | 11,00 | Kyllä
Lopettaneet
Älä poista näitä rivejä — vanhojen kuukausien laskenta tarvitsee palkan yhä.

* Basri | Basri Salihi | Lahti | 15,00 | Lopettanut 08/26
* Kasper | Kasper Hiltunen | PK-seutu | 10,00 | Lopettanut 10/25

________________

Palkkamuutokset
- Tunnus | vanha → uusi | voimaan KK/VV

* Joni V | 13,00 → 14,00 | voimaan 09/26
* Leo | 13,00 → 14,00 | voimaan 09/26
* Alec | 13,00 → 14,00 | voimaan 09/26
* Joona | 13,00 → 14,00 | voimaan 09/26
`

test('myyjärivit jäsentyvät vaikka osioiden otsikot ovat paljaita rivejä', () => {
  const t = parseMyyjat(TEKSTI)
  const steven = t.rivit.find(r => r.nimi === 'Steven Sainio')!
  assert.equal(steven.tunnus, 'Steven')
  assert.equal(steven.alue, 'Lahti')
  assert.equal(steven.tuntipalkka, 13)
  assert.equal(steven.poistunut, false)
  // "Lahti" ja "Omistajille ei makseta..." eivät ole rivejä.
  assert.equal(t.rivit.some(r => r.nimi === 'Lahti'), false)
})

test('muotokuvauksen mallirivi ei päädy myyjäksi', () => {
  const t = parseMyyjat(TEKSTI)
  assert.equal(t.rivit.some(r => r.tunnus.toLowerCase() === 'tunnus'), false)
})

test('päällikkö ja hänen myymälänsä luetaan tila-kentästä', () => {
  const t = parseMyyjat(TEKSTI)
  const alec = t.rivit.find(r => r.nimi === 'Alec Fambro')!
  assert.equal(alec.paallikko, true)
  assert.equal(alec.myymala, 'Easton')
  const steven = t.rivit.find(r => r.nimi === 'Steven Sainio')!
  assert.equal(steven.paallikko, false)
  assert.equal(steven.myymala, null)
})

test('"ei tuntipalkkaa" on nolla ja päätös, tyhjä kenttä on null ja puute', () => {
  const t = parseMyyjat(TEKSTI)
  const krenar = t.rivit.find(r => r.nimi === 'Krenar Bajqinovci')!
  assert.equal(krenar.tuntipalkka, 0)
  assert.equal(krenar.eiTuntipalkkaa, true)
  assert.match(krenar.huomio ?? '', /avoin/)
  // Puuttuvasta palkasta varoitetaan, päätetystä nollasta ei.
  assert.equal(t.varoitukset.some(v => v.includes('Krenar')), false)

  const puutteellinen = parseMyyjat('* Testi | Testi Myyja | Lahti |  | Kyllä\n')
  assert.equal(puutteellinen.rivit[0].tuntipalkka, null)
  assert.ok(puutteellinen.varoitukset.some(v => v.includes('tuntipalkka puuttuu')))
})

test('lopettamiskuukausi luetaan järjestysluvuksi', () => {
  const t = parseMyyjat(TEKSTI)
  const basri = t.rivit.find(r => r.nimi === 'Basri Salihi')!
  assert.equal(basri.poistunut, true)
  assert.equal(basri.paattyiOrder, 202608)
  assert.equal(t.rivit.find(r => r.nimi === 'Kasper Hiltunen')!.paattyiOrder, 202510)
})

test('Kasper ja Kasperi K. pysyvät eri ihmisinä', () => {
  const t = parseMyyjat(TEKSTI)
  const palkat = tuntipalkatTiedostosta(t)
  assert.equal(palkat['Kasper Hiltunen'], 10)
  assert.equal(palkat['Kasperi Kemppainen'], 13)
  assert.equal(palkat['Kasper'], 10)
  assert.equal(palkat['Kasperi K.'], 13)
})

test('palkkamuutokset luetaan omana listanaan eivätkä myyjäriveinä', () => {
  const t = parseMyyjat(TEKSTI)
  assert.equal(t.palkkamuutokset.length, 4)
  const joni = t.palkkamuutokset.find(m => m.tunnus === 'Joni V')!
  assert.deepEqual(joni, { tunnus: 'Joni V', vanha: 13, uusi: 14, voimaanOrder: 202609 })
  assert.equal(t.rivit.some(r => r.nimi.includes('→')), false)
})

test('vanha kuukausi lasketaan silloin voimassa olleella palkalla', () => {
  const t = parseMyyjat(TEKSTI)
  assert.equal(tuntipalkkaKuukaudelle(t, 'Joni Viljamaa', 202608), 13)
  assert.equal(tuntipalkkaKuukaudelle(t, 'Joni Viljamaa', 202609), 14)
  assert.equal(tuntipalkkaKuukaudelle(t, 'Joni Viljamaa', null), 14)
  // Muutoksettomalla myyjällä sama luku molemmissa kuukausissa.
  assert.equal(tuntipalkkaKuukaudelle(t, 'Antti Kiljala', 202608), 11)
  assert.equal(tuntipalkkaKuukaudelle(t, 'Antti Kiljala', 202609), 11)
})

test('rivinvaihdot CRLF:llä (Docsin oma vienti) toimivat samoin', () => {
  const t = parseMyyjat(TEKSTI.replace(/\n/g, '\r\n'))
  assert.equal(t.rivit.find(r => r.nimi === 'Alec Fambro')!.tuntipalkka, 14)
})

test('muuttunut rivimuoto on virhe eikä tyhjä lista', () => {
  // Ilman tätä palkat putoaisivat hiljaa oletukseen kun tiedoston muoto muuttuu.
  const t = parseMyyjat('Otsikko\n\nEi yhtään putkirivia.\n')
  assert.ok(t.varoitukset.some(v => v.includes('yhtään myyjäriviä')))
})

test('koodin tuntipalkat vastaavat myyjat.md:tä', () => {
  const t = parseMyyjat(TEKSTI)
  assert.deepEqual(vertaaTuntipalkkoihin(t, getTuntipalkka, 202609), [])
  assert.deepEqual(vertaaTuntipalkkoihin(t, getTuntipalkka, 202608), [])
})

test('ero koodin ja tiedoston välillä raportoidaan nimeltä', () => {
  const t = parseMyyjat(TEKSTI)
  const varoitukset = vertaaTuntipalkkoihin(t, n => (n === 'Alec Fambro' ? 12 : 13), 202609)
  assert.ok(varoitukset.some(v => v.includes('Alec Fambro') && v.includes('14') && v.includes('12')))
})

test('päälliköiden palkankorotus ei vuoda elokuuhun', () => {
  // Elokuun 2026 tuottoseuranta on laskettu 13 eurolla, ja sen on pysyttävä
  // niin myös ensi vuonna katsottuna.
  assert.equal(getTuntipalkka('Alec Fambro', 202608), 13)
  assert.equal(getTuntipalkka('Alec Fambro', 202609), 14)
  assert.equal(getTuntipalkka('Joona Huttunen', 202608), 13)
  assert.equal(getTuntipalkka('Joona Huttunen', 202609), 14)
  // Muut eivät muutu kuukauden mukana.
  assert.equal(getTuntipalkka('Vladimir Kogan', 202608), 10)
  assert.equal(getTuntipalkka('Vladimir Kogan', 202609), 10)
  assert.equal(getTuntipalkka('Steven Sainio', 202608), 13)
})

test('nimikorjaustaulun ja myyjat.md:n ero raportoidaan molempiin suuntiin', () => {
  const t = parseMyyjat(TEKSTI)
  const varoitukset = vertaaNimikorjauksiin(t, [
    { alias: 'Joni V', nimi: 'Joni Viljamaa' },
    { alias: 'Kasperi K.', nimi: 'Kasperi Kemppainen' },
    { alias: 'Jami', nimi: 'Jami Tonteri' },
  ], 202609)
  assert.ok(varoitukset.some(v => v.includes('"Jami"') && v.includes('puuttuu myyjat.md')))
  assert.ok(varoitukset.some(v => v.includes('"Steven"') && v.includes('puuttuu Excelin')))
  assert.equal(varoitukset.some(v => v.includes('"Joni V"') && v.includes('puuttuu myyjat.md')), false)
})

test('ristiriitainen kohde nimetään, ei korjata', () => {
  const t = parseMyyjat(TEKSTI)
  const varoitukset = vertaaNimikorjauksiin(t, [{ alias: 'Leo', nimi: 'Leo Virtanen' }], 202609)
  assert.ok(varoitukset.some(v => v.includes('Leo Virtanen') && v.includes('Leo Rossi')))
})

test('itseensä osoittava korjaus ei ole alias eikä vaadi tunnusta', () => {
  // "Albin Rashica" -> "Albin Rashica" on varmistus siltä varalta että nimi
  // tulee jo valmiiksi oikein, ei nimikorjaus. Ilman tätä omistajat tuottivat
  // neljä varoitusta joka kuukausi eikä mikään niistä ollut vika.
  const t = parseMyyjat('* Albin | Albin Rashica | molemmat | ei tuntipalkkaa | Kyllä\n')
  assert.deepEqual(vertaaNimikorjauksiin(t, [{ alias: 'Albin Rashica', nimi: 'Albin Rashica' }], 202609), [])
})

test('poistunut on mukana lopettamiskuukautenaan muttei sen jälkeen', () => {
  // Basri lopetti 08/26: elokuun laskenta tarvitsee hänet, syyskuun ei.
  const t = parseMyyjat(TEKSTI)
  const excel = [{ alias: 'Steven', nimi: 'Steven Sainio' }]
  const elokuu = vertaaNimikorjauksiin(t, excel, 202608)
  const syyskuu = vertaaNimikorjauksiin(t, excel, 202609)
  assert.ok(elokuu.some(v => v.includes('Basri')))
  assert.equal(syyskuu.some(v => v.includes('Basri')), false)
  // Kauan sitten lopettanut ei valita kummassakaan.
  assert.equal(elokuu.some(v => v.includes('Kasper Hiltunen')), false)
})

test('lopettaneen rivi Excelissä ei ole vika', () => {
  // Korjaustaulusta ei ole syytä poistaa lopettanutta, ja siitä valittaminen
  // joka kuukausi opettaisi ohittamaan koko varoituslistan.
  const t = parseMyyjat(TEKSTI)
  const varoitukset = vertaaNimikorjauksiin(t, [{ alias: 'Basri', nimi: 'Basri Salihi' }], 202609)
  assert.equal(varoitukset.some(v => v.includes('Basri Salihi')), false)
})

test('Excelissä oleva tuntematon nimi on yhä vika', () => {
  const t = parseMyyjat(TEKSTI)
  const varoitukset = vertaaNimikorjauksiin(t, [{ alias: 'Uusi', nimi: 'Uusi Myyja' }], 202609)
  assert.ok(varoitukset.some(v => v.includes('Uusi Myyja') || v.includes('"Uusi"')))
})
