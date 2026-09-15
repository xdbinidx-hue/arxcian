const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module')
const root=path.resolve(__dirname,'../..'),req=Module.createRequire(root+'/package.json')
const state='/home/arxcian-codex/arxcian-work/acceptance-preview'
const credentials=JSON.parse(fs.readFileSync(state+'/browser-credentials.json','utf8'))
const capture=JSON.parse(fs.readFileSync(state+'/drive-view-capture.json','utf8')),snapshot=capture.snapshots[0]
const base='http://127.0.0.1:3302',network=global.fetch
async function main(){
 const hostStatus=host=>new Promise((resolve,reject)=>{const request=require('node:http').get(base+'/acceptance',{headers:{host}},response=>{response.resume();resolve(response.statusCode)});request.on('error',reject)})
 assert.equal(await hostStatus('localhost:61434'),200)
 assert.equal(await hostStatus('untrusted.example:61434'),403)
 const entry=await network(base+'/arxcian',{redirect:'manual'});assert.equal(entry.status,307);assert.equal(entry.headers.get('location'),'/arxcian/rj-mob/etela')
 assert.equal((await network(base+'/api/files')).status,401)
 let cookie
 for(const username of ['albin','arbnor']){
  const login=await network(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password:credentials[username]})});assert.equal(login.status,200)
  const ownCookie=login.headers.get('set-cookie').split(';')[0]
  const files=await network(base+'/api/files',{headers:{cookie:ownCookie}});assert.equal(files.status,200);assert.equal(files.headers.get('cache-control'),'no-store');assert.deepEqual((await files.json()).files,capture.snapshots.map(s=>s.file))
  if(username==='albin')cookie=ownCookie
 }
 const mutation=cookie.indexOf('=')+40
 const tampered=cookie.slice(0,mutation)+(cookie[mutation]==='a'?'b':'a')+cookie.slice(mutation+1)
 assert.equal((await network(base+'/api/files',{headers:{cookie:tampered}})).status,401)
 for(const [endpoint,field] of [['sheets','dash'],['runrate','runrate'],['targets','targets']]){
  const response=await network(base+'/api/'+endpoint+'?fileId='+snapshot.file.id,{headers:{cookie}});assert.equal(response.status,200);assert.deepEqual(await response.json(),snapshot[field])
 }
 assert.equal((await network(base+'/api/sheets?fileId=unavailable',{headers:{cookie}})).status,404)
 assert.equal((await network(base+'/api/webhook/register',{headers:{cookie}})).status,403)
 assert.equal((await network(base+'/api/arxcian/oracle/messages',{method:'POST',headers:{cookie,'content-type':'application/json'},body:'{}'})).status,503)
 const {JSDOM}=require('/tmp/arxcian-ui-tests/node_modules/jsdom')
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:3302/arxcian/rj-mob/etela'})
 global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;global.IS_REACT_ACT_ENVIRONMENT=true
 const React=req('react'),{createRoot}=req('react-dom/client'),ts=req('typescript')
 let query='',calls=0,app
 const render=()=>app.render(React.createElement(Page))
 const nav={usePathname:()=>'/arxcian/rj-mob/etela',useSearchParams:()=>new URLSearchParams(query),useRouter:()=>({push:url=>{query=url.split('?')[1]||'';render()}})}
 const resolve=Module._resolveFilename,load=Module._load
 Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?root+'/src/'+name.slice(2):name,parent,...rest)}
 Module._load=function(name,parent,...rest){if(name==='next/navigation')return nav;return load.call(this,name,parent,...rest)}
 for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file)
 global.fetch=(url,options={})=>{const target=new URL(url,base);assert.equal(target.origin,base);assert.equal(options.method||'GET','GET');assert(['/api/files','/api/sheets','/api/runrate','/api/targets'].includes(target.pathname));calls++;return network(target,{...options,headers:{...options.headers,cookie}})}
 const Page=req(root+'/src/app/arxcian/rj-mob/etela/page.tsx').default
 const view=req(root+'/src/lib/arxcian/rjmobView.ts');let browserData;const originalData=view.rjMobViewData;view.rjMobViewData=(...args)=>{browserData=originalData(...args);return browserData};app=createRoot(document.getElementById('root'))
 for(const name of ['tavoitteet','uusmyynti','kassamyynti']){
  query='nakyma='+name;await React.act(async()=>render())
  let matches=false
  for(let i=0;i<100;i++){
   await React.act(async()=>new Promise(r=>setTimeout(r,10)))
   const selection=view.getRjMobSelection()
   if(selection?.fileId===snapshot.file.id && selection.view===name && selection.fingerprint===snapshot.views[name].fingerprint){matches=true;break}
  }
  if(!matches){fs.writeFileSync(state+'/snapshot-ui-diagnostic.json',JSON.stringify({view:name,browserData,expected:snapshot.views[name].data}),{mode:0o600});const selection=view.getRjMobSelection();console.error(JSON.stringify({diagnostic:true,view:name,fileMatches:selection?.fileId===snapshot.file.id,viewMatches:selection?.view===name,hasFingerprint:Boolean(selection?.fingerprint),tableRendered:Boolean(document.querySelector('table')),sourceHashReproducible:view.viewFingerprint(snapshot.views[name].data)===snapshot.views[name].fingerprint}))}
  assert(matches,'Actual page fingerprint must match captured Drive view: '+name)
  assert(document.querySelector('table'),'Actual table must render')
  if(name==='kassamyynti' && snapshot.targets.kassaRaportti) assert(document.body.textContent.includes(snapshot.targets.kassaRaportti.tilannePvm),'Actual cash page must show archive cutoff')
 }
 await React.act(async()=>app.unmount())
 console.log(JSON.stringify({passed:true,actualHttpSnapshot:true,anonymousAndTamperedRejected:true,bothUsersSharedData:true,unknownFileRejected:true,writeRouteBlocked:true,unconnectedOracle503:true,actualReactPageAllThreeFingerprintsMatchDriveCapture:true,domHttpRequests:calls,productionWrites:false,realOracleCompared:false}))
}
main().catch(e=>{console.error(JSON.stringify({passed:false,errorClass:e.constructor?.name,failedCheck:e.message.startsWith('Actual')?e.message.split('\n')[0]:null,code:e.code||null,operator:e.operator||null,actualStatus:typeof e.actual==='number'?e.actual:null,expectedStatus:typeof e.expected==='number'?e.expected:null}));process.exit(1)})
