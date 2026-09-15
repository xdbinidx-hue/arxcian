"""Read launch structure, exporting no environment or credential values."""
import ast, hashlib, json
from pathlib import Path
p=Path('/opt/data/private/arxcian/oracle-production/supervisor.py')
raw=p.read_bytes();tree=ast.parse(raw)
def safe(node):
 if isinstance(node,ast.Constant):
  v=node.value
  if isinstance(v,str):
   return v if (v.startswith('/opt/') and '\n' not in v and not any(c in v for c in '?@')) or v in ('node','python3','python','oracle','default') else '<redacted>'
  return '<literal>'
 if isinstance(node,ast.Name):return node.id
 if isinstance(node,ast.Attribute):
  base=safe(node.value)
  return base+'.'+node.attr if isinstance(base,str) else {'base':base,'attribute':node.attr}
 if isinstance(node,(ast.List,ast.Tuple)):return [safe(x) for x in node.elts]
 if isinstance(node,ast.Call):return {'call':safe(node.func),'args':[safe(x) for x in node.args],'keywords':[k.arg for k in node.keywords]}
 return type(node).__name__
assignments=[];calls=[]
for n in ast.walk(tree):
 if isinstance(n,ast.Assign) and isinstance(n.value,(ast.List,ast.Tuple)):
  assignments.append({'targets':[safe(x) for x in n.targets],'value':safe(n.value)})
 if isinstance(n,ast.Call) and any(w in str(safe(n.func)) for w in ('Popen','run','exec','spawn')):calls.append(safe(n))
print(json.dumps({'read_only':True,'credentials_exported':False,'source':str(p),'sha256':hashlib.sha256(raw).hexdigest(),'launch_lists':assignments,'process_calls':calls}))
