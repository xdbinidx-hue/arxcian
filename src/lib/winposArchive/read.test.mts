import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
test('arkisto lukee yhden uusimman raportin, ei summaa kertymiä tai käytä tulevan kuukauden raporttia', async () => {
  const downloads: string[] = []
  const exports: Record<string,any> = {}
  const code=ts.transpileModule(readFileSync(new URL('./read.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const dependencies: Record<string,unknown> = {
    googleapis:{google:{auth:{GoogleAuth:class {constructor(options:any){assert.equal(JSON.stringify(options.scopes),JSON.stringify(['https://www.googleapis.com/auth/drive.readonly']))}}},drive:()=>({files:{list:async()=>({data:{files:[{id:'older',name:'Winpos 2026-08-31.xls'},{id:'latest',name:'Winpos 2026-09-01.xls'},{id:'future',name:'Winpos 2026-10-02.xls'}]}})}})}},
    '../rjmobDrive':{downloadDriveFile:async(id:string)=>{downloads.push(id);return Buffer.from('fixture')}},
    './parser':{parseWinposReport:()=>({myyjat:[{nimi:'Hamza Hanif',myynti:1234}]})},
  }
  runInNewContext(code,{exports,Buffer,process:{env:{GOOGLE_SERVICE_ACCOUNT_KEY:'{}'}},require:(name:string)=>{assert.ok(name in dependencies);return dependencies[name]}})
  const report=await exports.readCashArchive(202609)
  assert.deepEqual(downloads,['latest']);assert.equal(report.metadata.tilannePvm,'2026-08-31');assert.equal(report.metadata.jaksonAlku,null)
  assert.equal(exports.selectReport([{id:'future',name:'Winpos 2026-09-01.xls'}],202607),undefined)
})
