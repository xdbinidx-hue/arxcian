import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACTION_TOOLS, NAV_TARGETS, isActionTool, resolveNavTarget } from './actions.ts'
import { RJMOB_PAGES, SECTIONS } from '../nav.ts'

test('tunnisteet ovat uniikkeja', () => {
  const ids = NAV_TARGETS.map(t => t.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('jokainen kohde osoittaa arxcianin sisään', () => {
  for (const target of NAV_TARGETS) {
    assert.ok(target.href.startsWith('/arxcian'), `${target.id}: ${target.href}`)
    assert.ok(target.label.trim() !== '', `${target.id} ilman nimeä`)
  }
})

test('hub ja kaikki osiot ovat avustajan tavoitettavissa', () => {
  const ids = new Set(NAV_TARGETS.map(t => t.id))
  assert.ok(ids.has('hub'))
  for (const section of SECTIONS) assert.ok(ids.has(section.id), `osio ${section.id} puuttuu`)
})

// Osion href osoittaa vain yhteen RJ-Mobin sivuun, joten ilman alasivuja
// "näytä kassamyynti" avaisi tuottoseurannan kertomatta erosta.
test('RJ-Mobin jokainen alasivu on oma kohteensa', () => {
  const hrefs = new Set(NAV_TARGETS.map(t => t.href))
  for (const page of RJMOB_PAGES) assert.ok(hrefs.has(page.href), `sivu ${page.id} puuttuu`)
})

// Malli valitsee kohteen enumista. Jos lista ja enum erkanevat, malli voi
// tarjota tunnistetta jota resolveNavTarget ei tunne — ja käyttäjä kuulisi
// vain että jokin meni pieleen.
test('työkalun enum vastaa kohdelistaa', () => {
  const tool = ACTION_TOOLS[0]
  assert.equal(tool.name, 'navigate')
  assert.deepEqual(
    [...tool.input_schema.properties.target.enum],
    NAV_TARGETS.map(t => t.id),
  )
})

test('tunnettu kohde ratkeaa osoitteeksi', () => {
  const result = resolveNavTarget({ target: 'trading' })
  assert.ok(result.ok)
  assert.equal(result.target.href, '/arxcian/trading')
})

test('tuntematon kohde kertoo mallille sallitut', () => {
  const result = resolveNavTarget({ target: 'sanomalehti' })
  assert.ok(!result.ok)
  assert.match(result.error, /sanomalehti/)
  assert.match(result.error, /trading/)
})

test('puuttuva tai väärän tyyppinen kohde ei ratkea', () => {
  assert.ok(!resolveNavTarget({}).ok)
  assert.ok(!resolveNavTarget(null).ok)
  assert.ok(!resolveNavTarget({ target: 3 }).ok)
  // Osoite ei kelpaa tunnisteeksi: malli ei saa keksiä polkuja.
  assert.ok(!resolveNavTarget({ target: '/arxcian/trading' }).ok)
})

test('vain navigate on ohjaustyökalu', () => {
  assert.ok(isActionTool('navigate'))
  assert.ok(!isActionTool('create_note'))
  assert.ok(!isActionTool('get_latest_news'))
})
