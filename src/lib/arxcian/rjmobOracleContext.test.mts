import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as view from './rjmobView.ts'

function resolver(options: { failSales?: boolean; failTargets?: boolean; failRunrate?: boolean } = {}) {
  const calls: string[] = []
  const exports: any = {}
  const files = [202609, 202610, 202612, 202701].map(month => ({ id: `month_${month}`, mimeType: 'sheet' }))
  const dependencies: Record<string, unknown> = {
    '../rjmobDrive': { listSeurantaFiles: async () => files, SPREADSHEET_MIME: 'sheet' },
    '../rjmobSheets': { loadDashData: async (id: string) => { calls.push(`sales:${id}`); if(options.failSales) throw Error('private'); return { kuukausi: id, sellers: [], stores: {}, puutteet: [] } } },
    '../rjmobRunRate': { loadRunRate: async (id: string) => { calls.push(`runrate:${id}`); if(options.failRunrate) throw Error('private'); return { kuukausi: id, tyopaivat: { paattyneet: 0, kaikki: 0 }, tavoitteet: { myymalat: [], myyjat: [], yhteensa: { liittymat: null, fsecure: null, kassakate: null } }, myyjaVuorot: {}, varoitukset: [] } } },
    '../rjmobTargets': { loadTargets: async (id: string) => { calls.push(`targets:${id}`); if(options.failTargets) throw Error('private'); return { kuukausi: id, targets: [], varoitukset: [] } } },
    './rjmobView': view,
  }
  const code = ts.transpileModule(readFileSync(new URL('./rjmobOracleContext.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { exports, require(name: string) { assert.ok(name in dependencies, `Odottamaton I/O: ${name}`); return dependencies[name] } })
  return { resolve: exports.resolveRjMobOracleContext, calls }
}
for (const month of [202609, 202610, 202612, 202701]) test(`palvelin käyttää valittua kuukautta ${month} kaikissa lukijoissa`, async () => {
  const { resolve, calls } = resolver()
  const selection = { route: '/arxcian/rj-mob/etela', fileId: `month_${month}`, view: 'kassamyynti' }
  const context = await resolve(selection, 'albin')
  assert.equal(context.month, selection.fileId)
  assert.deepEqual(calls.sort(), [`runrate:${selection.fileId}`, `sales:${selection.fileId}`, `targets:${selection.fileId}`])
  assert.equal(context.data.total.toteuma, null)
  assert.ok(context.capturedAt)
})
test('käyttäjä- ja tiedostorajat tarkistetaan ennen myyntitiedon lukua', async () => {
  const { resolve, calls } = resolver()
  const selection = { route: '/arxcian/rj-mob/etela', fileId: 'private_file', view: 'tavoitteet' }
  await assert.rejects(resolve(selection, 'albin'))
  await assert.rejects(resolve({ ...selection, fileId: 'month_202609' }, 'unknown'))
  assert.deepEqual(calls, [])
})
test('lukuvirheet ovat puuttuvaa tietoa; muuttunut näkymä estää lähetyksen', async () => {
  const selection = { route: '/arxcian/rj-mob/etela', fileId: 'month_202609', view: 'kassamyynti' }
  const { resolve } = resolver({ failSales: true, failTargets: true, failRunrate: true })
  const context = await resolve(selection, 'arbnor')
  assert.equal(context.data.sellers, null)
  assert.equal(context.data.total.toteuma, null)
  assert.equal(context.warnings.length, 3)
  assert.ok(!JSON.stringify(context).includes('private'))
  await assert.rejects(resolve({ ...selection, fingerprint: '00000000' }, 'albin'))
})
