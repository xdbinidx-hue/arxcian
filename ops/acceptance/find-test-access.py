"""Bounded metadata discovery. No secret values, conversations or database reads."""
import ast,json,re
from pathlib import Path
from urllib.parse import urlsplit
report={'version':1,'read_only':True,'credential_values_exported':False,'locations':[],'supervisor_source_paths':[]}
roots=[Path(p) for p in ('/opt/data/workspace/arxcian','/opt/data/workspace/rjmob-portal','/opt/data/private/arxcian/oracle-production','/opt/data/private/arxcian/oracle-preview','/opt/data/private/arxcian/oracle-staging','/opt/data/private/arxcian/acceptance','/opt/data/profiles/oracle','/opt/data')]
supervisor=Path('/opt/data/private/arxcian/oracle-production/supervisor.py')
if supervisor.is_file():
 for node in ast.walk(ast.parse(supervisor.read_text())):
  if isinstance(node,ast.Constant) and isinstance(node.value,str):
   value=node.value
   if value.startswith('/opt/data/') and value.endswith(('.env','.env.local','.py','.mjs','.json')):
    report['supervisor_source_paths'].append(value)
report['supervisor_source_paths']=sorted(set(report['supervisor_source_paths']))
credentials={'GOOGLE_SERVICE_ACCOUNT_KEY','API_SERVER_KEY','OPENAI_API_KEY','OPENROUTER_API_KEY','ANTHROPIC_API_KEY','VERCEL_TOKEN','ORACLE_BRIDGE_SECRET'}
urls={'ARXCIAN_ORIGIN','HERMES_API_URL','VERCEL_URL'}
files={r/n for r in roots for n in ('.env','.env.local','oracle-bridge.env','bridge.env','supervisor.env')}
for value in report['supervisor_source_paths']:
 if value.endswith(('.env','.env.local')):files.add(Path(value))
for p in sorted(files):
 if not p.is_file():continue
 row={'path':str(p),'credentials_present':[],'safe_service_urls':{}}
 try:
  for line in p.read_text().splitlines():
   match=re.match(r'^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*?)\s*$',line)
   if not match:continue
   key,value=match[1],match[2].strip('"\'')
   if key in credentials and value:row['credentials_present'].append(key)
   if key in urls:
    u=urlsplit(value)
    allowed_path=u.path.rstrip('/') in ('','/p/oracle')
    if u.scheme in ('http','https') and u.hostname and not u.username and not u.password and not u.query and not u.fragment and allowed_path:row['safe_service_urls'][key]=value
  row['credentials_present']=sorted(set(row['credentials_present']))
  report['locations'].append(row)
 except OSError:report['locations'].append({'path':str(p),'unreadable':True})
report['candidate_directories']=[{'path':str(r),'present':r.is_dir()} for r in roots[:-1]]
print(json.dumps(report))
