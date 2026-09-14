"""Rajattu gateway-liitos; asennetaan vasta erillisellä julkaisuluvalla."""
import os
from gateway.arxcian_checklist_store import Checklist, telegram_command


def handle(event):
    if os.environ.get('ARXCIAN_CHECKLIST_ENABLED') != 'true':
        return 'Käyttötestilistatoiminto ei ole vielä käytössä.'
    try:
        return telegram_command(Checklist(os.environ['ARXCIAN_CHECKLIST_DB']), event)
    except Exception:
        return 'Tehtävää ei saatu käsiteltyä. Sama pyyntö voidaan yrittää uudelleen.'
