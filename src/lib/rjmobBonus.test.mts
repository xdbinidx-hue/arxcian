import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bonusPorras, laskeMyymalanBonus, laskeKuukaudenBonukset, maksukuukausi,
  ansaintakuukausi, bonusmalliVoimassa, toteumatMyymalataulukosta, sivukuluineen,
  myymalaAvaimesta, tasonMaksimi, BONUSMALLI_ALKAA,
  type MyymalaTavoite, type MyymalaToteuma,
} from './rjmobBonus.ts'
import { tavoitteetKuukaudelle, tavoiteYhteensa, tavoiteIlmanTapahtumaa } from './rjmobBonusTavoitteet.ts'


/**
 * Myymäläpäällikköbonuksen säännöt. Bonus on oikeaa rahaa ihmisten palkassa,
 * joten portaan reunat ja Malmin nollamaksu on lukittu testillä eikä jätetty
 * koodin lukemisen varaan.
 */

function tavoite(yli: Partial<MyymalaTavoite> = {}): MyymalaTavoite {
  return { liittymat: 100, fsecure: 100, kassakate: 100, ...yli }
}

function toteuma(yli: Partial<MyymalaToteuma> = {}): MyymalaToteuma {
  return { liittymat: 0, fsecure: 0, kassakate: 0, ...yli }
}

test('porras on kaksiportainen eikä liukuma', () => {
  assert.equal(bonusPorras(99.9, 100), 'ei')
  assert.equal(bonusPorras(100, 100), 'sata')
  assert.equal(bonusPorras(119.9, 100), 'sata')
  assert.equal(bonusPorras(120, 100), 'satakaksi')
})

test('yli 120 % ei maksa enempää kuin 120 %', () => {
  const iso = laskeMyymalanBonus('Easton', tavoite(), toteuma({ liittymat: 120, fsecure: 120, kassakate: 120 }))
  const valtava = laskeMyymalanBonus('Easton', tavoite(), toteuma({ liittymat: 250, fsecure: 250, kassakate: 250 }))
  assert.equal(valtava.maksettava, iso.maksettava)
  assert.equal(valtava.maksettava, tasonMaksimi(3))
  assert.equal(valtava.maksettava, 500)
})

test('portaan raja lasketaan raa\'asta suhteesta, ei pyöristetystä prosentista', () => {
  // 119,96 % pyöristyisi näytöllä 120,0 %:ksi mutta ei ole yli portaan.
  assert.equal(bonusPorras(119.96, 100), 'sata')
})

test('kolme mittaria maksavat itsenäisesti', () => {
  const b = laskeMyymalanBonus('Holma', tavoite(), toteuma({ liittymat: 100, fsecure: 50, kassakate: 0 }))
  assert.equal(b.mittarit.find(m => m.mittari === 'liittymat')!.bonus, 300)
  assert.equal(b.mittarit.find(m => m.mittari === 'fsecure')!.bonus, 0)
  assert.equal(b.mittarit.find(m => m.mittari === 'kassakate')!.bonus, 0)
  assert.equal(b.maksettava, 300)
})

test('dokumentin Easton-esimerkki: 325 € ja 438,75 € sivukuluineen', () => {
  const b = laskeMyymalanBonus(
    'Easton',
    { liittymat: 160, fsecure: 24, kassakate: 2600 },
    { liittymat: 189, fsecure: 30, kassakate: 2574 },
  )
  const pct = (m: string) => b.mittarit.find(x => x.mittari === m)!.pct!
  assert.equal(Math.round(pct('liittymat') * 10) / 10, 118.1)
  assert.equal(Math.round(pct('fsecure') * 10) / 10, 125)
  assert.equal(Math.round(pct('kassakate') * 10) / 10, 99)
  assert.equal(b.maksettava, 325)
  assert.equal(b.kulu, 438.75)
})

test('Malmi näyttää prosentit ja teoreettisen bonuksen mutta maksettava on 0 €', () => {
  const b = laskeMyymalanBonus('Malmi', tavoite(), toteuma({ liittymat: 200, fsecure: 200, kassakate: 200 }))
  assert.equal(b.maksetaan, false)
  assert.equal(b.teoreettinen, 1000)
  assert.equal(b.maksettava, 0)
  assert.equal(b.kulu, 0)
  assert.equal(b.mittarit.every(m => m.pct === 200), true)
})

test('puuttuva tavoite antaa 0 € ja varoituksen, ei arvausta', () => {
  const b = laskeMyymalanBonus('Syke', { liittymat: null, fsecure: 40, kassakate: 2200 }, toteuma({ liittymat: 9999, fsecure: 40, kassakate: 2200 }))
  const liitt = b.mittarit.find(m => m.mittari === 'liittymat')!
  assert.equal(liitt.bonus, 0)
  assert.equal(liitt.pct, null)
  assert.equal(liitt.porras, null)
  assert.equal(b.varoitukset.length, 1)
  // Muut mittarit maksavat normaalisti puuttuvasta huolimatta.
  assert.equal(b.maksettava, 200 + 100)
})

test('nollatavoite käsitellään puuttuvana eikä nollalla jaeta', () => {
  const b = laskeMyymalanBonus('Kivistö', tavoite({ kassakate: 0 }), toteuma({ kassakate: 500 }))
  const kassa = b.mittarit.find(m => m.mittari === 'kassakate')!
  assert.equal(kassa.pct, null)
  assert.equal(kassa.bonus, 0)
})

test('tasosummat: taso 1 max 1000, taso 2 max 750, taso 3 max 500', () => {
  assert.equal(tasonMaksimi(1), 1000)
  assert.equal(tasonMaksimi(2), 750)
  assert.equal(tasonMaksimi(3), 500)
})

test('taso seuraa myymälää eikä ihmistä', () => {
  const easton = laskeMyymalanBonus('Easton', tavoite(), toteuma({ liittymat: 120, fsecure: 120, kassakate: 120 }))
  const holma = laskeMyymalanBonus('Holma', tavoite(), toteuma({ liittymat: 120, fsecure: 120, kassakate: 120 }))
  assert.equal(easton.taso, 3)
  assert.equal(holma.taso, 1)
  assert.notEqual(easton.maksettava, holma.maksettava)
})

test('kassakate luetaan isosta luvusta eikä kassaprovisiosta', () => {
  // stores[].kassa on x10 ja kassaRjmob x1. Jos bonus laskettaisiin
  // provisioasteikolta, tavoitetta ei saavuttaisi ikinä kukaan.
  const rivi = { liittKpl: 189, fsecKpl: 30, kassa: 3300, kassaRjmob: 330 }
  const toteumat = toteumatMyymalataulukosta({ 'Helsinki, Easton': rivi })
  assert.equal(toteumat.Easton!.kassakate, 3300)
})

test('myymälätaulukon avaimet tunnistetaan kaupunkietuliitteestä huolimatta', () => {
  assert.equal(myymalaAvaimesta('Helsinki, Malmi'), 'Malmi')
  assert.equal(myymalaAvaimesta('K-Citymarket Malmi'), 'Malmi')
  assert.equal(myymalaAvaimesta('Vantaa, Kivistö'), 'Kivistö')
  assert.equal(myymalaAvaimesta('Vantaa, Kivisto'), 'Kivistö')
  assert.equal(myymalaAvaimesta('Lahti, Syke'), 'Syke')
  assert.equal(myymalaAvaimesta('Tampere, Jokin muu'), null)
})

test('vanha malli jää voimaan elokuuhun 2026 asti', () => {
  assert.equal(BONUSMALLI_ALKAA, 202609)
  assert.equal(bonusmalliVoimassa(202608), false)
  assert.equal(bonusmalliVoimassa(202512), false)
  assert.equal(bonusmalliVoimassa(202609), true)
  assert.equal(bonusmalliVoimassa(null), false)
})

test('syyskuun bonus kirjautuu lokakuun kuluksi', () => {
  assert.equal(maksukuukausi(202609), 202610)
  assert.equal(maksukuukausi(202612), 202701)
  assert.equal(ansaintakuukausi(202610), 202609)
  assert.equal(ansaintakuukausi(202701), 202612)
})

test('sivukulukerroin osuu bonukseen samalla kertoimella kuin muihin palkkakuluihin', () => {
  const kk = laskeKuukaudenBonukset(202609, tavoitteetKuukaudelle(202609), {
    Holma: { liittymat: 300, fsecure: 53, kassakate: 3000 },
  })
  assert.equal(kk.maksettavaYhteensa, 750)
  assert.equal(kk.kuluYhteensa, 1012.5)
  assert.equal(kk.maksuOrder, 202610)
})

test('sivukuluinen summa pyöristetään sentteihin', () => {
  assert.equal(sivukuluineen(325), 438.75)
  assert.equal(sivukuluineen(0), 0)
  assert.equal(sivukuluineen(2750), 3712.5)
})

test('kuukauden maksimi laskee vain maksettavat myymälät', () => {
  const kk = laskeKuukaudenBonukset(202609, tavoitteetKuukaudelle(202609), {})
  // Holma 1000 + Syke 750 + Easton 500 + Kivistö 500 = 2750, Malmi ei mukana.
  assert.equal(kk.maksimi, 2750)
  assert.equal(kk.maksettavaYhteensa, 0)
})

test('syyskuun 2026 lukitut tavoitteet täsmäävät taulukon summariviin', () => {
  const t = tavoitteetKuukaudelle(202609)!
  assert.deepEqual(tavoiteYhteensa(t), { liittymat: 1800, fsecure: 253, kassakate: 15500 })
  assert.equal(t.Malmi.liittymat, 900)
  assert.equal(t.Malmi.tapahtumaLiittymat, 600)
  // Tapahtuma on analyysitieto: bonus lasketaan koko 900:sta, normalisoitu
  // vertailuluku on 300.
  assert.equal(tavoiteIlmanTapahtumaa(t.Malmi), 300)
  assert.equal(tavoiteIlmanTapahtumaa(t.Easton), 190)
})

test('tapahtumamyynti ei nosta tavoitetta jälkikäteen', () => {
  const t = tavoitteetKuukaudelle(202609)!
  const b = laskeMyymalanBonus('Malmi', t.Malmi, { liittymat: 900, fsecure: 80, kassakate: 4000 })
  // 900/900 = 100 %, ei 900/300 = 300 %.
  assert.equal(b.mittarit.find(m => m.mittari === 'liittymat')!.pct, 100)
})
