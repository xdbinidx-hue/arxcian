import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import preflight


class PreflightTests(unittest.TestCase):
    def test_report_is_read_only_and_does_not_export_secrets_or_principals(self):
        with tempfile.TemporaryDirectory(prefix='checklist-audit-test-') as tmp:
            root = Path(tmp)
            def mapped(value):
                path = Path(value)
                return root / str(path).lstrip('/') if str(path).startswith(('/opt/', '/proc')) else path
            data = mapped('/opt/data')
            data.mkdir(parents=True)
            (data / '.env').write_text('API_SERVER_KEY=private-secret-value\nTELEGRAM_ALLOWED_USERS=9988776655\nTELEGRAM_ALLOW_ALL_USERS=false\n')
            pairing = data / 'platforms/pairing'
            pairing.mkdir(parents=True)
            (pairing / 'telegram-approved.json').write_text(json.dumps({'9988776655': {'name': 'private-person-name'}}))
            dbpath = data / 'kanban/boards/arxcian/kanban.db'
            dbpath.parent.mkdir(parents=True)
            with sqlite3.connect(dbpath) as db:
                db.execute('CREATE TABLE tasks(id TEXT,tenant TEXT,created_by TEXT,body TEXT)')
                db.execute("INSERT INTO tasks VALUES('foreign','other','other','private-conversation-text')")
            proc = mapped('/proc/987654')
            proc.mkdir(parents=True)
            (proc / 'cmdline').write_bytes(b'python3\0/opt/hermes/gateway/run.py\0')
            (proc / 'environ').write_bytes(b'API_SERVER_KEY=another-private-secret\0TELEGRAM_ALLOWED_USERS=9988776655\0')
            before = {str(p): p.read_bytes() for p in root.rglob('*') if p.is_file()}
            with patch.object(preflight, 'Path', side_effect=mapped):
                report = preflight.audit()
            after = {str(p): p.read_bytes() for p in root.rglob('*') if p.is_file()}
            self.assertEqual(before, after)
            serialized = json.dumps(report)
            for value in ('private-secret-value', 'another-private-secret', '9988776655', 'private-person-name', 'private-conversation-text'):
                self.assertNotIn(value, serialized)
            self.assertEqual(report['databases'][0]['task_count'], 1)
            self.assertFalse(report['gateway_source']['matches_reviewed'])
            self.assertIsNone(report['processes'][0]['gateway_allow_all'])


if __name__ == '__main__':
    unittest.main()
