"""Loopback-only preview, own Redis Unix socket, clean child environments.
No model bridge or Telegram adapter is started. Optional Drive key must be supplied
as a file; no production Redis/session/bridge environment is inherited.
"""
import base64,http.server,json,os,secrets,signal,sqlite3,subprocess,threading,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
STATE=Path('/home/arxcian-codex/arxcian-work/acceptance-preview')
RUNTIME=Path('/tmp/arxcian-checklist-redis/runtime')

def run():
 os.umask(0o077)
 for name in ('.env','.env.local','.env.production','.env.production.local'):
  if (ROOT/name).exists():raise SystemExit('Refuse preview: app .env file could import production credentials')
 STATE.mkdir(mode=0o700,exist_ok=True)
 if (STATE/'redis.sock').exists():raise SystemExit('Existing socket: refuse concurrent preview')
 credentials=STATE/'browser-credentials.json'
 if not credentials.exists():credentials.write_text(json.dumps({'albin':secrets.token_hex(8),'arbnor':secrets.token_hex(8),'session':secrets.token_hex(32),'redis':secrets.token_hex(32),'bridge':secrets.token_hex(32)}))
 os.chmod(credentials,0o600);cfg=json.loads(credentials.read_text())
 children=[]
 redis_env={'PATH':'/usr/bin:/bin','LD_LIBRARY_PATH':str(RUNTIME/'usr/lib/x86_64-linux-gnu')}
 socket=STATE/'redis.sock'
 def command(args):
  if not isinstance(args,list) or not args or len(args)>10000:raise ValueError('invalid command')
  output=subprocess.check_output([str(RUNTIME/'usr/bin/redis-cli'),'--json','-s',str(socket),*[str(x) if not isinstance(x,(dict,list)) else json.dumps(x,separators=(',',':')) for x in args]],env=redis_env,timeout=15)
  return json.loads(output)
 class Handler(http.server.BaseHTTPRequestHandler):
  def log_message(self,*args):pass
  def do_POST(self):
   if self.headers.get('Authorization')!='Bearer '+cfg['redis']:self.send_error(401);return
   try:
    length=int(self.headers.get('Content-Length','0'))
    if not 0<length<2000000:raise ValueError('invalid size')
    payload=json.loads(self.rfile.read(length))
    def encode(v):
     if isinstance(v,str) and self.headers.get('Upstash-Encoding')=='base64':return base64.b64encode(v.encode()).decode()
     if isinstance(v,list):return [encode(x) for x in v]
     return v
    def execute(args):return {'result':encode(command(args))}
    if self.path=='/pipeline':result=[execute(x) for x in payload]
    elif self.path=='/':result=execute(payload)
    else:self.send_error(404);return
    raw=json.dumps(result).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
   except Exception:self.send_error(503,'Isolated Redis command failed')
 rest=http.server.ThreadingHTTPServer(('127.0.0.1',3301),Handler)
 try:
  children.append(subprocess.Popen([str(RUNTIME/'usr/bin/redis-server'),'--port','0','--unixsocket',str(socket),'--unixsocketperm','700','--save','','--appendonly','no','--dir',str(STATE)],env=redis_env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
  for _ in range(50):
   try:
    if command(['PING'])=='PONG':break
   except Exception:time.sleep(.05)
  else:raise RuntimeError('Isolated Redis failed to start')
  threading.Thread(target=rest.serve_forever,daemon=True).start()
  env={'PATH':'/home/arxcian-codex/.local/node-v24.21.0-linux-x64/bin:/usr/bin:/bin','NODE_ENV':'production','SESSION_SECRET':cfg['session'],'ALBIN_PIN':cfg['albin'],'ARBNOR_PIN':cfg['arbnor'],'KV_REST_API_URL':'http://127.0.0.1:3301','KV_REST_API_TOKEN':cfg['redis'],'ORACLE_BRIDGE_SECRET':cfg['bridge'],'ARXCIAN_CHECKLIST_ENABLED':'true'}
  key=STATE/'drive-readonly.json'
  if key.exists():
   if key.stat().st_mode & 0o077:raise RuntimeError('Drive key must have mode 0600')
   env['GOOGLE_SERVICE_ACCOUNT_KEY']=json.dumps(json.loads(key.read_text()))
  children.append(subprocess.Popen(['node',str(ROOT/'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3300'],cwd=ROOT,env=env))
  (STATE/'status.json').write_text(json.dumps({'url':'http://localhost:3300','bind':'127.0.0.1','redis':'own Unix socket, no persistence','drive_key_present':key.exists(),'real_oracle_connected':False,'telegram_connected':False,'user_acceptance_ready':False}))
  print('Loopback preview http://localhost:3300; full acceptance NOT ready',flush=True)
  children[-1].wait()
 finally:
  rest.shutdown();rest.server_close()
  for child in reversed(children):
   if child.poll() is None:
    child.terminate()
    try:child.wait(timeout=10)
    except subprocess.TimeoutExpired:child.kill();child.wait()
  socket.unlink(missing_ok=True)
if __name__=='__main__':
 def stop(*args):raise KeyboardInterrupt
 signal.signal(signal.SIGTERM,stop)
 try:run()
 except KeyboardInterrupt:pass
