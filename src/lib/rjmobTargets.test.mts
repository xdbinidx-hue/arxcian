import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as rjmob from './rjmob.ts'
import * as taulukko from './rjmobTavoiteTaulukko.ts'
import * as myymala from './rjmobMyymalaTaulukko.ts'
import type { TargetsData } from './rjmobTargets.ts'

// Suoritetaan oikea kokoaja, mutta kaikki I/O-riippuvuudet ovat testin omia.
// Moduulilla ei ole tuotantotunnuksia, fetchiä eikä vapaata requirea.
function moduuli(file: string, dependencies: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports: Record<string, any> = {}
  runInNewContext(code, { exports, Buffer, process: { env: { GOOGLE_SERVICE_ACCOUNT_KEY: '{}' } },
    require(name: string) {
      assert.ok(name in dependencies, `Odottamaton riippuvuus: ${name}`)
      return dependencies[name]
    },
  })
  return exports
}

const headers = ['Myyjä', 'Liittymä kpl', 'Liittymäprovisio', 'F-Secure kpl', 'Kassakate', 'DNA uusmyynti', 'ELISA Pakettiliittymät', 'TELIA uusmyynti', 'TELIA yritysliittymä uusmyynti']
const tavoite = { nimi: 'Hamza Hanif', liittymat: 100, fsecure: 10, kassakate: 1000 }
async function hae(options: { month?: string; sheets?: Record<string, string[][]>; targets?: unknown[]; failTargets?: boolean; archive?: unknown } = {}) {
  const calls: string[] = []
  const sheets = options.sheets ?? {
    'Myyjät Myymälöittäin': [headers, ['Hanif Hamza', '10', '50', '2', '30', '2', '3', '4', '1'], ['Hamza Hanif', '20', '100', '3', '40', '3', '4', '5', '2']],
    data: [['Nimi', 'Toteutuneet työpäivät(pv)'], ['Hamza Hanif', '5']],
  }
  const google = {
    auth: { GoogleAuth: class {} },
    drive: () => ({ files: { get: async () => ({ data: { name: options.month ?? 'Myyntiseuranta 9. Syyskuu 2026' } }) } }),
    sheets: () => ({ spreadsheets: {
      get: async () => ({ data: { sheets: Object.keys(sheets).map(title => ({ properties: { title } })) } }),
      values: { get: async ({ range }: { range: string }) => {
        calls.push(range)
        const title = range.match(/^'(.+)'!/)! [1]
        assert.ok(title in sheets)
        return { data: { values: sheets[title] } }
      } },
    } }),
  }
  const module = moduuli('./rjmobTargets.ts', {
    './winposArchive/read': { readCashArchive: async () => options.archive ?? null }, googleapis: { google }, '@/lib/rjmob': rjmob, '@/lib/rjmobTavoiteTaulukko': taulukko,
    '@/lib/rjmobMyymalaTaulukko': myymala,
    '@/lib/rjmobTavoiteDrive': { haeTavoitteet: async (order: number) => {
      calls.push(`targets:${order}`)
      if (options.failTargets) throw new Error('simulated outage')
      return { myyjat: options.targets ?? [tavoite], varoitukset: [] }
    } },
  })
  return { data: await module.loadTargets('test-file') as TargetsData, calls }
}

test('syyskuu toimii ilman Tavoitteet-välilehteä ja summaa myyjän eri myymälät', async () => {
  const { data, calls } = await hae()
  assert.ok(calls.includes('targets:202609'))
  assert.equal(data.targets.length, 1)
  const r = data.targets[0]
  assert.equal(r.nimi, 'Hamza Hanif')
  assert.equal(r.liittTavoite, 100)
  assert.equal(r.liittKpl, 30)
  assert.equal(r.kassaKate, 700)
  assert.equal(r.uusmyyntiYhteensa, 24)
  assert.equal(r.uusmyyntiPerPaiva, 4.8)
  assert.equal(r.kassaMyynti, null)
  assert.match(data.varoitukset.join(' '), /Kassamyynnin erittely puuttuu/)
})

test('tavoite ilman myyntiä ja myynti ilman tavoitetta säilyvät; puuttuva ei ole nolla', async () => {
  const { data } = await hae({ targets: [{ ...tavoite, nimi: 'Steven Sainio', liittymat: 0, fsecure: null }] })
  const steven = data.targets.find(r => r.nimi === 'Steven Sainio')!
  const hamza = data.targets.find(r => r.nimi === 'Hamza Hanif')!
  assert.equal(steven.liittTavoite, 0)
  assert.equal(steven.fsecTavoite, null)
  assert.equal(steven.liittKpl, null)
  assert.equal(steven.uusmyyntiYhteensa, null)
  assert.equal(hamza.liittTavoite, null)
  assert.equal(hamza.liittRunrate, null)
  assert.equal(hamza.liittKpl, 30)
})

test('tavoitehaun katkos ei peitä myyntiä eikä lainaa vanhaa tavoitetta', async () => {
  const { data } = await hae({ failTargets: true })
  assert.equal(data.targets[0].liittKpl, 30)
  assert.equal(data.targets[0].liittTavoite, null)
  assert.match(data.varoitukset.join(' '), /tavoitteiden haku epäonnistui/)
})

test('lokakuun ja eri vuoden tavoitteet haetaan valitulle kuukaudelle', async () => {
  for (const [month, order] of [['Lokakuu 2026', 202610], ['Syyskuu 2027', 202709]] as const) {
    const { data, calls } = await hae({ month, targets: [] })
    assert.ok(calls.includes(`targets:${order}`))
    assert.equal(data.targets[0].liittTavoite, null)
  }
})

test('puuttuva operaattorisarake ja työpäivä eivät tuota mitattua nollaa', async () => {
  const { data } = await hae({ sheets: { 'Myyjät Myymälöittäin': [['Myyjä', 'DNA uusmyynti'], ['Hamza Hanif', '0']] } })
  const r = data.targets[0]
  assert.equal(r.dnaUusmyynti, 0)
  assert.equal(r.elisaUusmyynti, null)
  assert.equal(r.uusmyyntiYhteensa, null)
  assert.equal(r.paivat, null)
  assert.equal(r.uusmyyntiPerPaiva, null)
})

test('heinäkuun vanha lähde ja korjattu kassan nimi säilyvät', async () => {
  const { data, calls } = await hae({ month: 'Myyntiseuranta 7. Heinäkuu 2026', sheets: {
    Tavoitteet: [[''], ['Myyjä', 'Liittymätavoite', 'F-Secure tavoite', 'Kassakate tavoite'], ['Hanif Hamza', '90', '8', '900']],
    'Myyjät Yhteensä': [headers, ['Hamza Hanif', '12', '50', '2', '999', '2', '3', '4', '1']],
    'Myyjät Myymälöittäin': [headers, ['Hamza Hanif', '999', '0', '0', '999', '0', '0', '0', '0']],
    Kassamyynti: [['Nimikorjaus', 'Nimi', 'Myynti', 'Palautus', 'Alennus', 'Kuitit', 'Kate(alv0)'], ['Hamza Hanif', 'lempinimi', '500', '10', '20', '3', '470']],
  } })
  assert.ok(!calls.some(c => c.startsWith('targets:')))
  assert.equal(data.targets[0].liittKpl, 12)
  assert.equal(data.targets[0].liittTavoite, 90)
  assert.equal(data.targets[0].kassaKate, 470)
  assert.equal(data.targets[0].kassaMyynti, 500)
})

test('elokuu säilyttää vanhan kassakatteen lähteen ja saa saman kuukauden Drive-tavoitteet', async () => {
  const { data, calls } = await hae({ month: 'Myyntiseuranta 8. Elokuu 2026', sheets: {
    'Myyjät Myymälöittäin': [headers, ['Hamza Hanif', '12', '50', '2', '999', '2', '3', '4', '1']],
    Kassamyynti: [['Nimi', 'Kate(alv0)'], ['Hamza Hanif', '470']],
  } })
  assert.ok(calls.includes('targets:202608'))
  assert.equal(data.targets[0].kassaKate, 470)
})

test('tuntematonta kuukautta ei korvata nykyisellä kuukaudella', async () => {
  await assert.rejects(hae({ month: 'Myyntiseuranta' }), /kuukautta ja vuotta/)
})

for (const broken of ['store', 'seller']) {
  test(`tavoitelähteen ${broken} katkos ei peitä toista lähdettä`, async () => {
    const google = {
      auth: { GoogleAuth: class {} },
      drive: () => ({ files: { list: async () => ({ data: { files: [
        { id: 'store', name: 'Syyskuu 2026', mimeType: 'sheets' },
        { id: 'seller', name: 'Myyjäkohtaiset Syyskuu 2026', mimeType: 'sheets' },
      ] } }) } }),
      sheets: () => ({ spreadsheets: {
        get: async ({ spreadsheetId }: { spreadsheetId: string }) => {
          if (spreadsheetId === broken) throw new Error('simulated outage')
          return { data: { sheets: [{ properties: { title: 'Tavoitteet' } }] } }
        }, values: { get: async () => ({ data: { values: [] } }) },
      } }),
    }
    const module = moduuli('./rjmobTavoiteDrive.ts', {
      './winposArchive/read': { readCashArchive: async () => options.archive ?? null }, googleapis: { google }, xlsx: {}, '@/lib/rjmob': rjmob,
      '@/lib/rjmobDrive': { SPREADSHEET_MIME: 'sheets' },
      '@/lib/rjmobTavoiteTaulukko': { ...taulukko,
        parseMyymalaTavoitteet: () => ({ rivit: [{ storeKey: 'Helsinki, Malmi', liittymat: 900 }], varoitukset: [] }),
        parseMyyjaTavoitteet: () => ({ rivit: [tavoite], varoitukset: [] }),
      },
    })
    const result = await module.haeTavoitteet(202609, 'Syyskuu')
    assert.equal(result.myymalat.length, broken === 'store' ? 0 : 1)
    assert.equal(result.myyjat.length, broken === 'seller' ? 0 : 1)
    assert.match(result.varoitukset.join(' '), /lukeminen epäonnistui/)
  })
}


test('Excelin otsikon ylimääräiset välilyönnit eivät kadota Elisan uusmyyntiä', async () => {
  const spaced = headers.map(h => h === 'ELISA Pakettiliittymät' ? ' ELISA  Pakettiliittymät ' : h)
  const { data } = await hae({ sheets: { 'Myyjät Myymälöittäin': [spaced, ['Hamza Hanif', '10', '50', '2', '30', '2', '3', '4', '1']] } })
  assert.equal(data.targets[0].elisaUusmyynti, 3)
  assert.equal(data.targets[0].teliaUusmyynti, 5)
  assert.equal(data.targets[0].uusmyyntiYhteensa, 10)
})


test('tyhjä Telian yritysuusmyynti on käyttäjän vahvistama nolla, virhe ei', async () => {
  for (const [cell, expected] of [['', 4], ['#N/A', null]] as const) {
    const { data } = await hae({ sheets: { 'Myyjät Myymälöittäin': [headers, ['Hamza Hanif', '10', '50', '2', '30', '2', '3', '4', cell]] } })
    assert.equal(data.targets[0].teliaUusmyynti, expected)
  }
})


test('arkiston erittely säilyttää oman päiväyksen eikä korvaa Excel-kassakatetta', async () => {
  const metadata = { tiedosto: 'Winpos 2026-09-01.xls', raporttiPvm: '2026-09-01', tilannePvm: '2026-08-31', jaksonAlku: null }
  const { data } = await hae({archive:{metadata,rows:[{nimi:'Hamza Hanif',myynti:1234,palautus:-20,alennus:-10,kuitit:12,kate:999}]}})
  const r = data.targets[0]
  assert.equal(r.kassaMyynti,1234);assert.equal(r.kassaPalautus,-20);assert.equal(r.kassaAlennus,-10);assert.equal(r.kassaKuitit,12)
  assert.equal(r.kassaKate,700)
  assert.deepEqual(data.kassaRaportti,metadata)
})
