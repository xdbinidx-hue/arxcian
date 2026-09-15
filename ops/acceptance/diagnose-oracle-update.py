"""Read-only failed-update diagnostics; no restarts or secret/log contents."""
import ast,hashlib,json,os
from pathlib import Path
base=Path('/opt/data/private/arxcian/oracle-production');source=base/'supervisor.py'
raw=source.read_bytes();assert hashlib.sha256(raw).hexdigest()=='54185f029942771792d3e4aec8fc3fb3fab048ba38caf8f66f988c3ad9d6b860'
ns={'__name__':'diagnostic_only','__file__':str(source)};exec(compile(raw,str(source),'exec'),ns)
report={'read_only':True,'credentials_exported':False,'log_contents_exported':False,'supervisor_processes':0,'bridge_processes':0,'state_gates':[],'files':[]}
for p in Path('/proc').iterdir():
 if not p.name.isdigit():continue
 try:
  args=(p/'cmdline').read_bytes().split(b'\0')
  if p.stat().st_uid!=os.getuid():continue
  if str(source).encode() in args and b'--stop' not in args:report['supervisor_processes']+=1
  if str(base/'release-9f26dc0/oracle-bridge.mjs').encode() in args:report['bridge_processes']+=1
 except OSError:pass
try:
 env=ns['load_config'](base/'config.json');report['config_valid']=True;report['config_key_names']=sorted(env)
 report['hermes_oracle_scope']=env.get('HERMES_API_URL','').rstrip('/').endswith('/p/oracle')
except Exception as e:report['config_valid']=False;report['config_error_class']=type(e).__name__
for n in ast.walk(ast.parse(raw)):
 if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='exists':
  v=n.func.value
  if isinstance(v,ast.BinOp) and isinstance(v.op,ast.Div) and isinstance(v.left,ast.Name) and v.left.id=='state' and isinstance(v.right,ast.Constant) and isinstance(v.right.value,str):
   name=v.right.value
   if Path(name).name==name:report['state_gates'].append({'name':name,'exists':(base/name).exists()})
for name in ['oracle-bridge.mjs','oracle-bridge-lib.mjs']:
 p=base/'release-9f26dc0'/name;report['files'].append({'name':name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
backups=sorted(base.glob('bridge-rollback-*'));report['backup_count']=len(backups)
if backups:
 b=backups[-1];m=json.loads((b/'manifest.json').read_text());report['latest_backup']=str(b);report['live_matches_latest_backup']=all(hashlib.sha256((base/'release-9f26dc0'/n).read_bytes()).hexdigest()==sha for n,sha in m.items())
p=base/'release-f8ef88d-supervisor.log';report['supervisor_log_present']=p.is_file()
if p.is_file():report['supervisor_log_line_count']=len(p.read_bytes().splitlines())
print(json.dumps(report))
