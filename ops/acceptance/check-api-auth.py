"""GET-only API auth probe. No model runs or message/task operations."""
import json,re,urllib.error,urllib.request
from pathlib import Path
import yaml

def environment(home):
 result={}
 p=home/'.env'
 if p.is_file():
  for line in p.read_text().splitlines():
   match=re.match(r'^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*?)\s*$',line)
   if match:result[match[1]]=match[2].strip('"\'')
 return result
root=Path('/opt/data');env=environment(root)
data=yaml.safe_load((root/'config.yaml').read_text()) or {}
gateway=data.get('gateway',{})
api={}
for group in (gateway.get('platforms',{}) if isinstance(gateway,dict) else {},data.get('platforms',{}),gateway,data):
 if isinstance(group,dict) and isinstance(group.get('api_server'),dict):api.update(group['api_server'])
extra=api.get('extra',{}) or {}
port=int(env.get('API_SERVER_PORT') or extra.get('port') or api.get('port') or 8642)
if not 1<=port<=65535:raise RuntimeError('Invalid API port')
keys={'default':env.get('API_SERVER_KEY'),'oracle':environment(root/'profiles/oracle').get('API_SERVER_KEY')}
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def read(path,key):
 headers={'Authorization':'Bearer '+key} if key else {}
 request=urllib.request.Request('http://127.0.0.1:'+str(port)+path,headers=headers,method='GET')
 try:
  with opener.open(request,timeout=8) as response:return response.status
 except urllib.error.HTTPError as error:return error.code
 except (urllib.error.URLError,TimeoutError):return 'unreachable'
report={'version':1,'get_only':True,'model_runs_created':False,'credential_values_exported':False,'port':port,'checks':[],'owner_isolation_verified':False,'dashboard_access_verified':False}
for profile,path in [('default','/v1/models'),('oracle','/p/oracle/v1/models')]:
 row={'profile':profile,'endpoint':path,'anonymous':read(path,None),'invalid_key':read(path,'arxcian-acceptance-deliberately-invalid-key')}
 own=keys[profile]
 row['own_key']=read(path,own) if own else 'missing'
 other=keys['oracle' if profile=='default' else 'default']
 row['other_profile_key']=read(path,other) if other else 'missing'
 row['rejects_unauthorized_and_accepts_own_key']=row['anonymous'] in (401,403) and row['invalid_key'] in (401,403) and row['own_key']==200
 report['checks'].append(row)
print(json.dumps(report))
