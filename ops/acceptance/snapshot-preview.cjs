// Authenticated readonly browser view of a REAL captured Drive snapshot.
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const native = createRequire(path.resolve(__dirname,'../../package.json'))
const { unsealData } = native('iron-session')
const state = '/home/arxcian-codex/arxcian-work/acceptance-preview'
const credentials = JSON.parse(fs.readFileSync(state+'/browser-credentials.json','utf8'))
const capture = JSON.parse(fs.readFileSync(state+'/drive-view-capture.json','utf8'))
const snapshots = new Map(capture.snapshots.map(s=>[s.file.id,s]))
async function user(req) {
  try {
    const cookie = (req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('arxcian_session='))
    if (!cookie) return null
    const session = await unsealData(decodeURIComponent(cookie.slice('arxcian_session='.length)), {password:credentials.session,ttl:30*86400})
    return ['albin','arbnor'].includes(session.user) && (!session.expiresAt || session.expiresAt>Date.now()) ? session.user : null
  } catch { return null }
}
function json(res,status,data) {
  res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-arxcian-test-data':'captured Drive snapshot','x-arxcian-snapshot-time':capture.capturedAt})
  res.end(JSON.stringify(data))
}
const server = http.createServer(async(req,res)=>{
  try {
    if (!/^(localhost|127\.0\.0\.1):[0-9]{1,5}$/.test(req.headers.host || '')) return json(res,403,{error:'Testipalvelun host ei ole sallittu.'})
    const url = new URL(req.url,'http://localhost:3302')
    const p = url.pathname
    if (req.method==='GET' && p==='/arxcian') {res.writeHead(307,{location:'/arxcian/rj-mob/etela','cache-control':'no-store'});return res.end()}
    if (req.method==='GET' && p==='/') {res.writeHead(302,{location:'/acceptance'});return res.end()}
    if (req.method==='GET' && p==='/acceptance') {
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"})
      return res.end('<!doctype html><html lang="fi"><meta charset="utf-8"><title>Arxcian — testiversio</title><body><h1>Arxcianin eristetty lukutesti</h1><p>Oikeasta Drivestä otettu syyskuun 2026 lukukuva: '+capture.capturedAt+'. Tämä on tallennettu lukutilanne, ei jatkuvasti päivittyvä tuotantodata.</p><p>Oracle- ja Telegram-testiyhteys eivät ole vielä käytössä.</p><p><a href="/login">Kirjaudu testitunnuksella</a> · <a href="/arxcian/rj-mob/etela">Myyntiseuranta</a> · <a href="/arxcian/personal/checklist">Käyttötestilista</a></p></body></html>')
    }
    if (['/api/files','/api/sheets','/api/runrate','/api/targets'].includes(p)) {
      if (req.method!=='GET') return json(res,405,{error:'Lukutestissä sallitaan vain GET.'})
      if (!await user(req)) return json(res,401,{error:'Kirjaudu erillisellä testitunnuksella.'})
      if(p==='/api/files') return json(res,200,{files:capture.snapshots.map(s=>s.file)})
      const snapshot=snapshots.get(url.searchParams.get('fileId'))
      if(!snapshot) return json(res,404,{error:'Tätä kuukautta ei ole testin lukukuvassa.'})
      const field={'/api/sheets':'dash','/api/runrate':'runrate','/api/targets':'targets'}[p]
      return snapshot[field] ? json(res,200,snapshot[field]) : json(res,503,{error:'Lähdeluku puuttuu lukukuvasta.'})
    }
    if(p.startsWith('/api/arxcian/oracle/')) {
      if(!await user(req)) return json(res,401,{error:'Kirjaudu testitunnuksella.'})
      return json(res,503,{error:'Oikeaa eristettyä testioraclea ei ole vielä kytketty.'})
    }
    const allowed = req.method==='GET' && (['/login','/arxcian/rj-mob/etela','/arxcian/personal/checklist','/api/arxcian/personal/checklist'].includes(p) || p.startsWith('/_next/') || p==='/favicon.ico') || req.method==='POST' && ['/api/login','/api/logout','/api/arxcian/personal/checklist'].includes(p)
    if(!allowed) return json(res,403,{error:'Tämä toiminto ei kuulu eristettyyn testiversioon.'})
    const headers={...req.headers};delete headers['accept-encoding']
    headers['x-forwarded-host']=req.headers.host;headers['x-forwarded-proto']='http';delete headers['x-real-ip']
    const upstream = http.request({hostname:'127.0.0.1',port:3300,path:req.url,method:req.method,headers},response=>{
      res.writeHead(response.statusCode,{...response.headers,'cache-control':'no-store','x-arxcian-test-data':'captured Drive snapshot'})
      response.pipe(res)
    })
    upstream.on('error',()=>{if(!res.headersSent)json(res,503,{error:'Paikallinen testisovellus ei vastaa.'});else res.destroy()})
    req.pipe(upstream)
  }catch {if(!res.headersSent)json(res,503,{error:'Testipalvelun pyyntö epäonnistui.'});else res.destroy()}
})
server.listen(3302,'127.0.0.1',()=>console.log('Readonly snapshot browser preview http://localhost:3302/acceptance'))
process.on('SIGTERM',()=>server.close())
