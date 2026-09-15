# Arxcian — jatkomuistio 15.9.2026

Tämä tiedosto kokoaa Oracle-työn tilan ja muiden keskeneräisten töiden olennaiset tiedot. Repositorion nykyisestä työkopiosta ei löytynyt aiempaa tilanne-/jatkotiedostoa, joten luotiin `docs/HANDOFF.md`. Ulkoiset muistiot säilytettiin muuttamattomina. Testitulokset koskevat alla nimettyjä ajoja; ne eivät todista tuotannon käyttäjäpolkua.

## Oracle / RJ-Mob

### Toteutettu

- Työkopio `/home/arxcian-codex/arxcian-oracle`, haara `feature/oracle-rjmob-20260915`, toteutuscommit `8d9c7197cb53cb8b5b3f2000d49c6e4ebcd0c2ee`.
- Oracle saa `/arxcian/rj-mob/etela`-myyntiseurannan valitun kuukausitiedoston ja tavoitteet/uusmyynti/kassamyynti-näkymän nykyisine rajauksineen. Uutta myyjävalitsinta ei lisätty käyttäjän aiemman päätöksen mukaan. Muiden RJ-Mob-sivujen konteksti ei sisälly tähän erään.
- Palvelin rajaa tiedoston nykyiseen kuukausilistaan. Nykyiset käyttäjät albin/arbnor näkevät jaetun RJ-Mob-datan; yksityistä keskusteluhistoriaa ei liitetä. Oracle-viesti ja sen lukutilanne ovat omistajakohtaisia.
- Näkymä ja Oracle käyttävät samaa tavoitevertailua, nykyisiä tavoitelähteitä, työpäiviä ja tapahtumakorjauksia. Myyjän kassaprovisio x10, valmiiseen kassakatteeseen ei lisäkerrointa. Prosentti on nykyisen ennusteen osuus tavoitteesta. Puuttuva arvo säilyy null-arvona, myös tyhjässä/puutteellisessa yhteissummassa; mitattu nolla säilyy nollana.
- Näkyvän laskentatuloksen tarkiste estää lähetyksen, jos palvelimen tulos poikkeaa selaimen näkymästä. Tällöin päivitetään näkymä. Tarkiste ei korvaa käyttöoikeustarkistusta. Idempotentti uusinta säilyttää tallennetun lukutilanteen, ja bridge välittää sen Hermes-ajoon.

### Testattu

- Toteutusversiolle 399 automaattitestiä läpäisi (377 Node/TS + 22 bridge), 0 epäonnistui. Kaksi oikean eristetyn Redisin testiä ohitettiin ilman testikantaa.
- Typecheck, Next build ja nykyisen sivun DOM-testi läpäisivät. DOM: kuukausi-/näkymäkonteksti, elo-/syyskuu, myöhästyvät vastaukset, tavoitteet ilman myyntiä, puuttuvat tiedot, virhetilat ja erittelypoiston säilyminen.
- Uudet laskenta-/palvelinlukijatestit kattavat syys-, loka- ja joulukuun 2026 sekä tammikuun 2027, saman fileId:n kaikissa lukijoissa, käyttäjä-/tiedostorajat, puuttuvat tiedot, muuttuneen näkymän, omistajuuden, uusinnan ja bridge-kuljetuksen.
- Puhdas testiympäristö ilman tuotantotunnuksia. Lukijoiden I/O korvattu; DOM:n 22 pyyntöä korvattu ja kirjoittavat/ulkoiset pyynnöt estetty. Jonotestit muistissa. Ei tuotantodatan kirjoituksia, oikeita AI-kutsuja tai restartteja.
- Lokit `/home/arxcian-codex/arxcian-work/oracle-{tests,typecheck,build,ui-check}.log`; DOM-skripti `oracle-ui-check.cjs` samassa hakemistossa.

### Julkaistu

Ei tätä Oracle-erää: ei pushia, tuotantoasennusta tai julkaisulupaa. Toteutus on paikallinen.

Edellisen Oracle-vuoron suorassa tarkistuksessa origin/main oli `7346755ebb4b61aea6f12429e2b8201d39a34b6d`; Production deployment `6433181173` oli success 14.9.2026 klo 08:22:16 UTC (git ls-remote ja GitHub deployment/status). Tätä dokumentointivuoroa varten julkaisua ei tarkistettu uudelleen. Vanhan RJ-Mob-muistion `0bf2b39` ei siten ole viimeisin varmennettu tuotantoversio.

### Avoinna ja seuraava tehtävä

1. Käyttäjältä kysytty kolmen parhaan myyjän mittari; vastausta ei ole. Rankingia ei toteutettu. Tarkennettava tarvittaessa myyntieurojen lähde tai tavoitemittari sekä toteuman/ennusteen käyttö.
2. Toteuta hyväksytty ranking nykyisillä rajauksilla ja puuttuvan tiedon säännöillä.
3. Vertaa varsinaisen Oracle/Hermes-vastauksen luvut samaan näkymään ja oikeisiin Drive-lukuihin esikatselussa syyskuussa 2026 ja myöhemmissä kuukausissa. Tätä ei vielä testattu; kokonaisuus ei ole hyväksymiskriteerien mukaan valmis. Ohje: [oracle-rjmob-validation.md](oracle-rjmob-validation.md).
4. Ennen mahdollista julkaisua rajaa julkaistavat commitit. Haaran pohja `b525b98` sisältää julkaisemattoman Hermes-työn; koko haaran merge vie myös sen mukaan. Oracle-erä on oma commit, ja sen koskemiin aiempiin tiedostoihin ei ollut muutoksia tuotantoversion `7346755` ja pohjan `b525b98` välillä. Sovellus ja VPS:n bridge-skripti on otettava käyttöön yhteensopivina, vasta erillisellä julkaisuluvalla.

## Keskeneräinen Hermes-tehtävä

### Toteutettu

- Erillinen työkopio `/home/arxcian-codex/arxcian`, haara `feature/albin-checklist-20260914`, nykyinen tarkistettu HEAD `b525b98`; työpuu puhdas. Tätä työkopiota ei muutettu Oracle- tai dokumentointityössä.
- Paikallinen pysyvä kolmen kohdan Arxcian-käyttötestilista nykyisen Hermes-Kanbanin päälle. Ensimmäinen tehtävä vain Albinille; Nori myöhemmin. Telegramissa aloitus, Arxcianissa saman tehtävän jatko. Ei yleistä yhteismuistia tai automaattisia agenttikäynnistyksiä.
- Kiinteä kortti `arxcian-albin-checklist-v1`, SQLite varsinainen tietolähde, Redis toimitusjono/lukukopio, kertakäyttöinen Telegram-kytkentä. Selainkatkos ja uusinta eivät luo kaksoistyötä. UI `/arxcian/personal/checklist`.
- Käyttöönotto-ohje `scripts/hermes-checklist/README.md`. Valmisteltu gateway-kopio `/home/arxcian-codex/arxcian-work/checklist-gateway-final/`, ei asennettu. Siirtopaketin `checklist-release-b149679.tar.gz` audit-osuus on vanhentunut suhteessa `b525b98`:aan.

### Testattu

- Hermes-muistion aiemmat paikalliset ajot: 385 Node- ja 14 Python-testiä sekä typecheck/build; aiempi DOM- ja synteettinen Telegram/SQLite/Redis-integraatio. Nämä eivät ole uusia tämän dokumentointivuoron ajoja eivätkä tuotantotestejä.
- Uusin käyttäjän ajama lukuraportti `/home/arxcian-codex/arxcian-work/checklist-preflight.json` v2: YAML-yhteenveto onnistui, interpreter `/opt/hermes/.venv/bin/python`, gateway/run.py:n SHA256 vastaa tarkistettua lähdepakettia. Kanban-kannat tyhjiä, uuden tehtävän/kanavataulun olemassaolo false. Tiedot perustuvat Hermes-muistion uusimpaan raporttiyhteenvetoon, eivät tämän vuoron uuteen konttitarkistukseen.

### Julkaistu

Ei ominaisuuden asennusta, aktivointia, tuotantotehtävää tai oikeaa Telegram–Arxcian-käyttäjätestiä. Julkaisulupaa ei ole; `ARXCIAN_CHECKLIST_ENABLED` ei ole aktivoitu.

### Avoinna

- Käytössä olevien profiilien tehokas oikeusraja ja Kanban-dashboardin pääsy. `multiplex_profiles=true` tai yksi Telegram-allowlist-tunniste ei yksin todista rajausta. `hermes_cli/profiles.py` puuttuu saadusta lähdepaketista, eikä v2 kata served_profiles-ajotilaa/täyttäjäpääsyä. V2:n saman tarkistuksen uusinta ei yksin ratkaise näitä puutteita.
- Nykyasennukseen sopiva bridge-valvonta ja palautus sekä mahdollisen keskeneräisen rinnakkaistoteutuksen yhtäaikaisen aktivoinnin estäminen. Ei toista Telegram-polleria.
- Codexilla ei ole suoraa Docker/root-lukuoikeutta. Varmista puuttuvat ajonaikaiset rajat, sitten erillinen julkaisulupa ja oikea käyttäjätesti.

## Aiempi RJ-Mob-työ

### Toteutettu ja aiemmin julkaistu

Tavoitelähteiden ja kassakatteen korjaukset (`845f338`) sekä Yhteensä-rivin alapuolisen erittelyn poisto (`0bf2b39`) sisältyvät nykyiseen koodipohjaan. Viestigenerointi säilyy. Erittelypoiston aiempi tuotantojulkaisu onnistui 13.9.2026; myöhempi varmennettu tuotantoversio on yllä kuvattu `7346755`.

### Testattu ja avoinna

Vanhan RJ-Mob-erän 371 testiä, typecheck, build ja DOM ovat sen aiempia tuloksia. Kirjautunut tuotannon käyttöpolku ja oikeiden Drive-lukujen vertailu jäivät avoimiksi, samoin muiden tapahtumien puuttuvat erittelyt. Oracle-erän synteettiset regressiotestit eivät korvaa näitä käyttäjätestejä. Erillistä myyjävalitsinta ei lisätä ilman uutta käyttäjäpäätöstä.

## Säilytetyt lähdemuistiot

- `/home/arxcian-codex/arxcian-work/ORACLE-JATKOMUISTIO.md`
- `/home/arxcian-codex/arxcian-work/HERMES-JATKOMUISTIO.md` (uusin 15.9.2026 v2-yhteenveto syrjäyttää aiemman uusintapyynnön)
- `/home/arxcian-codex/arxcian-work/JATKOMUISTIO.md` (vanhat haara-/julkaisutilat ovat historiallisia)

Tämä tiedosto on paikallisessa Git-työkopiossa. Sitä ei ole pushattu eikä synkronoitu ChatGPT:n pilvilähteisiin tai Hermeksen muistiin. Dokumentointimuutos ei muuta sovelluskoodia eikä aiempia testituloksia.
