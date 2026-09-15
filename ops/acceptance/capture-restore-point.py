"""Capture-only backup. Never replaces live files or starts/restarts a service."""
import datetime,hashlib,json,os,shutil,sqlite3,uuid
from pathlib import Path

def capture(db,files,destination):
 if not db.is_file():raise RuntimeError('Existing SQLite database missing; capture refused')
 destination.mkdir(mode=0o700,parents=False,exist_ok=False)
 result={'version':1,'captured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'directory':str(destination),'capture_only':True,'files':[]}
 with sqlite3.connect(db.as_uri()+'?mode=ro',uri=True) as source:
  if source.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('Source integrity check failed')
  with sqlite3.connect(destination/'kanban.db') as backup:source.backup(backup)
 os.chmod(destination/'kanban.db',0o600)
 with sqlite3.connect((destination/'kanban.db').as_uri()+'?mode=ro',uri=True) as backup:
  if backup.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('Backup integrity check failed')
 for index,p in enumerate(files):
  if not p.is_file():
   result['files'].append({'source':str(p),'present':False});continue
  target=destination/(str(index)+'-'+p.name)
  shutil.copyfile(p,target);os.chmod(target,0o600)
  result['files'].append({'source':str(p),'present':True,'copy':target.name,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
 result['sqlite_sha256']=hashlib.sha256((destination/'kanban.db').read_bytes()).hexdigest()
 result['integrity_check']='ok'
 result['runtime_settings_complete']=False
 result['production_restore_tested']=False
 manifest=destination/'manifest.json';manifest.write_text(json.dumps(result,indent=2));os.chmod(manifest,0o600)
 return result

if __name__=='__main__':
 os.umask(0o077)
 parent=Path('/opt/data/private/arxcian/restore-points');parent.mkdir(mode=0o700,exist_ok=True)
 stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]
 files=[Path('/opt/hermes/gateway')/n for n in ('run.py','arxcian_checklist.py','arxcian_checklist_store.py')]
 files += [Path('/opt/data/.env'),Path('/opt/data/config.yaml'),Path('/opt/data/private/arxcian/oracle-production/supervisor.py')]
 print(json.dumps(capture(Path('/opt/data/kanban/boards/arxcian/kanban.db'),files,parent/stamp)))
