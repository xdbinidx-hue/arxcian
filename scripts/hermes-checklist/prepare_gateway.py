"""Valmistelee tarkistettavan gateway-kopion, ei muokkaa lähtötiedostoa."""
import argparse
import hashlib
from pathlib import Path

ANCHOR = '        # Global emergency stop (`hermes pause`): give new turns a brief\n'
INSERT = '''        # Arxcian: vain tämä komento, olemassa olevan auth-portin jälkeen.
        # Kytkentäkoodi ei saa päätyä tavalliselle agentille edes vikatilassa.
        if not is_internal and (event.get_command() or '').split('@')[0].lower() == 'arxcian_tehtava':
            try:
                from gateway.arxcian_checklist import handle as handle_checklist
                return await asyncio.to_thread(handle_checklist, event)
            except Exception:
                return 'Tehtävätoiminto ei ole käytettävissä.'

'''


def prepare(source, output, expected_sha):
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected_sha:
        raise ValueError('Gateway-versio on muuttunut: tarkista erot ennen valmistelua.')
    content = raw.decode()
    if content.count(ANCHOR) != 1:
        raise ValueError('Oikeustarkistuksen jälkeistä liitoskohtaa ei löydy yksikäsitteisesti.')
    output.mkdir(parents=True, exist_ok=False)
    (output / 'run.py').write_text(content.replace(ANCHOR, INSERT + ANCHOR))
    here = Path(__file__).parent
    (output / 'arxcian_checklist.py').write_bytes((here / 'gateway_handler.py').read_bytes())
    (output / 'arxcian_checklist_store.py').write_bytes((here / 'checklist.py').read_bytes())


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--sha256', required=True)
    args = parser.parse_args()
    prepare(args.source, args.output, args.sha256)
