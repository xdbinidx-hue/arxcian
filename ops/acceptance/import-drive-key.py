"""Interactive private pending import; no app activation or network calls."""
import json,os,pwd,sys,termios
from pathlib import Path

def validate(value):
 data=json.loads(value)
 if isinstance(data,str):data=json.loads(data)
 if not isinstance(data,dict) or data.get('type')!='service_account' or not all(isinstance(data.get(k),str) and data[k] for k in ('client_email','private_key','token_uri')):raise ValueError('Invalid credential structure')
 if data['token_uri'] not in ('https://oauth2.googleapis.com/token','https://accounts.google.com/o/oauth2/token'):raise ValueError('Unrecognized token endpoint')
 if not data['client_email'].endswith('.gserviceaccount.com') or 'BEGIN PRIVATE KEY' not in data['private_key']:raise ValueError('Invalid service account structure')
 return data

def store(data,target):
 fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w') as output:json.dump(data,output)

if __name__=='__main__':
 if not sys.stdin.isatty():raise SystemExit('Avaa interaktiivinen VPS-webconsole; avainta ei lueta näkyvästä putkesta.')
 print('Liitä Google-JSON (myös monirivinen). Paina Enter ja kirjoita omalle riville LOPPU. Syöttö on piilotettu.',flush=True)
 fd=sys.stdin.fileno();previous=termios.tcgetattr(fd);hidden=termios.tcgetattr(fd);hidden[3]&=~(termios.ECHO|termios.ECHONL)
 lines=[]
 try:
  termios.tcsetattr(fd,termios.TCSANOW,hidden)
  while True:
   line=sys.stdin.readline()
   if not line:raise SystemExit('Syöte keskeytyi; mitään ei tallennettu.')
   if line.strip()=='LOPPU':break
   lines.append(line)
 finally:termios.tcsetattr(fd,termios.TCSANOW,previous)
 value=''.join(lines).replace('\x1b[200~','').replace('\x1b[201~','')
 try:data=validate(value)
 except (ValueError,TypeError):raise SystemExit('Avain ei ollut kelvollinen palvelutilin JSON; mitään ei tallennettu.')
 root=Path('/home/arxcian-codex/arxcian-work/acceptance-preview');root.mkdir(mode=0o700,exist_ok=True)
 target=root/'drive-candidate.json'
 try:store(data,target)
 except FileExistsError:raise SystemExit('Candidate-tiedosto on jo olemassa; sitä ei korvattu.')
 if os.geteuid()==0:
  user=pwd.getpwnam('arxcian-codex');os.chown(target,user.pw_uid,user.pw_gid)
 print('Avain tallennettu yksityiseen drive-candidate.json-tiedostoon. Ei aktivoitu sovelluksessa, ei API-kutsuja.')
