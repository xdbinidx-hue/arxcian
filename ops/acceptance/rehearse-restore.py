"""Restore drill restricted to a NEW TemporaryDirectory; no production arguments."""
import hashlib,json,sqlite3,tempfile
from pathlib import Path
with tempfile.TemporaryDirectory(prefix='arxcian-restore-') as tmp:
 root=Path(tmp);live=root/'live.db';backup=root/'backup.db';restored=root/'restored.db'
 with sqlite3.connect(live) as c:
  c.executescript(Path(__file__).resolve().parents[2].joinpath('scripts/hermes-checklist/test-schema.sql').read_text())
  c.execute('CREATE TABLE acceptance_fixture(revision INTEGER, payload TEXT)')
  c.execute('INSERT INTO acceptance_fixture VALUES(7,?)',('restore-fixture',));c.commit()
  with sqlite3.connect(backup) as b:c.backup(b)
  c.execute('UPDATE acceptance_fixture SET revision=8');c.commit()
 with sqlite3.connect(f'file:{backup}?mode=ro',uri=True) as b:
  assert b.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
  with sqlite3.connect(restored) as r:b.backup(r)
 with sqlite3.connect(restored) as r:
  assert r.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
  assert r.execute('SELECT revision,payload FROM acceptance_fixture').fetchone()==(7,'restore-fixture')
 with sqlite3.connect(live) as c:assert c.execute('SELECT revision FROM acceptance_fixture').fetchone()[0]==8
 print(json.dumps({'passed':True,'temporary_only':True,'online_backup':True,'integrity_check':'ok','production_restore_verified':False,'backup_sha256':hashlib.sha256(backup.read_bytes()).hexdigest()}))
