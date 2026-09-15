"""Read-only metadata; never exports env values, messages or task contents."""
import hashlib,json,os
from pathlib import Path

def sha(p):
 try:return hashlib.sha256(p.read_bytes()).hexdigest()
 except OSError:return None
report={'version':1,'read_only':True,'sources':{},'runtime':[],'unknown':['effective_profile_authorization','dashboard_external_access','production_restore_point']}
for name in ('hermes_cli/profiles.py','gateway/run.py','gateway/authz_mixin.py','gateway/status.py'):
 p=Path('/opt/hermes')/name
 report['sources'][name]={'sha256':sha(p)}
 # Only the missing static profiles module is exported; no config or supervisor contents.
 if name=='hermes_cli/profiles.py' and p.is_file():report['sources'][name]['source']=p.read_text()
p=Path('/opt/data/private/arxcian/oracle-production/supervisor.py')
report['sources']['oracle_supervisor']={'sha256':sha(p)}
roots={Path('/opt/data'),Path('/opt/data/.hermes')}
for proc in Path('/proc').glob('[0-9]*'):
 try:
  args=(proc/'cmdline').read_bytes().split(b'\0')
  if not any(b'gateway/run.py' in a or a==b'gateway' for a in args):continue
  env=dict(x.split(b'=',1) for x in (proc/'environ').read_bytes().split(b'\0') if b'=' in x)
  home=env.get(b'HERMES_HOME',b'').decode()
  if home.startswith('/'):roots.add(Path(home))
 except OSError:pass
for root in sorted(roots):
 p=root/'gateway_state.json'
 try:
  data=json.loads(p.read_text());pid=data.get('pid')
  profiles=data.get('served_profiles')
  report['runtime'].append({'home':str(root),'pid':pid,'pid_exists':isinstance(pid,int) and Path('/proc',str(pid)).exists(),'updated_at':data.get('updated_at'),'served_profiles':profiles if isinstance(profiles,list) and all(isinstance(x,str) for x in profiles) else None,'gateway_state':data.get('gateway_state'),'platform_count':len(data.get('platforms',{}))})
 except (OSError,ValueError):report['runtime'].append({'home':str(root),'status':'unavailable'})
print(json.dumps(report))
