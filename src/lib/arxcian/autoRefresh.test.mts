import { test } from 'node:test'
import assert from 'node:assert/strict'
import { saakoAjaaAutomaattisesti } from './autoRefresh.ts'

const MIN = 60_000
const NYT = 1_787_592_000_000

/** Perustapaus: näkyvissä, data tuntia vanhaa, ei aiempaa automaattiajoa. */
function ehto(muutokset: Partial<Parameters<typeof saakoAjaaAutomaattisesti>[0]> = {}) {
  return {
    nyt: NYT,
    ikarajaMin: 15,
    fetchedAt: NYT - 60 * MIN,
    edellinenAutomaatti: null,
    nakyvissa: true,
    ...muutokset,
  }
}

test('vanha data haetaan', () => {
  assert.equal(saakoAjaaAutomaattisesti(ehto()), true)
})

test('tuore data jätetään rauhaan', () => {
  assert.equal(saakoAjaaAutomaattisesti(ehto({ fetchedAt: NYT - 5 * MIN })), false)
})

test('taustavälilehti ei hae', () => {
  assert.equal(saakoAjaaAutomaattisesti(ehto({ nakyvissa: false })), false)
})

test('tuntematon hakuaika haetaan — tuoreudesta ei ole todistetta', () => {
  assert.equal(saakoAjaaAutomaattisesti(ehto({ fetchedAt: null })), true)
})

/**
 * Tämä on se vika jonka takia jäähy on olemassa. Epäonnistunut haku ei siirrä
 * `fetchedAt`ia, joten pelkkä ikäehto olisi ajon jälkeen yhä tosi ja
 * `router.refresh`in laukaisema uudelleenrenderöinti hakisi heti uudelleen.
 * Kaatunut lähde jäisi silmukkaan.
 */
test('juuri ajettua ei ajeta uudelleen vaikka haku olisi epäonnistunut', () => {
  assert.equal(
    saakoAjaaAutomaattisesti(
      ehto({ fetchedAt: NYT - 60 * MIN, edellinenAutomaatti: NYT - 1000 }),
    ),
    false,
  )
})

test('jäähyn jälkeen saa yrittää uudelleen', () => {
  assert.equal(
    saakoAjaaAutomaattisesti(
      ehto({ fetchedAt: NYT - 60 * MIN, edellinenAutomaatti: NYT - 16 * MIN }),
    ),
    true,
  )
})

test('nolla tai negatiivinen ikäraja ei tarkoita "aina"', () => {
  assert.equal(saakoAjaaAutomaattisesti(ehto({ ikarajaMin: 0 })), false)
  assert.equal(saakoAjaaAutomaattisesti(ehto({ ikarajaMin: -5 })), false)
})
