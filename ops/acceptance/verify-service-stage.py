"""Validate a separate release stage; never start or replace a live service."""
import ast,hashlib,json,os,subprocess
from pathlib import Path
stage=Path('/opt/data/private/arxcian/release-f8ef88d-prepared')
supervisor=Path('/opt/data/private/arxcian/oracle-production/supervisor.py')
raw=supervisor.read_bytes()
assert hashlib.sha256(raw).hexdigest()=='54185f029942771792d3e4aec8fc3fb3fab048ba38caf8f66f988c3ad9d6b860','Supervisor changed; refuse'
tree=ast.parse(raw)
def path_expr(n):
 if isinstance(n,ast.Constant) and isinstance(n.value,str):return n.value
 if isinstance(n,ast.Name) and n.id in ('DEFAULT','state'):return supervisor.parent
 if isinstance(n,ast.BinOp) and isinstance(n.op,ast.Div):return Path(path_expr(n.left))/path_expr(n.right)
 if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='Path' and len(n.args)==1:return Path(path_expr(n.args[0]))
 raise ValueError('Unknown path expression; refuse')
bridge=None;config=None;interpreter=None
for n in ast.walk(tree):
 if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='bridge' for t in n.targets):bridge=Path(path_expr(n.value))
 if isinstance(n,ast.Call) and isinstance(n.func,ast.Name):
  if n.func.id=='load_config':config=Path(path_expr(n.args[0]))
  if n.func.id=='run_child' and isinstance(n.args[0],ast.List):interpreter=path_expr(n.args[0].elts[0])
assert bridge and config and interpreter
assert bridge.is_file() and config.is_file() and Path(interpreter).is_file()
st=config.stat();assert st.st_uid==os.getuid() and not st.st_mode&0o077
keys=sorted(json.loads(config.read_text()))
files=[]
for name in ('scripts/oracle-bridge.mjs','scripts/oracle-bridge-lib.mjs','scripts/hermes-checklist/bridge.py','scripts/hermes-checklist/checklist.py'):
 p=stage/name;raw=p.read_bytes()
 if p.suffix=='.py':ast.parse(raw)
 else:subprocess.run([interpreter,'--check',str(p)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 files.append({'name':name,'sha256':hashlib.sha256(raw).hexdigest()})
print(json.dumps({'prepared_only':True,'live_files_replaced':False,'services_started':False,'credentials_exported':False,'stage':str(stage),'live_bridge':str(bridge),'config_path':str(config),'config_key_names':keys,'node_interpreter':interpreter,'files':files}))
