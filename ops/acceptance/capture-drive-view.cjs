// Real current readers, readonly Google scopes, no app or model process.
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const root = path.resolve(__dirname, '../..')
const state = '/home/arxcian-codex/arxcian-work/acceptance-preview'
const native = Module.createRequire(root + '/package.json')
const ts = native('typescript')
const sdk = native('googleapis')
const allowed = new Set(['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'])
const OriginalAuth = sdk.google.auth.GoogleAuth
sdk.google.auth.GoogleAuth = new Proxy(OriginalAuth, { construct(target, args) {
  const scopes = args[0]?.scopes
  if (!Array.isArray(scopes) || !scopes.length || scopes.some(s => !allowed.has(s))) throw new Error('Readonly scope guard refused auth')
  return Reflect.construct(target, args)
}})
const responses = []
for (const factory of ['sheets', 'drive']) {
  const original = sdk.google[factory].bind(sdk.google)
  sdk.google[factory] = (...args) => {
    const client = original(...args)
    const objects = factory === 'sheets' ? [client.spreadsheets, client.spreadsheets.values] : [client.files]
    for (const object of objects) {
      for (const method of ['get', 'list', 'batchGet', 'export']) {
        if (typeof object?.[method] !== 'function') continue
        const read = object[method].bind(object)
        object[method] = async (...params) => {
          const result = await read(...params)
          const p = params[0] || {}
          responses.push({factory, method, fileId:p.fileId || p.spreadsheetId || null, range:p.range || p.ranges || null, data:Buffer.isBuffer(result.data) ? {binaryBytes:result.data.length} : result.data})
          return result
        }
      }
    }
    return client
  }
}
const cache = new Map()
function load(filename) {
  filename = path.resolve(filename)
  if (!filename.startsWith(root + '/src/')) throw new Error('Source boundary exceeded')
  if (cache.has(filename)) return cache.get(filename).exports
  const mod = new Module(filename)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  cache.set(filename, mod)
  mod.require = name => {
    if (name.startsWith('@/') || name.startsWith('.')) {
      let target = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(filename), name)
      for (const suffix of ['', '.ts', '/index.ts']) {
        if (fs.existsSync(target + suffix) && fs.statSync(target + suffix).isFile()) return (target + suffix).endsWith('.ts') ? load(target + suffix) : native(target + suffix)
      }
      throw new Error('Source dependency not found')
    }
    return native(name)
  }
  mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename)
  return mod.exports
}
async function main() {
  if (process.argv.includes('--recompute-only')) {
    const filename = state + '/drive-view-capture.json'
    const capture = JSON.parse(fs.readFileSync(filename, 'utf8'))
    const view = load(root + '/src/lib/arxcian/rjmobView.ts')
    for (const snapshot of capture.snapshots) {
      const comparisons = view.rjMobComparisons(snapshot.dash, snapshot.runrate, snapshot.targets.targets)
      snapshot.views = Object.fromEntries(['tavoitteet','uusmyynti','kassamyynti'].map(name => {
        const data = view.rjMobViewData(name, comparisons, snapshot.targets.targets, snapshot.targets.kassaRaportti ?? null)
        return [name, {data, fingerprint:view.viewFingerprint(data)}]
      }))
    }
    capture.calculationsRecomputedAt = new Date().toISOString()
    fs.writeFileSync(filename, JSON.stringify(capture), {mode:0o600})
    console.log(JSON.stringify({passed:true,recomputedOnly:true,googleCalls:0,originalCaptureTimePreserved:true}))
    return
  }
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY = fs.readFileSync(state + '/drive-candidate.json','utf8')
  const drive = load(root + '/src/lib/rjmobDrive.ts')
  const files = await drive.listSeurantaFiles()
  const months = files.filter(f => f.mimeType === drive.SPREADSHEET_MIME).sort((a,b) => drive.monthOrder(a.name || '') - drive.monthOrder(b.name || ''))
  const september = months.find(f => drive.monthOrder(f.name || '') === 202609)
  const next = months.find(f => drive.monthOrder(f.name || '') > 202609)
  if (!september) throw new Error('September source unavailable')
  const {loadDashData} = load(root + '/src/lib/rjmobSheets.ts')
  const {loadRunRate} = load(root + '/src/lib/rjmobRunRate.ts')
  const {loadTargets} = load(root + '/src/lib/rjmobTargets.ts')
  const view = load(root + '/src/lib/arxcian/rjmobView.ts')
  const snapshots = []
  for (const file of [september,next].filter(Boolean)) {
    const results = await Promise.allSettled([loadDashData(file.id),loadRunRate(file.id),loadTargets(file.id)])
    const [dash,runrate,targets] = results.map(r => r.status === 'fulfilled' ? r.value : null)
    const comparisons = view.rjMobComparisons(dash || {sellers:[],stores:{}},runrate,targets?.targets || [])
    snapshots.push({file,capturedAt:new Date().toISOString(),readers:results.map(r => r.status),dash,runrate,targets,views:Object.fromEntries(['tavoitteet','uusmyynti','kassamyynti'].map(name => {const data=view.rjMobViewData(name,comparisons,targets?.targets ?? null, targets?.kassaRaportti ?? null);return [name,{data,fingerprint:view.viewFingerprint(data)}]}))})
  }
  const after = await drive.listSeurantaFiles()
  for (const s of snapshots) s.sourceModifiedTimeUnchanged = after.find(f => f.id === s.file.id)?.modifiedTime === s.file.modifiedTime
  const output = {capturedAt:new Date().toISOString(),readOnlyScopeGuard:true,applicationActivated:false,oracleAnswerCompared:false,nextAvailableMonthPresent:Boolean(next),files:months,snapshots,responses}
  fs.writeFileSync(state + '/drive-view-capture.json',JSON.stringify(output),{mode:0o600})
  console.log(JSON.stringify({passed:snapshots.every(s=>s.readers.every(r=>r==='fulfilled') && s.sourceModifiedTimeUnchanged),snapshotCount:snapshots.length,nextAvailableMonthPresent:Boolean(next),readOnlyScopeGuard:true,readers:snapshots.map(s=>({month:drive.monthOrder(s.file.name),statuses:s.readers,sourceModifiedTimeUnchanged:s.sourceModifiedTimeUnchanged})),responseCount:responses.length,applicationActivated:false,oracleAnswerCompared:false}))
}
main().catch(error=>{console.error(JSON.stringify({passed:false,errorClass:error?.constructor?.name,httpStatus:typeof error?.response?.status==='number'?error.response.status:null}));process.exitCode=1})
