"""Kanban-lukukopion ja jatkopyyntöjen kuljetus; ei Telegram-polleria."""
import json
import os
import time
import urllib.request
from urllib.parse import urlsplit
from checklist import Checklist, Rejected


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def exchange_once(store, exchange, ack=None):
    command = exchange({'snapshot': store.snapshot(), 'ack': ack}).get('command')
    if command is None:
        return None
    if not isinstance(command, dict) or command.get('op') not in ('pair', 'add'):
        raise ValueError('Virheellinen siltapyyntö')
    try:
        store.apply(command)
        return {'id': command['id'], 'error': None}
    except Rejected as exc:
        return {'id': command.get('id'), 'error': str(exc)[:300]}


def main():
    if os.environ.get('ARXCIAN_CHECKLIST_ENABLED') != 'true':
        raise SystemExit('Käyttötestilistatoiminto ei ole käytössä.')
    origin = os.environ['ARXCIAN_ORIGIN'].rstrip('/')
    url = urlsplit(origin)
    if url.username or url.password or url.query or url.fragment or url.path not in ('', '/'):
        raise SystemExit('Virheellinen Arxcian-origin.')
    if url.scheme != 'https' and not (url.scheme == 'http' and url.hostname in ('127.0.0.1', 'localhost', '::1')):
        raise SystemExit('Arxcian-yhteys vaatii HTTPS:n.')
    secret = os.environ['ORACLE_BRIDGE_SECRET']
    if not secret:
        raise SystemExit('Bridge-avain puuttuu.')
    store = Checklist(os.environ['ARXCIAN_CHECKLIST_DB'])
    opener = urllib.request.build_opener(NoRedirect)

    def exchange(body):
        req = urllib.request.Request(origin + '/api/arxcian/oracle/bridge/checklist',
                                     data=json.dumps(body).encode(), method='POST',
                                     headers={'Content-Type': 'application/json', 'x-oracle-bridge-secret': secret})
        with opener.open(req, timeout=15) as response:
            return json.load(response)

    ack = None
    while True:
        try:
            ack = exchange_once(store, exchange, ack)
        except Exception:
            # Ei pyynnön sisältöä, kytkentäkoodia, henkilötunnistetta tai
            # palvelimen vastausrunkoa lokiin. Sama kuitti uusitaan katkon yli.
            print('Tehtäväyhteys epäonnistui; uusitaan.', flush=True)
        time.sleep(2)


if __name__ == '__main__':
    main()
