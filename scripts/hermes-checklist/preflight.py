"""Rajattu tuotannon lukutarkistus. Ei asetustulosteita tai kirjoitusoperaatioita."""
import hashlib
import json
import os
import re
import sqlite3
import sys
from pathlib import Path

EXPECTED_GATEWAY = '3a7e5f62f74f090df750d9c81c1ae8c0fd31987e29e7302d7badf54affcb7547'


def fingerprint(path):
    if not path.is_file():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()


def audit():
    result = {'report_version': 2, 'python_executable': sys.executable, 'read_only': True, 'gateway_source': {}, 'processes': [], 'databases': [], 'existing_implementations': [], 'config_summaries': []}
    source = Path('/opt/hermes/gateway/run.py')
    sha = fingerprint(source)
    result['gateway_source'] = {'path': str(source), 'sha256': sha, 'matches_reviewed': sha == EXPECTED_GATEWAY}
    roots = {Path('/opt/data'), Path('/opt/data/.hermes')}
    # Environ-arvoja ei palauteta raporttiin. Vain oikeusrajojen lukumäärät ja
    # avoimen pääsyn liput, ei botin/API:n avaimia tai käyttäjätunnisteita.
    for proc in Path('/proc').glob('[0-9]*'):
        if proc.name == str(os.getpid()):
            continue
        try:
            args = (proc / 'cmdline').read_bytes().split(b'\0')
            if not any(b'gateway/run.py' in a or a == b'gateway' for a in args):
                continue
            env = {}
            for entry in (proc / 'environ').read_bytes().split(b'\0'):
                k, _, v = entry.partition(b'=')
                if k in (b'HERMES_HOME', b'TELEGRAM_ALLOWED_USERS', b'TELEGRAM_GROUP_ALLOWED_CHATS', b'TELEGRAM_GROUP_ALLOWED_USERS', b'TELEGRAM_ALLOW_ALL_USERS', b'GATEWAY_ALLOW_ALL_USERS', b'GATEWAY_ALLOWED_USERS', b'ARXCIAN_CHECKLIST_ENABLED', b'ARXCIAN_CHECKLIST_DB'):
                    env[k.decode()] = v.decode(errors='replace')
            home = env.get('HERMES_HOME')
            if home and Path(home).is_absolute():
                roots.add(Path(home))
            users = env.get('TELEGRAM_ALLOWED_USERS', '')
            result['processes'].append({
                'pid': int(proc.name), 'uid': proc.stat().st_uid,
                'telegram_env_allowlist_count': len([v for v in users.split(',') if v.strip()]) if 'TELEGRAM_ALLOWED_USERS' in env else None,
                'telegram_env_allowlist_has_wildcard': '*' in users,
                'telegram_allow_all': env['TELEGRAM_ALLOW_ALL_USERS'].lower() in ('true', '1', 'yes') if 'TELEGRAM_ALLOW_ALL_USERS' in env else None,
                'gateway_allow_all': env['GATEWAY_ALLOW_ALL_USERS'].lower() in ('true', '1', 'yes') if 'GATEWAY_ALLOW_ALL_USERS' in env else None,
                'telegram_groups_configured_in_env': bool(env.get('TELEGRAM_GROUP_ALLOWED_CHATS') or env.get('TELEGRAM_GROUP_ALLOWED_USERS')),
                'checklist_enabled': env.get('ARXCIAN_CHECKLIST_ENABLED') == 'true',
                'checklist_db_configured': bool(env.get('ARXCIAN_CHECKLIST_DB')),
            })
        except (OSError, ValueError):
            continue
    for root in sorted(roots):
        summary = {'root': str(root), 'environment_file_present': (root / '.env').is_file()}
        keys = ('TELEGRAM_ALLOWED_USERS', 'GATEWAY_ALLOWED_USERS', 'TELEGRAM_GROUP_ALLOWED_USERS', 'TELEGRAM_GROUP_ALLOWED_CHATS', 'TELEGRAM_ALLOW_ALL_USERS', 'GATEWAY_ALLOW_ALL_USERS')
        principals = set()
        try:
            if (root / '.env').is_file():
                for line in (root / '.env').read_text().splitlines():
                    match = re.match(r'^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*?)\s*$', line)
                    if not match or match[1] not in keys:
                        continue
                    key, value = match[1], match[2].strip('"\'')
                    if key.endswith('ALLOW_ALL_USERS'):
                        summary[key.lower()] = value.lower() in ('true', '1', 'yes')
                    else:
                        entries = {x.strip() for x in value.split(',') if x.strip()}
                        summary[key.lower() + '_count'] = len(entries)
                        summary[key.lower() + '_wildcard'] = '*' in entries
                        if key in ('TELEGRAM_ALLOWED_USERS', 'GATEWAY_ALLOWED_USERS'):
                            principals.update(entries)
            for subdir in ('pairing', 'platforms/pairing'):
                approved = root / subdir / 'telegram-approved.json'
                if approved.is_file():
                    data = json.loads(approved.read_text())
                    if isinstance(data, dict):
                        summary[subdir + '_approved_count'] = len(data)
                        principals.update(data.keys())
            summary['telegram_and_global_file_principal_union_count'] = len(principals)
        except (OSError, ValueError):
            summary['file_auth_read_error'] = True
        config_path = root / 'config.yaml'
        if config_path.is_file():
            try:
                import yaml
                config = yaml.safe_load(config_path.read_text()) or {}
                gateway = config.get('gateway') or {}
                multiplex = gateway.get('multiplex_profiles', config.get('multiplex_profiles'))
                summary['multiplex_profiles'] = multiplex if isinstance(multiplex, bool) else None
                platforms = gateway.get('platforms', config.get('platforms', {})) or {}
                telegram = platforms.get('telegram') or {}
                extra = telegram.get('extra') or {}
                summary['enabled_platform_count'] = sum(1 for v in platforms.values() if isinstance(v, dict) and v.get('enabled') is True)
                summary['profile_route_count'] = len(gateway.get('profile_routes', [])) if isinstance(gateway.get('profile_routes', []), list) else None
                summary['telegram_configured'] = bool(telegram)
                for key in ('allow_from', 'group_allow_from', 'allowed_users'):
                    entries = telegram.get(key, extra.get(key))
                    summary['yaml_' + key + '_count'] = len(entries) if isinstance(entries, list) else None
                # Politiikoista vain tunnetut enum-arvot, ei vapaata asetustekstiä.
                for key in ('dm_policy', 'group_policy'):
                    value = telegram.get(key, extra.get(key))
                    summary['yaml_' + key] = value if value in ('open', 'disabled', 'pairing', 'allowlist') else None
            except Exception as exc:
                summary['yaml_summary_unavailable'] = True
                # Vain virheluokka. Poikkeusviesti voi sisältää asetuksen arvon.
                summary['yaml_error_type'] = type(exc).__name__ if type(exc).__name__ in ('ModuleNotFoundError', 'ImportError', 'PermissionError', 'ParserError', 'ScannerError', 'AttributeError', 'TypeError') else 'OtherError'
        result['config_summaries'].append(summary)
        for path in (root / 'kanban.db', root / 'kanban/boards/arxcian/kanban.db'):
            if not path.is_file():
                continue
            entry = {'path': str(path), 'uid': path.stat().st_uid, 'mode': oct(path.stat().st_mode & 0o777)}
            try:
                db = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True, timeout=2)
                try:
                    db.execute('PRAGMA query_only=ON')
                    entry['task_count'] = db.execute('SELECT count(*) FROM tasks').fetchone()[0]
                    row = db.execute('SELECT tenant,created_by FROM tasks WHERE id=?', ('arxcian-albin-checklist-v1',)).fetchone()
                    entry['our_task_exists'] = row is not None
                    entry['our_task_owner_matches'] = row == ('arxcian:albin', 'albin') if row else None
                    entry['checklist_channel_table_exists'] = bool(db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='arxcian_checklist_channel'").fetchone())
                finally:
                    db.close()
            except sqlite3.Error:
                entry['read_error'] = True
            result['databases'].append(entry)
    for base in (Path('/opt/data/workspace/arxcian'), Path('/opt/data/private/arxcian/oracle-production')):
        for relative in ('scripts/hermes-kanban', 'scripts/hermes-checklist', 'src/lib/arxcian/hermesKanban', 'src/lib/arxcian/checklist', 'supervisor.py'):
            path = base / relative
            if path.exists():
                result['existing_implementations'].append({'path': str(path), 'is_directory': path.is_dir(), 'sha256': fingerprint(path) if path.is_file() else None})
    result['limitations'] = [
        'Ympäristörajat eivät yksin todista tehokasta auth-rajaa: asetustiedostot, pairing-store, profiilireititys ja dashboard-pääsy tarkistettava erikseen.',
        'Raportti ei sisällä tunnisteita, salaisuuksia, asetustiedostoja, tehtävien sisältöjä tai keskusteluja.',
        'Ei gatewayn uudelleenkäynnistystä, päivitystä, migraatiota tai palveluasennusta.',
    ]
    return result


if __name__ == '__main__':
    print(json.dumps(audit(), indent=2))
