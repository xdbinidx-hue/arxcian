"""Start the existing isolated preview detached from a transient tool session.
Refuses concurrent listeners; recovers only a refused private Redis socket.
"""
import os,socket,subprocess,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
STATE=Path('/home/arxcian-codex/arxcian-work/acceptance-preview')
ENV={'PATH':'/home/arxcian-codex/.local/node-v24.21.0-linux-x64/bin:/usr/bin:/bin'}
def main():
 os.umask(0o077)
 for port in (3300,3301,3302):
  with socket.socket() as connection:
   if connection.connect_ex(('127.0.0.1',port))==0:raise SystemExit(f'Port {port} already in use; refuse concurrent preview')
 private=STATE/'redis.sock'
 if private.exists():
  with socket.socket(socket.AF_UNIX) as connection:
   try:connection.connect(str(private))
   except ConnectionRefusedError:private.unlink()
   else:raise SystemExit('Private Redis still running; refuse concurrent preview')
 for name,command,log in [('app',['python3','-B','ops/acceptance/local-preview.py'],'acceptance-preview.log'),('proxy',['node','ops/acceptance/snapshot-preview.cjs'],'acceptance-snapshot-preview.log')]:
  with open(STATE.parent/log,'ab',buffering=0) as output:
   process=subprocess.Popen(command,cwd=ROOT,env=ENV,stdin=subprocess.DEVNULL,stdout=output,stderr=output,start_new_session=True)
  (STATE/(name+'-pid')).write_text(str(process.pid))
 for _ in range(50):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3302/login',timeout=1) as response:
    if response.status==200:print('Isolated preview ready on http://localhost:3302/acceptance');return
  except (OSError,urllib.error.HTTPError):pass
  time.sleep(.1)
 raise SystemExit('Preview readiness failed; inspect private acceptance logs')
if __name__=='__main__':main()
