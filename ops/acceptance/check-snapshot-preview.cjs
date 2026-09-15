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
 let query='',calls=0,app,heldPath,releaseHeld,heldReached
 const render=()=>app.render(React.createElement(Page))
 const nav={usePathname:()=>'/arxcian/rj-mob/etela',useSearchParams:()=>new URLSearchParams(query),useRouter:()=>({push:url=>{query=url.split('?')[1]||'';render()}})}
 const resolve=Module._resolveFilename,load=Module._load
 Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?root+'/src/'+name.slice(2):name,parent,...rest)}
 Module._load=function(name,parent,...rest){if(name==='next/navigation')return nav;return load.call(this,name,parent,...rest)}
 for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file)
 global.fetch=(url,options={})=>{const target=new URL(url,base);assert.equal(target.origin,base);assert.equal(options.method||'GET','GET');assert(['/api/files','/api/sheets','/api/runrate','/api/targets'].includes(target.pathname));calls++;if(target.pathname===heldPath){heldReached=true;return new Promise(resolve=>{releaseHeld=()=>resolve(network(target,{...options,headers:{...options.headers,cookie}}))})}return network(target,{...options,headers:{...options.headers,cookie}})}
 const Page=req(root+'/src/app/arxcian/rj-mob/etela/page.tsx').default
 const view=req(root+'/src/lib/arxcian/rjmobView.ts');let browserData;const originalData=view.rjMobViewData;view.rjMobViewData=(...args)=>{browserData=originalData(...args);return browserData};app=createRoot(document.getElementById('root'))
 for(const delayed of ['/api/runrate','/api/sheets']){
  heldPath=delayed;heldReached=false;releaseHeld=undefined
  query='nakyma=tavoitteet';await React.act(async()=>render())
  for(let i=0;i<100;i++){await React.act(async()=>new Promise(r=>setTimeout(r,10)));if(heldReached && releaseHeld && calls>=4)break}
  assert(heldReached,'Delayed request must be reached')
  await React.act(async()=>new Promise(r=>setTimeout(r,100)))
  assert(!document.querySelector('table'),'No sales or runrate table may appear before both readers settle')
  assert(document.body.textContent.includes('Ladataan...'),'Shared loading indicator must be visible')
  heldPath=undefined;await React.act(async()=>releaseHeld())
  for(let i=0;i<100 && !document.querySelector('table');i++) await React.act(async()=>new Promise(r=>setTimeout(r,10)))
  assert(document.querySelector('table'),'Tables must appear after shared load completes')
  assert(document.body.textContent.includes('Myyjät — Run Rate'),'Runrate must appear at shared completion')
  assert(document.body.textContent.includes('Myyjät — '+snapshot.dash.kuukausi),'Sales tracking must appear at shared completion')
  assert(document.body.textContent.includes('Myynti & Runrate'),'Capitalized view title must appear')
  await React.act(async()=>app.unmount());app=createRoot(document.getElementById('root'))
 }
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
  if(name==='tavoitteet'){
    assert(![...document.querySelectorAll('th')].some(h=>h.textContent==='Liitt teho'||h.textContent==='Total teho'),'Only combined sales efficiency must remain')
    const text=document.body.textContent
    assert(text.indexOf('Viikkoviesti tiimille') < text.indexOf('Myynti & Runrate'),'Message generation must precede view buttons')
    assert(!text.includes('Basri Salihi'),'Former seller must be absent for September')
    const table=[...document.querySelectorAll('table')].find(t=>t.textContent.includes('Liitt+Kassa teho') && t.textContent.includes('Provisio yht.'))
    assert(table,'Sales tracking table must remain visible')
    for(const seller of snapshot.dash.sellers){
      const row=[...table.querySelectorAll('tbody tr')].find(r=>r.children[1]?.textContent===seller.nimi)
      if(!row)continue
      const expected=seller.fsecKpl>=10?'rgb(234, 243, 222)':seller.fsecKpl>=5?'rgb(254, 249, 195)':'rgb(254, 226, 226)'
      assert.equal(row.children[5].style.background,expected,'Count cell must use quantity band')
      assert.equal(row.children[4].style.background,expected,'Euro cell must use same quantity band')
      assert.equal(row.children[4].style.color,row.children[5].style.color)
      if(seller.tyyppi!=='owner' && seller.tunnit>0 && Number.isFinite(seller.myyntiTeho) && seller.myyntiTeho<7) assert.equal(row.style.background,'rgb(253, 236, 236)','Measured efficiency below seven must mark the row red')
    }
  }
  if(name==='kassamyynti' && snapshot.targets.kassaRaportti) assert(document.body.textContent.includes(snapshot.targets.kassaRaportti.tilannePvm),'Actual cash page must show archive cutoff')
 }
 const beforeRefresh=calls
 Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'})
 await React.act(async()=>window.dispatchEvent(new window.Event('focus')))
 for(let i=0;i<100 && (calls<beforeRefresh+3 || !view.getRjMobSelection());i++) await React.act(async()=>new Promise(r=>setTimeout(r,10)))
 assert(calls>=beforeRefresh+3,'Focusing the page must refresh all three data readers')
 await React.act(async()=>app.unmount())
 console.log(JSON.stringify({passed:true,actualHttpSnapshot:true,bothReaderArrivalOrdersHiddenUntilReady:true,focusRefreshesAllThreeReaders:true,anonymousAndTamperedRejected:true,bothUsersSharedData:true,unknownFileRejected:true,writeRouteBlocked:true,unconnectedOracle503:true,actualReactPageAllThreeFingerprintsMatchDriveCapture:true,domHttpRequests:calls,productionWrites:false,realOracleCompared:false}))
}
main().catch(e=>{console.error(JSON.stringify({passed:false,errorClass:e.constructor?.name,failedCheck:e.message.startsWith('Actual')?e.message.split('\n')[0]:null,code:e.code||null,operator:e.operator||null,actualStatus:typeof e.actual==='number'?e.actual:null,expectedStatus:typeof e.expected==='number'?e.expected:null}));process.exit(1)})
