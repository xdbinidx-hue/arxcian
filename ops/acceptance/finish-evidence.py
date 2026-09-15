"""Read-only profile summaries plus restore drill on a copy of a captured backup."""
import datetime,hashlib,json,os,re,shutil,sqlite3,tempfile,sys
from pathlib import Path
import yaml

def fingerprint(p):return hashlib.sha256(p.read_bytes()).hexdigest()
report={'version':1,'production_modified':False,'profile_authorization_verified':False,'profiles':[]}
for name,home in [('default',Path('/opt/data')),('oracle',Path('/opt/data/profiles/oracle'))]:
 row={'name':name,'home_exists':home.is_dir(),'config_present':False,'environment_gates':{},'pairing':[]}
 env=home/'.env'
 if env.is_file():
  for line in env.read_text().splitlines():
   m=re.match(r'^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*?)\s*$',line)
   if not m:continue
   key,value=m[1],m[2].strip('"\'')
   if key in ('TELEGRAM_ALLOWED_USERS','GATEWAY_ALLOWED_USERS','TELEGRAM_GROUP_ALLOWED_USERS','TELEGRAM_GROUP_ALLOWED_CHATS'):
    parts=[v.strip() for v in value.split(',') if v.strip()];row['environment_gates'][key]={'count':len(parts),'wildcard':'*' in parts}
   elif key in ('TELEGRAM_ALLOW_ALL_USERS','GATEWAY_ALLOW_ALL_USERS'):
    row['environment_gates'][key]=value.lower() in ('true','1','yes')
   elif key=='API_SERVER_KEY':row['api_key_present']=bool(value);row['api_key_meets_minimum_length']=len(value)>=16
   elif key=='API_SERVER_HOST':row['api_bind_loopback']=value in ('127.0.0.1','localhost','::1')
 config=home/'config.yaml'
 if config.is_file():
  data=yaml.safe_load(config.read_text()) or {};row['config_present']=True
  gateway=data.get('gateway',{});row['multiplex_profiles']=gateway.get('multiplex_profiles') if isinstance(gateway,dict) else None
  platforms={}
  legacy=home/'gateway.json'
  if legacy.is_file():
   previous=json.loads(legacy.read_text())
   if isinstance(previous,dict) and isinstance(previous.get('platforms'),dict):platforms.update(previous['platforms'])
  if isinstance(gateway,dict) and isinstance(gateway.get('platforms'),dict):platforms.update(gateway['platforms'])
  if isinstance(data.get('platforms'),dict):
   for k,v in data['platforms'].items():
    platforms[k]={**platforms.get(k,{}),**v} if isinstance(v,dict) and isinstance(platforms.get(k,{}),dict) else v
  for platform in ('telegram','api_server'):
   for section in (gateway,data):
    if isinstance(section,dict) and isinstance(section.get(platform),dict):
     platforms[platform]={**platforms.get(platform,{}),**section[platform]}
  row['platforms']=[]
  if isinstance(platforms,dict):
   for platform,p in platforms.items():
    if not isinstance(p,dict):continue
    entry={'name':platform,'enabled':p.get('enabled'),'dm_policy':p.get('dm_policy')}
    for k in ('allowed_users','allow_from','allowed_chats','group_allowed_users','group_allowed_chats'):
     value=p.get(k);entry[k+'_count']=len(value) if isinstance(value,list) else None
     entry[k+'_wildcard']='*' in value if isinstance(value,list) else None
    extra=p.get('extra',{})
    if isinstance(extra,dict):
     for k in ('allow_all_users','host','port'):
      value=extra.get(k)
      if k=='host':entry['bind_loopback']=value in ('127.0.0.1','localhost','::1') if value is not None else None
      elif isinstance(value,(bool,int)):entry[k]=value
    row['platforms'].append(entry)
 for relative in ('pairing','platforms/pairing'):
  directory=home/relative
  for p in directory.glob('*-approved.json'):
   try:
    approved=json.loads(p.read_text());row['pairing'].append({'platform':p.name.removesuffix('-approved.json'),'layout':relative,'count':len(approved) if isinstance(approved,dict) else None})
   except (OSError,ValueError):row['pairing'].append({'layout':relative,'unavailable':True})
 report['profiles'].append(row)
if os.environ.get('ARXCIAN_AUDIT_ONLY')=='1':
 report['checked_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 print(json.dumps(report));sys.exit(0)
base=Path(os.environ['ARXCIAN_CAPTURE_PATH']).resolve()
if base.parent!=Path('/opt/data/private/arxcian/restore-points').resolve():raise RuntimeError('Capture path outside restore-points')
manifest=json.loads((base/'manifest.json').read_text());db=base/'kanban.db'
if fingerprint(db)!=manifest['sqlite_sha256']:raise RuntimeError('SQLite capture hash mismatch')
with tempfile.TemporaryDirectory(prefix='arxcian-captured-restore-') as d:
 sandbox=Path(d);copied=0
 for item in manifest['files']:
  if not item.get('present'):continue
  source=(base/item['copy']).resolve()
  if source.parent!=base or fingerprint(source)!=item['sha256']:raise RuntimeError('Captured file hash/path mismatch')
  shutil.copyfile(source,sandbox/source.name);os.chmod(sandbox/source.name,0o600);copied+=1
 with sqlite3.connect(db.as_uri()+'?mode=ro',uri=True) as source:
  if source.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('Captured SQLite integrity failed')
  with sqlite3.connect(sandbox/'kanban.db') as restored:source.backup(restored)
 with sqlite3.connect((sandbox/'kanban.db').as_uri()+'?mode=ro',uri=True) as restored:
  if restored.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('Restored SQLite integrity failed')
  tables=restored.execute("SELECT count(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
 if fingerprint(db)!=manifest['sqlite_sha256']:raise RuntimeError('Capture unexpectedly changed')
 report['restore_drill']={'passed':True,'captured_backup':str(base),'copied_files_verified':copied,'restored_table_count':tables,'capture_unchanged':True,'temporary_sandbox_removed':True,'services_started':False,'full_service_restore_verified':False}
report['checked_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
print(json.dumps(report))
