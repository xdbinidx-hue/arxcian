"""Albinin rajattu tehtävä olemassa olevassa Hermes Kanbanissa, ei agenttiajoja."""
import hashlib
import json
import re
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

TASK_ID = 'arxcian-albin-checklist-v1'
GOAL = 'Laadi kolmen kohdan Arxcian-käyttötestilista'
TENANT = 'arxcian:albin'


class Rejected(ValueError):
    pass


class Checklist:
    def __init__(self, path):
        # Ei hiljaista uutta kantaa eikä oletusta tuotantokannan polusta.
        self.path = Path(path).resolve(strict=True)
        if not self.path.is_file():
            raise Rejected('Kanban-kanta puuttuu.')

    @contextmanager
    def transaction(self):
        db = sqlite3.connect(self.path.as_uri() + '?mode=rw', uri=True, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            db.execute('BEGIN IMMEDIATE')
            # Nämä ovat kanavakytkentä ja toimituskuitit samassa Kanban-kannassa.
            # Varsinainen tehtävä säilyy Hermeksen tasks-taulussa.
            db.execute('SELECT id, tenant, body, result, status FROM tasks LIMIT 0')
            db.execute('CREATE TABLE IF NOT EXISTS arxcian_checklist_channel (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS arxcian_checklist_receipts (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL)')
            db.execute("INSERT OR IGNORE INTO arxcian_checklist_channel VALUES (1, ?)", (json.dumps({'revision': 0, 'telegramId': None, 'pairHash': None, 'expires': 0}),))
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def state(self, db):
        return json.loads(db.execute('SELECT state FROM arxcian_checklist_channel WHERE id=1').fetchone()[0])

    def task(self, db):
        task = db.execute('SELECT * FROM tasks WHERE id=?', (TASK_ID,)).fetchone()
        if task and (task['tenant'] != TENANT or task['created_by'] != 'albin' or task['idempotency_key'] != TASK_ID):
            raise Rejected('Tehtävän omistajuus ei täsmää.')
        return task

    def view(self, db):
        state = self.state(db)
        task = self.task(db)
        items = json.loads(task['body'])['items'] if task else []
        if task and task['status'] not in ('triage', 'done'):
            raise Rejected('Tehtävää on muutettu tämän kokeilun ulkopuolella.')
        return {
            'id': TASK_ID if task else None, 'revision': state['revision'],
            'paired': bool(state['telegramId']), 'goal': GOAL,
            'status': 'completed' if task and task['status'] == 'done' else ('waiting_input' if task else 'not_started'),
            'items': items, 'result': task['result'] if task else None,
            'nextStep': 'Käyttötestilista on valmis.' if len(items) == 3 else (
                f'Lisää käyttötestilistan kohta {len(items)+1}/3.' if task else 'Aloita Telegramissa komennolla /arxcian_tehtava.'),
        }

    def snapshot(self):
        with self.transaction() as db:
            return self.view(db)

    def apply(self, command, *, telegram=None, now=None):
        now = int(time.time()) if now is None else now
        with self.transaction() as db:
            state = self.state(db)
            op = command.get('op')
            # Telegramin henkilöllisyys tulee adapterilta, ei viestitekstistä.
            if telegram is not None:
                if telegram.get('platform') != 'telegram' or telegram.get('chatType') != 'dm':
                    raise Rejected('Käytä tätä toimintoa yksityisessä Telegram-keskustelussa.')
                uid = str(telegram.get('userId') or '')
                if not re.fullmatch(r'[1-9][0-9]{0,19}', uid) or str(telegram.get('chatId')) != uid:
                    raise Rejected('Telegram-käyttäjää ei voitu varmentaa.')
                if op != 'link' and state['telegramId'] != uid:
                    raise Rejected('Liitä Telegram ensin Albinin Arxcian-näkymässä.')
            elif op not in ('pair', 'add'):
                raise Rejected('Tehtävä aloitetaan Telegramissa.')
            if op == 'link' and telegram is None:
                raise Rejected('Kytkentä on tehtävä Telegramissa.')
            cid = command.get('id', '')
            if not isinstance(cid, str) or not re.fullmatch(r'[a-zA-Z0-9:._-]{8,160}', cid):
                raise Rejected('Pyynnön tunniste puuttuu.')
            fingerprint = hashlib.sha256(json.dumps([command, telegram], sort_keys=True).encode()).hexdigest()
            receipt = db.execute('SELECT fingerprint FROM arxcian_checklist_receipts WHERE id=?', (cid,)).fetchone()
            if receipt:
                if receipt[0] != fingerprint:
                    raise Rejected('Sama pyyntötunniste on jo käytetty eri sisältöön.')
                return self.view(db)
            task = self.task(db)
            if op == 'pair':
                if state['telegramId']:
                    raise Rejected('Telegram on jo liitetty. Tilin vaihto ei kuulu tähän kokeiluun.')
                token = command.get('token', '')
                if not re.fullmatch(r'[a-f0-9]{64}', token):
                    raise Rejected('Virheellinen kytkentäkoodi.')
                state['pairHash'] = hashlib.sha256(token.encode()).hexdigest()
                state['expires'] = now + 600
            elif op == 'link':
                token = str(command.get('token', ''))
                digest = hashlib.sha256(token.encode()).hexdigest()
                if state['telegramId'] or not state['pairHash'] or now >= state['expires'] or digest != state['pairHash']:
                    raise Rejected('Kytkentäkoodi ei ole voimassa.')
                state.update(telegramId=uid, pairHash=None, expires=0)
            elif op == 'start':
                if not task:
                    # Yksi kirjoitustransaktio ja kiinteä PK: uusinta tai kaksi
                    # yhtäaikaista viestiä ei voi luoda toista tehtävää.
                    db.execute('INSERT INTO tasks (id,title,body,status,created_by,created_at,workspace_kind,tenant,idempotency_key) VALUES (?,?,?,?,?,?,?,?,?)',
                               (TASK_ID, GOAL, json.dumps({'items': []}), 'triage', 'albin', now, 'scratch', TENANT, TASK_ID))
            elif op == 'add':
                if not task or not state['telegramId']:
                    raise Rejected('Aloita tehtävä ensin Telegramissa.')
                if telegram is None and command.get('revision') != state['revision']:
                    raise Rejected('Tehtävä on muuttunut. Päivitä näkymä ennen jatkamista.')
                text = command.get('text')
                if not isinstance(text, str) or not 1 <= len(text.strip()) <= 500:
                    raise Rejected('Kirjoita 1–500 merkin käyttötestikohta.')
                items = json.loads(task['body'])['items']
                if task['status'] not in ('triage',) or len(items) >= 3:
                    raise Rejected('Käyttötestilista on jo valmis.')
                if text.strip() in items:
                    raise Rejected('Tämä kohta on jo listassa.')
                items.append(text.strip())
                done = len(items) == 3
                result = '\n'.join(f'{i+1}. {s}' for i, s in enumerate(items))
                db.execute('UPDATE tasks SET body=?, result=?, status=?, completed_at=? WHERE id=?',
                           (json.dumps({'items': items}), result, 'done' if done else 'triage', now if done else None, TASK_ID))
            else:
                raise Rejected('Tuntematon tehtävätoiminto.')
            if op != 'start' or task is None:
                state['revision'] += 1
            db.execute('UPDATE arxcian_checklist_channel SET state=? WHERE id=1', (json.dumps(state),))
            db.execute('INSERT INTO arxcian_checklist_receipts VALUES (?,?)', (cid, fingerprint))
            if self.task(db) and op in ('start', 'add'):
                db.execute('INSERT INTO task_events (task_id,kind,payload,created_at) VALUES (?,?,?,?)',
                           (TASK_ID, 'arxcian.checklist', json.dumps({'revision': state['revision'], 'source': 'telegram' if telegram else 'arxcian'}), now))
            return self.view(db)


def telegram_command(store, event):
    """Kutsutaan gatewayn olemassa olevan oikeustarkistuksen JÄLKEEN."""
    raw = str(getattr(event, 'text', '') or '')
    first, _, args = raw.partition(' ')
    if first.split('@')[0].lower() != '/arxcian_tehtava':
        return None
    source = event.source
    identity = {'platform': getattr(source.platform, 'value', ''), 'chatType': source.chat_type,
                'userId': source.user_id, 'chatId': source.chat_id}
    mid = getattr(event, 'message_id', None)
    if not mid:
        return 'Viestin tunniste puuttuu. Lähetä komento uudelleen.'
    command = {'id': f'tg:{source.chat_id}:{mid}', 'op': 'start'}
    args = args.strip()
    if args.startswith('liita '):
        command.update(op='link', token=args[6:].strip())
    elif args.startswith('lisaa '):
        command.update(op='add', text=args[6:].strip())
    elif args:
        return 'Käyttö: /arxcian_tehtava tai /arxcian_tehtava lisaa <käyttötestikohta>'
    try:
        view = store.apply(command, telegram=identity)
        states = {'not_started': 'Ei aloitettu', 'waiting_input': 'Odottaa seuraavaa kohtaa', 'completed': 'Valmis'}
        return '\n'.join([view['goal'], 'Tila: ' + states[view['status']], 'Tulos: ' + (view['result'] or 'Ei vielä kohtia.'),
                          'Seuraava askel: ' + view['nextStep'], 'Jatka Arxcianissa: Personal → Käyttötestilista'])
    except Rejected as exc:
        return str(exc)
