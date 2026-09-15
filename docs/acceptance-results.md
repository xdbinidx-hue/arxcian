## Uusi näyttö 15.9.2026: Drive ja snapshot-testiversio

Toteutettu erillinen readonly Drive-capture ja loopback snapshot-preview. Oikean syyskuun kaikki kolme lukijaa onnistuivat, lähteen modifiedTime säilyi; myöhempää kuukautta ei löytynyt listasta. Korjattu myyjäkokonaissumman järjestyksestä riippuva desimaaliero. Kohdennetut 13 testiä, typecheck/build ja kolme oikean React-sivun fingerprint-vertailua läpäisivät. Uuden testin loki: `/home/arxcian-codex/arxcian-work/acceptance-snapshot-check.log`.

Oracle-vastausta **ei** verrattu eikä Hermes-runtime-oikeuksia vielä varmennettu. Palvelu on SSH-tunnelin kautta käytettävä osittainen testiversio, ei julkinen HTTPS-preview tai tuotantojulkaisu. Täysi palvelupalautus edelleen avoin; aiempi otetun backupin sandbox-drill säilyy voimassa. Ajantasainen yhteinen jatko: docs/HANDOFF.md.

# Hyväksymistulokset — 15.9.2026

Tulokset koskevat julkaisutyötä /home/arxcian-codex/arxcian-release, release/acceptance-20260915. Sovellustoteutus 8d9c719, uusin valmistelu lähtöversiossa c889748. Ei tuotantojulkaisua.

| Kohde | Tulos | Evidenssi / vielä tarvittava työ |
|---|---|---|
| Yhdistetty sovellus | Automaattitestattu aiemmin | 400 Node/bridge + 14 Python, DOM, build/typecheck; ei uusittu muuttumattomalle sovellukselle |
| Paikallinen testipalvelu | Alustava, käynnissä | localhost:3300/login vain VPS-loopback; oma Redis ja testitunnukset |
| Sovelluksen checklist-käyttäjäraja | HTTP-tarkistus läpäisi | Anonyymi 401, Albin login/read 200, Arbnor login 200/read 404; acceptance-preview-smoke.json |
| Testi-Redis | Persistenssi testattu | Oma Unix-socket/AOF; arvo säilyi oikean preview/Redis-restartin yli; acceptance-preview-durability.json |
| Ajossa käytetyt Hermes-lähteet | Tarkisteet täsmäävät | run.py/authz_mixin.py/status.py vastaavat luettua lähdepakettia; profiles.py saatu |
| Hermes-profiilien asetukset | Raportit luettu, oikeusraja avoin | Default yksi Telegram-tunniste, ei wildcardia; molemmat API-avaimet vähintään 16 merkkiä. Tämä ei varmista omistajuutta, bind-osoitetta, dashboardia tai tehokasta palvelinauthia |
| Käyttäjän HTTPS-testipalvelu | Puuttuu | Tarvitaan olemassa olevan hostin/palvelun sijainti tai päätös perustamisesta; HTTP-smoke välitti cookien käsin, varsinaista selainta ei testattu |
| Oracle vastaa oikeasta Drive-datasta | Ei testattu | Drive-lukupääsy ja eristetty oikea Oracle-ajo puuttuvat; tarkista sama fileId/kuukausi/näkymä/snapshot, molemmat käyttäjät |
| Oikea Telegram-jatkuvuus | Ei testattu | Varmennettu testirouting erilliseen SQLiteen puuttuu; ei uutta polleria |
| Tuotannon palautuspiste | Otettu, eheys/tarkisteet varmistettu | 20260915T075851Z-4754f8ce kontin private/restore-points-hakemistossa |
| Otetun backupin SQLite-palautus | Läpäisi sandboxissa | 4 tiedostohashia, 8 taulua, eheys ok, capture muuttumaton, sandbox poistettu; acceptance-final-evidence.json |
| Täysi palvelupalautus | Avoin | Supervisor/profiilien täydelliset asetukset/palveluyksiköt ja eristetyn gateway/bridge-käynnistyksen tarkistus puuttuvat; ei live-palautusta |
| Tuotantojulkaisu | Ei tehty | Päätetään hyväksymistulosten ja erikseen rajatun sisällön perusteella |

## Lähderaportit

Raportit /home/arxcian-codex/arxcian-work/: acceptance-runtime.json, acceptance-restore-point.json, acceptance-final-evidence.json (15.9. 08:03:18 UTC), acceptance-profile-gates.json (15.9. 08:15:10 UTC). Raportit luettiin tiedostoista eikä pelkästä keskustelun onnistumisviestistä. Korjatun asetusraportin platforms-lista ei kata tehokasta ladattua runtimea eikä ole todiste adapterien puuttumisesta.

## Seuraava hyväksyntävaihe

Käyttäjältä pyydetty tieto: onko eristetty Oracle-testipalvelu, Drive-lukupääsy ja HTTPS-testiosoite jo olemassa vai perustetaanko ne nykyiselle VPS:lle. Avaimia ei keskusteluun. Täsmälliset turvalliset asetustiedostot ja kytkennät sovitaan tämän tiedon perusteella. Seuraavat testit ovat oikeita käyttäjärajapyyntöjä ja saman aikavälin Oracle–Drive-vertailuja, eivät uusintoja läpäisseestä automaattisesta testisarjasta tai backup-drillistä. Koko sivuston Oracle-toiminnot ja verkkohaku seuraava kokonaisuus.
