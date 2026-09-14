import concurrent.futures
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from checklist import Checklist, TASK_ID, Rejected, telegram_command
from bridge import exchange_once

IDENTITY = {'platform': 'telegram', 'chatType': 'dm', 'userId': '123456', 'chatId': '123456'}
TOKEN = 'a' * 64


class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='arxcian-checklist-test-')
        self.path = Path(self.tmp.name) / 'kanban.db'
        with sqlite3.connect(self.path) as db:
            db.executescript(Path(__file__).with_name('test-schema.sql').read_text())
        self.store = Checklist(self.path)

    def tearDown(self):
        self.tmp.cleanup()

    def pair(self):
        self.store.apply({'id': 'pair-0001', 'op': 'pair', 'token': TOKEN}, now=1000)
        return self.store.apply({'id': 'link-0001', 'op': 'link', 'token': TOKEN}, telegram=IDENTITY, now=1001)

    def start(self):
        self.pair()
        return self.store.apply({'id': 'start-001', 'op': 'start'}, telegram=IDENTITY)

    def test_telegram_start_browser_continue_restart_three_points(self):
        self.start()
        for i in range(3):
            # Uusi prosessikohtainen instanssi: ei selaimen/agentin muistia.
            store = Checklist(self.path)
            view = store.snapshot()
            store.apply({'id': f'browser-{i}', 'op': 'add', 'text': f'Kohta {i+1}', 'revision': view['revision']})
        result = Checklist(self.path).snapshot()
        self.assertEqual(result['items'], ['Kohta 1', 'Kohta 2', 'Kohta 3'])
        self.assertEqual(result['status'], 'completed')
        self.assertIn('3. Kohta 3', result['result'])
        with sqlite3.connect(self.path) as db:
            row = db.execute('SELECT status,worker_pid,assignee FROM tasks WHERE id=?', (TASK_ID,)).fetchone()
            self.assertEqual(row, ('done', None, None))

    def test_status_read_does_not_invalidate_browser_revision(self):
        view = self.start()
        again = self.store.apply({'id': 'read-0001', 'op': 'start'}, telegram=IDENTITY)
        self.assertEqual(again['revision'], view['revision'])

    def test_concurrent_start_does_not_duplicate(self):
        self.pair()
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda i: Checklist(self.path).apply({'id': f'start-{i:04}', 'op': 'start'}, telegram=IDENTITY), range(16)))
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM tasks').fetchone()[0], 1)
            self.assertEqual(db.execute('SELECT status FROM tasks').fetchone()[0], 'triage')

    def test_same_request_after_lost_ack_only_adds_once(self):
        view = self.start()
        command = {'id': 'browser-001', 'op': 'add', 'text': 'Sama kohta', 'revision': view['revision']}
        self.store.apply(command)
        Checklist(self.path).apply(command)
        self.assertEqual(self.store.snapshot()['items'], ['Sama kohta'])
        with self.assertRaises(Rejected):
            self.store.apply({**command, 'text': 'Eri kohta'})

    def test_concurrent_revision_only_one_wins(self):
        view = self.start()
        def add(i):
            try:
                Checklist(self.path).apply({'id': f'concurrent-{i}', 'op': 'add', 'text': str(i), 'revision': view['revision']})
                return True
            except Rejected:
                return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            self.assertEqual(sum(pool.map(add, range(8))), 1)

    def test_no_other_telegram_user_or_group_can_read_or_change(self):
        self.start()
        for changes in [{'userId': '999', 'chatId': '999'}, {'chatType': 'group'}, {'platform': 'discord'}, {'chatId': '-42'}, {'userId': None}]:
            with self.assertRaises(Rejected):
                self.store.apply({'id': 'start-denied', 'op': 'start'}, telegram={**IDENTITY, **changes})
        self.assertEqual(self.store.snapshot()['items'], [])

    def test_pair_expiry_one_time_and_rebinding(self):
        self.store.apply({'id': 'pair-0001', 'op': 'pair', 'token': TOKEN}, now=1000)
        with self.assertRaises(Rejected):
            self.store.apply({'id': 'expired-link', 'op': 'link', 'token': TOKEN}, telegram=IDENTITY, now=1600)
        self.store.apply({'id': 'valid-link', 'op': 'link', 'token': TOKEN}, telegram=IDENTITY, now=1100)
        with self.assertRaises(Rejected):
            self.store.apply({'id': 'rebind-link', 'op': 'link', 'token': TOKEN}, telegram={**IDENTITY, 'userId': '99', 'chatId': '99'}, now=1101)
        with self.assertRaises(Rejected):
            self.store.apply({'id': 'pair-0002', 'op': 'pair', 'token': 'b'*64}, now=1101)

    def test_browser_cannot_start_and_no_missing_db_creation(self):
        with self.assertRaises(Rejected):
            self.store.apply({'id': 'web-start', 'op': 'start'})
        with self.assertRaises(FileNotFoundError):
            Checklist(Path(self.tmp.name) / 'missing.db')

    def test_snapshot_excludes_pairing_identity_and_foreign_content(self):
        self.start()
        with sqlite3.connect(self.path) as db:
            db.execute("INSERT INTO tasks(id,title,body,status,created_at,tenant) VALUES ('foreign','private-history','TOP SECRET','triage',0,'arbnor')")
        view = json.dumps(self.store.snapshot())
        for private in ['123456', TOKEN, 'TOP SECRET', 'private-history', 'pairHash']:
            self.assertNotIn(private, view)

    def test_ownership_conflict_fails_closed(self):
        self.start()
        with sqlite3.connect(self.path) as db:
            db.execute("UPDATE tasks SET tenant='arxcian:arbnor' WHERE id=?", (TASK_ID,))
        with self.assertRaises(Rejected):
            self.store.snapshot()

    def test_persistence_beyond_queue_ttl(self):
        self.start()
        with sqlite3.connect(self.path) as db:
            db.execute('UPDATE tasks SET created_at=1 WHERE id=?', (TASK_ID,))
        self.assertEqual(Checklist(self.path).snapshot()['id'], TASK_ID)

    def test_bridge_crash_between_apply_and_ack(self):
        view = self.start()
        command = {'id': 'crash-0001', 'op': 'add', 'text': 'Katkostesti', 'revision': view['revision']}
        def transport(body):
            return {'command': command if not body['ack'] else None}
        exchange_once(self.store, transport)  # Prosessi katoaa ennen kuittausta.
        ack = exchange_once(Checklist(self.path), transport)
        exchange_once(Checklist(self.path), transport, ack)
        self.assertEqual(self.store.snapshot()['items'], ['Katkostesti'])

    def test_telegram_handler_returns_same_task_without_agent_history(self):
        self.pair()
        def event(text, mid, uid='123456', chat_type='dm'):
            return SimpleNamespace(text=text, message_id=mid, source=SimpleNamespace(platform=SimpleNamespace(value='telegram'), user_id=uid, chat_id=uid, chat_type=chat_type))
        self.assertIsNone(telegram_command(self.store, event('Tavallinen keskustelu', '1')))
        response = telegram_command(self.store, event('/arxcian_tehtava', '2'))
        self.assertIn('Seuraava askel:', response)
        self.assertIn('Tulos:', response)
        self.assertNotIn('Tulos:', telegram_command(self.store, event('/arxcian_tehtava', '3', uid='999')))
        self.assertNotIn('Tulos:', telegram_command(self.store, event('/arxcian_tehtava', '4', chat_type='group')))


if __name__ == '__main__':
    unittest.main()
