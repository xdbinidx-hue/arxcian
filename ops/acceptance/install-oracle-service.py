"""Authorized bridge-only update, guarded backup and process identity checks."""
import hashlib,json,os,signal,subprocess,time
from pathlib import Path
base=Path('/opt/data/private/arxcian/oracle-production')
source=base/'supervisor.py'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='54185f029942771792d3e4aec8fc3fb3fab048ba38caf8f66f988c3ad9d6b860'
stage=Path('/opt/data/private/arxcian/release-f8ef88d-prepared/scripts')
live=base/'release-9f26dc0'
expected={'oracle-bridge.mjs':'e7ba9dc44985da005ff31df64abdac932029ed9fb4f73ee04b2fca9f80700298','oracle-bridge-lib.mjs':'73e62d9727872792efcb035a3cfade35cf8d9d4c7329bf74cd2c806a84b9ba27'}
for name,sha in expected.items():
 assert hashlib.sha256((stage/name).read_bytes()).hexdigest()==sha
 subprocess.run(['/usr/local/bin/node','--check',str(stage/name)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 assert (live/name).is_file() and not (live/name).is_symlink()
processes=[]
for p in Path('/proc').iterdir():
 if not p.name.isdigit():continue
 try:
  args=[x.decode() for x in (p/'cmdline').read_bytes().split(b'\0') if x]
  if str(source) in args and '--stop' not in args and p.stat().st_uid==os.getuid():processes.append((int(p.name),args))
 except (OSError,UnicodeError):pass
assert len(processes)==1,'Expected one current supervisor; refuse'
pid,command=processes[0]
backup=base/('bridge-rollback-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime()))
backup.mkdir(mode=0o700)
old={name:(live/name).read_bytes() for name in expected}
for name,data in old.items():
 p=backup/name;p.write_bytes(data);p.chmod(0o600)
manifest={name:hashlib.sha256(data).hexdigest() for name,data in old.items()}
(backup/'manifest.json').write_text(json.dumps(manifest));(backup/'manifest.json').chmod(0o600)
def stopped():
 try:
  args=(Path('/proc')/str(pid)/'cmdline').read_bytes().split(b'\0')
  return str(source).encode() not in args
 except OSError:return True
def launch():
 with open(base/'release-f8ef88d-supervisor.log','ab',buffering=0) as log:
  child=subprocess.Popen(command,env={'PATH':'/usr/local/bin:/usr/bin:/bin','LANG':'C.UTF-8'},stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
 time.sleep(4)
 assert child.poll() is None,'Supervisor exited; rollback needed'
 return child
os.kill(pid,signal.SIGTERM)
for _ in range(350):
 if stopped():break
 time.sleep(.1)
else:raise RuntimeError('Supervisor did not stop; files unchanged')
child=None
try:
 for name in expected:
  temporary=live/(name+'.release.tmp');temporary.write_bytes((stage/name).read_bytes());temporary.chmod(0o600);os.replace(temporary,live/name)
 child=launch()
 # Verify the supervisor actually launched the bridge, rather than merely waiting.
 running=False
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   args=(p/'cmdline').read_bytes().split(b'\0')
   if str(live/'oracle-bridge.mjs').encode() in args and p.stat().st_uid==os.getuid():running=True
  except OSError:pass
 assert running,'No bridge child found; rollback needed'
except Exception:
 if child and child.poll() is None:
  child.terminate();child.wait(timeout=35)
 for name,data in old.items():
  temporary=live/(name+'.rollback.tmp');temporary.write_bytes(data);temporary.chmod(0o600);os.replace(temporary,live/name)
 launch()
 raise RuntimeError('Update failed; old bridge restored and restarted') from None
print(json.dumps({'bridge_updated':True,'source_version':'f8ef88d','rollback_directory':str(backup),'old_hashes':manifest,'new_hashes':expected,'supervisor_restarted':True,'bridge_process_verified':True,'gateway_changed':False,'checklist_activated':False,'frontend_deployed':False,'real_oracle_answer_verified':False}))
