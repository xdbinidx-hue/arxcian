# Oracle-bridge julkaistu tuotantoon, sivustojulkaisu käynnistetään — 15.9.2026

- **Julkaistu ja varmennettu raportista:** production-oracle-service-release.json bridge_updated=true, supervisor_restarted=true, bridge_process_verified=true. Uusi libSHA73e62d9727872792efcb035a3cfade35cf8d9d4c7329bf74cd2c806a84b9ba27; palautuskopio /opt/data/private/arxcian/oracle-production/bridge-rollback-20260915T214353Z. gateway_changed=false, checklist_activated=false. Oikeaa Oracle-vastausta ei vielä varmennettu.
- **Sivustojulkaisu:** sovelluslähde f8ef88d testattu ja rakennettu, myöhemmät commitit vain ops/docs. Remote main44fdf009dff2f9812927ffcaa4a80bf3c388c5c7 sisältyy julkaisuhaaraan; käyttäjän koko julkaisulupa voimassa. Main-push käynnistää Vercelin. Ei suoraa vercel--prod. Lopullinen Vercel-tulos ja tuotanto-HTTP kirjataan niiden valmistuessa.
- **Toimintarajaus:** checklist ei aktivoida tuotannossa ennen owner/dashboard/Telegram-hyväksyntää; lähdekoodi mukana mutta lippu suljettu. Testiavaimia/Redis/snapshotia ei julkaista tuotantoasetuksiksi. Oracle koko sivuston/webhaku edelleen seuraava kokonaisuus.
- **Avoin:** oikea Oracle–Drive-vastaus, Telegram-ketju, käyttäjäkohtaiset Hermes/dashboard-rajat, täysi palvelupalautus ja Leo4.9. tapahtumaerittely. Älä väitä koko alkuperäistä hyväksymiskokonaisuutta valmiiksi sivustojulkaisun perusteella.
- **Sijainti/seuraava:** /home/arxcian-codex/arxcian-release/docs/HANDOFF.md, release/acceptance-20260915. Seuraava main-push, Vercelin onnistumisvarmennus ja tuotannon lukutarkistus. Muiden töiden tiedot säilyvät alla.

---

# Epäonnistuneen julkaisun palautus varmennettu ja readiness korjattu — 15.9.2026

- **Varmennettu oikeasta diagnoosista:** supervisor1,bridge1, enabled-portti olemassa, config_valid=true, hermes_oracle_scope=true. Live-tiedostot vastaavat viimeistä palautuskopiota /opt/data/private/arxcian/oracle-production/bridge-rollback-20260915T214030Z. Live-libSHA827e38a530ec988f6d05f3a33ec415152df651465be3c9c0111495eab545bfec (vanha), ei uusi73e62d... . Palautus siis todettu tiedostoista ja prosesseista, ei oikeasta Oracle-vastauksesta.
- **Korjattu/testattu:** asennuksen yksittäinen4sek-prosessitarkistus korvattu enintään35sek-readiness-odotuksella, supervisorin ennenaikainen poistuminen torjutaan. Viivästynyt lapsiprosessi läpäisi eristetyllä tempfile/prosessimock-fixturellä. Päivitysvirheen JSON talletetaan nyt production-oracle-service-failure.json ennen exit1:tä; ei lokien/avainten vientiä. Python/bash-syntaksi läpäisi. Todellista alkuperäistä käynnistysvirhettä ei vielä tunneta, liian aikainen tarkistus on poistettu mahdollisena syynä.
- **Seuraava valtuutettu root-toimi:** käyttäjä uusii korjatun bash /home/arxcian-codex/arxcian-release/ops/acceptance/install-oracle-service.sh kerran. Jos epäonnistuu, ei uusintoja vaan virheraportti ja uusi diagnoosi. Jos onnistuu, varmista uudet SHA:t/prosessi ja jatka frontendin yhteensopivaan julkaisuun.
- **Julkaistu:** vanha Oracle palautettu; uutta koko tuotantoversiota ei julkaistu. Julkaisulupa voimassa. Aiemmat hyväksymisesteet edelleen avoinna. Yhteinen muistio /home/arxcian-codex/arxcian-release/docs/HANDOFF.md, muiden töiden tiedot säilyvät alla.

---

# Oracle-bridge-tuotantopäivitys epäonnistui — 15.9.2026

- **Käyttäjän todellinen ajotulos:** install-oracle-service.sh keskeytyi RuntimeError: Update failed; old bridge restored and restarted. Onnistumisraportti production-oracle-service-release.json puuttuu. Käyttäjä käynnisti komennon heti toistamiseen; tämän uusinnan tulos ei vielä tiedossa. Älä aja lisää asennuksia ennen diagnoosia.
- **Julkaistu/nykytila:** Oracle-tiedostoihin tehtiin tuotantopäivitysyritys ja virhepolku ilmoitti palauttaneensa vanhat tiedostot sekä käynnistäneensä supervisorin. Tätä ei merkitä onnistuneeksi julkaisuksi tai todisteeksi vanhan bridge-lapsiprosessin toiminnasta. Frontendiin/gatewayhin/checklist-aktivointiin ei tehty julkaisua. Julkaisulupa edelleen voimassa.
- **Valmisteltu/testattu:** ops/acceptance/diagnose-oracle-update.sh +py tekee vain lukudiagnoosin: supervisor/bridge-prosessien lukumäärä, nykyisen tunnetun supervisorin load_config-validointi (ei arvoja), state-gate-tiedoston läsnäolo, livebridge-SHA:t, viimeisin palautuskopio ja vastaavatko live-tiedostot sitä. Ei lokisisältöjä, avaimia, malliajoja, restartteja tai tuotantokirjoituksia. Python/bash-syntaksi läpäisi; todellinen diagnoosi odottaa root-käyttäjää.
- **Seuraava:** kun käyttäjän käynnistämä toinen asennusajo päättynyt, root-webconsolessa bash /home/arxcian-codex/arxcian-release/ops/acceptance/diagnose-oracle-update.sh. Lue acceptance-oracle-update-diagnostic.json, varmista toimiva vanha palvelu ja korjaa oikea epäonnistumissyy ennen uusintaa. Aiemmat API-auth/testit/backup-drill eivät uusittu.
- **Avoin:** tuotannon nykyinen bridge-prosessi ja palautuksen todellinen tila; onnistunut yhteensopiva julkaisu sekä aiemmat owner/dashboard/oikea Oracle–Drive/Telegram/täysi palvelupalautus/Leo4.9. erittely. Sovellusf8ef88d previewssä. Yhteinen muistio /home/arxcian-codex/arxcian-release/docs/HANDOFF.md, muiden töiden tiedot säilyvät alla.

---

# Kontissa valmisteltu palvelupaketti läpäisi — 15.9.2026

- **Testattu kontissa:** acceptance-service-stage.json: kaikki4 lähdetarkisteet, Python-AST ja Node--check läpäisivät. Node=/usr/local/bin/node; liveBridge=/opt/data/private/arxcian/oracle-production/release-9f26dc0/oracle-bridge.mjs; config=/opt/data/private/arxcian/oracle-production/config.json, vain key-nimet API_SERVER_KEY/ARXCIAN_ORIGIN/ORACLE_BRIDGE_SECRET vietiin. prepared_only=true, live_files_replaced=false, services_started=false.
- **Valmisteltu tuotantopäivitys:** ops/acceptance/install-oracle-service.sh +py vaihtaa vain2 Oracle-bridge-tiedostoa varmennetuista stage-lähteistä. Tarkistaa supervisorSHA:n ja tasan yhden nykyisen oman supervisor-prosessin, ottaa private bridge-rollback-<timestamp>-kopion ja vanhat SHA:t, pysäyttää täsmälleen tämän supervisorin, vaihtaa tiedostot renameilla ja käynnistää saman komennon puhtaalla ympäristöllä; tarkistaa bridge-prosessin. Epäonnistuva käynnistys palauttaa vanhat tiedostot ja supervisorin. Ei gateway-/checklist-aktivointia tai frontend-pushia tässä vaiheessa.
- **Testattu eristetysti:** installer onnistumispolku ja epäonnistuneen käynnistyksen palautus läpäisivät vain uusissa tempfile-hakemistoissa, kaikki os.kill/Popen/run/sleep korvattu; ei todellisia prosessi-/verkko-/tuotantotoimia. Python/bash-syntaksi läpäisi. Tämä ei todista täyttä tuotantopalvelupalautusta.
- **Seuraava root-toimi valtuutetulla luvalla:** bash /home/arxcian-codex/arxcian-release/ops/acceptance/install-oracle-service.sh. Tämä on oikea tuotannon Oracle-bridge-päivitys ja lyhyt yhteyskatko; käyttäjälle kerrottu. Raportti production-oracle-service-release.json. Varsinainen suoritus vielä odottaa käyttäjää; älä merkitse julkaistuksi ennen raporttia. Sitten toiminnan varmennus ja yhteensopiva frontend-julkaisu sekä jäljellä olevan Hermes-ketjun ratkaisu.
- **Julkaistu:** ei tuotantoon vielä mitään tämän kirjauksen hetkellä. Lupa voimassa. API-key-erottelu läpäisi; owner/dashboard/oikea Oracle–Drive/Telegram/täysi palvelupalautus edelleen avoinna, Leo4.9. erittely puuttuu. Sovellusf8ef88d testattu previewssä.
- **Työ/sijainti:** release/acceptance-20260915, /home/arxcian-codex/arxcian-release/docs/HANDOFF.md. Muiden keskeneräisten töiden tiedot säilyvät alla.

---

# Palvelupaketti valmisteltu erilliseen konttivaiheeseen — 15.9.2026

- **Nykytila luettu:** täydennetty supervisor-raportti vahvistaa yksityisen JSON-configin latauksen ja Node-oracle-bridge.mjs-prosessin käynnistyksen. DEFAULT=/opt/data/private/arxcian/oracle-production; supervisorSHA edelleen sama kuin palautuspisteessä. Oikeaa Node-polun ja live-bridge/config-polun muodostusta ei arvata peitetyistä vakioista.
- **Toteutettu:** ops/acceptance/prepare-service-release.sh siirtää4 palvelulähdettä uuteen private700-hakemistoon /opt/data/private/arxcian/release-f8ef88d-prepared, uid10000. Ei live-korvausta, asetusten aktivointia tai restarttia. verify-service-stage.py tarkistaa supervisorSHA:n, johtaa bridge/config/Node-polut turvallisesti AST:n sallituista lausekkeista, config-omistuksen/0600:n, Python-AST:n ja Node --check:n. Raportoi vain polut, config-key-nimet ja lähdetarkisteet, ei arvoja. Hakemiston olemassaolo estää ylikirjoituksen.
- **Testattu paikallisesti:** Python/bash-syntaksi, DEFAULT/state-polkujen fixturet, tuntematon lauseke torjuttu. Varsinainen konttiajo vielä odottaa käyttäjää; ei väitetä sitä läpäisseeksi. Aiemmat läpäisseet testit/backup-drill eivät uusittu.
- **Tarvittava pääsy/seuraava:** käyttäjä root-webconsolessa bash /home/arxcian-codex/arxcian-release/ops/acceptance/prepare-service-release.sh. Lue acceptance-service-stage.json, valmistele varsinainen yhteensopiva vaihtomenettely oikeisiin polkuihin. API-key-erottelu jo läpäisi. Owner/dashboard/oikea Oracle/Telegram/täysi palvelupalautus edelleen avoinna.
- **Julkaistu:** tuotantoon ei vielä mitään. Julkaisulupa voimassa. Sovellusf8ef88d testattu previewssä, gateway-kopio ja lähdebundle valmisteltu. Yhteinen muistio /home/arxcian-codex/arxcian-release/docs/HANDOFF.md, release/acceptance-20260915; muut työt säilyvät alla.

---

# Nykyisen supervisorin ensimmäinen käynnistysraportti vastaanotettu — 15.9.2026

- **Tarkistettu:** acceptance-service-launch.json supervisorSHA54185f029942771792d3e4aec8fc3fb3fab048ba38caf8f66f988c3ad9d6b860 sama kuin palautuspisteessä. Popen käyttää command/env ja run_child käynnistää bridge-muuttujan. Ei avainten vientiä, restarttia tai tuotantokirjoituksia.
- **Raportin puute:** ensimmäinen rajattu AST-raportti ei näyttänyt bridge-polun muodostusta ja peitti tulkin. Ei riitä asennuksen työpolun/tulkin/asetuslatauksen varmistamiseen; ei väitetä palveluasennusta valmistuneeksi.
- **Toteutettu/testattu:** tarkistin täydentää sanitized_source-kentän (AST:stä kaikki ei-sallitut tekstivakiot peitetään, tunnetut polut/tulkki/bridge-tiedostonimet säilyvät). Fixture varmisti ettei salainen vakio vuoda ja launch-polut säilyvät; Python/bash-syntaksi läpäisi. Käyttäjältä pyydetty saman inspect-service-launch.sh-komennon uusinta vain tämän raporttipuutteen vuoksi.
- **Julkaistu:** ei tuotantoon. Sovellusf8ef88d ja gateway-päivityskopio valmisteltu, julkaisulupa voimassa. API-profiilien avainerottelu läpäisi aiemmin; owner/dashboard/oikea Oracle/Telegram/täysi palvelupalautus edelleen avoinna. Seuraava: täydellisen puhdistetun käynnistyslogiikan perusteella tarkka yhteensopiva asennus. Yhteinen muistio /home/arxcian-codex/arxcian-release/docs/HANDOFF.md, muut työt säilyvät alla.

---

# API-profiilien ajonaikainen avainerottelu läpäisi — 15.9.2026

- **Testattu oikeassa ajossa:** käyttäjän root-komento check-api-auth.sh tuotti acceptance-api-auth-read.json. default /v1/models ja oracle /p/oracle/v1/models: anonymous401,invalid401,own200,other_profile401. Molemmat rejects_unauthorized_and_accepts_own_key=true. Ei malliajoja/tehtäviä, credential_values_exported=false. Tämä sulkee profiilien API-avainerottelun esteen; owner_isolation_verified=false ja dashboard_access_verified=false edelleen, ei laajempaa oikeusväitettä.
- **Valmisteltu:** erillinen gateway-kopio /home/arxcian-codex/arxcian-work/release-f8ef88d-gateway, alkuperäinen SHA tarkistettu prepare_gateway.py:llä, kaikki3 Python-tiedostoa AST-validit. run.py uusiSHA29c82cee22c850711f40c36d2140c1ca884f27887b96ae299f3430ec8df133fc. Ei tuotantotiedostojen korvausta/restarttia.
- **Seuraava konkreettinen pääsy:** nykyisen Oracle-supervisorin käynnistysrakenteen lähde tarvitaan yhteensopivaan asennukseen; aiemmat tiedot vain SHA/polut. Valmisteltu ops/acceptance/inspect-service-launch.sh root-webconsoleen. GET/verkkokutsuja ei tee, lukee vain supervisor.py AST:n, peittää muut tekstiarvot, raportoi prosessikutsujen rakenne/polut; raportti arxcian-work/acceptance-service-launch.json. Python/bash-syntaksi ja salaisuuksien peittävät fixturet läpäisivät; oikea suoritus odottaa käyttäjää. Ei aiempien testien/backup-drillin uusintaa.
- **Julkaistu:** tuotantoon ei vielä mitään; koko julkaisulupa voimassa. Lähde f8ef88d testattu previewssä, paketti valmisteltu. Owner/dashboard, oikea Oracle–Drive, Telegram ja täysi palvelupalautus edelleen avoinna; Leo4.9. erittely puuttuu. Älä nimeä koko Hermes-oikeusporttia läpäisseeksi pelkän models-authin perusteella.
- **Työ/sijainti:** release/acceptance-20260915, /home/arxcian-codex/arxcian-release/docs/HANDOFF.md yhteinen jatkomuistio. Muiden keskeneräisten töiden tiedot säilyvät alla.

---

# Käyttäjä määräsi koko tuotantojulkaisun nyt — 15.9.2026

- **Lupa:** käyttäjä vahvisti jälleen "julkaise kaikki nyt tuotantoon". Voimassa koko nykyiselle julkaisukokonaisuudelle, ei uutta lupakysymystä. Oracle koko sivuston toiminnot/verkkohaku edelleen seuraava kokonaisuus.
- **Nykytila varmennettu:** julkaistava sovelluslähde f8ef88d, puhdas release/acceptance-20260915; viimeisin build/tyypit, rajakohdat ja React/HTTP/Drive-fingerprintit läpäisseet. Remote main edelleen44fdf009dff2f9812927ffcaa4a80bf3c388c5c7. Ei läpäisseiden testien uusintaa.
- **Valmisteltu:** production-release-f8ef88d.bundle täydellä historialla, bundle verify läpäisi; /home/arxcian-codex/arxcian-work/production-release-f8ef88d.bundle SHA256 c4b0625c30dcaa5afc357c021c2ab61e238fe56bff8cf67ded6d3e7520adf659. Aiempi datapalautuspiste ja eristetty backup-drill säilyvät, ei uusintaa.
- **Julkaistu tuotantoon:** ei vielä mitään. sudo -n vaatii salasanan; Codex uid1000 ei voi asentaa Hermes/gateway/bridge-palveluita Docker-konttiin. acceptance-api-auth-read.json puuttuu edelleen. Frontendin yksittäinen main-push laukaisee Vercelin mutta jättäisi uuden viewContext-protokollan ja vanhan live-Oraclen yhteensopimattomiksi; sitä ei tehdä koko julkaisuna.
- **Tarvittava pääsy/seuraava:** käyttäjä ajaa root-webconsolessa bash /home/arxcian-codex/arxcian-release/ops/acceptance/check-api-auth.sh (GET-only, ei malliajoja/tehtäviä). Lue raportti, ratkaise todelliset käyttöoikeudet ja valmistele yhteensopiva root-palveluasennus. Oikea Oracle–Drive-vastaus, Telegram-jatkuvuus ja täysi palvelupalautus edelleen avoinna; Leo4.9. erittely puuttuu. Käyttäjän julkaisulupa ei korvaa puuttuvaa root-pääsyä/testinäyttöä.
- **Työn sijainti:** /home/arxcian-codex/arxcian-release/docs/HANDOFF.md yhteinen jatkomuistio; muut keskeneräiset työt säilyvät alla. Preview ja readonly-watcher edelleen toimivat viimeisimmällä f8ef88d-lähteellä.

---

# Myyntiseurannan tehovärit neljään portaaseen — 15.9.2026

- **Käyttäjäpäätös/toteutettu:** myyntiseurannan teho <7punainen,7–<8oranssi,8–<9keltainen,>=9vihreä. Koskee myyjä/myymälä/tehojen yhteensä-solujen taustaa ja tekstiä sekä liittymä€/kpl väritystä. Rivitaustat neutraalit, F-Secure- ja Runrate-rajat säilyvät. Käytetään olemassa olevaa yhteistä palettia. Ei teholukujen laskentamuutosta; muiden sivujen vanhaa tehoTaso-helperiä ei muutettu tässä myyntiseurannan hyväksymistyössä.
- **Testattu:** kuusi rajatarkistusta6,99/7/7,99/8/8,99/9 ilman verkkopyyntöjä/kirjoituksia; nykyiseen Drive-captureen perustuva React/HTTP-tarkistus läpäisi neljän portaan tehosolut ja kolme näkymäfingerprintiä. Testikirjoitukset vain omaan Redis-palveluun, ei tuotantoa. Lokit arxcian-work/efficiency-four-bands-{build,ui}.log. Lopullinen build läpäisi exit0 sisältäen tyyppitarkistuksen; oma preview päivitetty ja readonly-watcher palautettu.
- **Julkaistu:** ei tuotantoon; oma preview päivitetty onnistuneella buildilla, readonly-watcher palautettu. Voimassa oleva julkaisulupa ja aiemmat käyttöönoton esteet säilyvät.
- **Avoin/seuraava:** käyttäjän neljän tehovärin selaintarkistus; Leon4.9. tapahtumaerittely sekä Hermes/Oracle/Telegram/palautusesteet edelleen avoinna. Työ /home/arxcian-codex/arxcian-release, release/acceptance-20260915. Muut keskeneräiset työt säilyvät alla.

---

# Tehosolut myös taustavärillisiksi — 15.9.2026

- **Toteutettu:** myyntiseurannan tehosoluissa koko solun taustaväri yhteisestä paletista, ei pelkkä tekstiväri. Yhdistetty teho <7punainen,7–<9keltainen,>=9vihreä; myyjät/myymälät ja tehojen yhteensä-solut. Puuttuva/arvioimaton teho neutraali; F-Secure-yhteensä edelleen neutraali. Rivitaustoja ei palautettu.
- **Testattu:** kohdennettu React/HTTP-tarkistus tehosolun taustavärille nykyisillä myyjätoteumilla; ensimmäisen tarkistuksen väärä sarakeindeksi korjattu nykyiseen ainoaan tehosarakkeeseen. Näkymäfingerprintit/F-Secure-värit ja neutraalit rivit tarkistetaan samalla. Vain oma testi-Redis, ei tuotantokirjoituksia. Lokit arxcian-work/efficiency-cell-{build,ui}.log. React/HTTP-tarkistus läpäisi. Build läpäisi exit0 sisältäen tyyppitarkistuksen; oma preview päivitetty ja readonly-watcher palautettu.
- **Julkaistu:** ei tuotantoon; oma preview päivitetty onnistuneella buildilla, readonly-watcher palautettu. Julkaisulupa ja aiemmat palveluesteet säilyvät.
- **Avoin/seuraava:** käyttäjän tehosolujen selaintarkistus. Leon4.9. erittely ja aiemmat Hermes/Oracle/Telegram/palautusesteet edelleen avoinna. Työ /home/arxcian-codex/arxcian-release, release/acceptance-20260915. Muut työt säilyvät alla.

---

# Väritystä vähennetty käyttäjän hyväksyntäpalautteesta — 15.9.2026

- **Toteutettu:** Runrate vain ennuste ja ennuste% värilliset; tavoite/toteuma neutraalit. Myyntiseurannan myyjä/myymälärivien tehoväriset taustat poistettu, neutraali vuororaitaisuus. F-Secure kpl/€ myyjillä <5punainen/5–9keltainen/>=10vihreä, myymälöillä käyttäjän viimeisestä päätöksestä <30punainen/>=30vihreä; käyttäjän lisätarkennuksesta yhteensä-rivien F-Secure-solut neutraalit. Liittymä€ ja kpl värit näkyvän yhdistetyn tehon mukaan (<7/7–<9/>=9); teholukujen omat tekstivärit säilyvät. Albin/puuttuva teho neutraali. Yhteinen paletti ja aiemmat prosentti/F-Secure-rajat säilyvät, ei laskentamuutosta.
- **Testattu:** React/HTTP-tarkistus läpäisi neutraalit myyjärivit, F-Secure-värit ja kaikki kolme Drive-näkymäfingerprintiä, yhteinen lataus/focus säilyivät. Vain oma testi-Redis, ei tuotantokirjoituksia. Myymälöiden viimeinen F-Secure30-raja ja neutraalit yhteensä-kpl/€-solut läpäisivät lisäksi React/HTTP-tarkistuksen (store-fsecure-ui.log). Lopullinen myymälärajan build läpäisi exit0; oma preview päivitetty ja readonly-watcher palautettu. Lokit arxcian-work/reduced-colors-{build,final-build,ui}.log. Ensimmäinen vähennetyn värityksen build läpäisi; yhteensä-rivien tarkennuksen build läpäisi myös; myymälöiden30-rajan lopullinen build läpäisi (reduced-colors-store-build.log).
- **Julkaistu:** ei tuotantoon; lupa ja aiemmat palveluesteet säilyvät. Oma preview päivitetty onnistuneella buildilla ja readonly-watcher palautettu.
- **Avoin/seuraava:** käyttäjän vähennetyn värityksen selaintarkistus; Leon4.9. erittely ja Hermes/Oracle/Telegram/palautusesteet edelleen avoinna. Työ release/acceptance-20260915, /home/arxcian-codex/arxcian-release. Muiden töiden tiedot säilytetty alla.

---

# Myyjien ja myymälöiden tehorivit sekä yhteiset sävyt — 15.9.2026

- **Toteutettu:** myyjän rivitausta yhdistetyn Liitt+Kassa-tehon mukaan: <7 punainen,7–<9 keltainen,>=9 vihreä. Myymälän rivitausta samoin näkyvän yhdistetyn tehon (liittEur+kassaRjmob)/tunnit mukaan. Puuttuva teho/tunnit tai arvioimaton Albin säilyvät neutraalina. F-Secure kpl/€ solujen omat rajat <5/5–9/>=10 säilyvät rivitaustan päällä.
- **Identtiset sävyt:** uusi src/lib/rjmobVarit.ts yhteinen paletti myyjä/myymäläriveille, F-Secure-soluille, Runratelle ja tavoiteprosenttisoluille. Vihreä #dcfce7, keltainen #fef9c3, oranssi #ffedd5, punainen #fee2e2; tekstivärit samasta paletista. Eri mittarien värirajat säilyvät.
- **Testattu:** nykyisen Drive-aineiston React/HTTP-tarkistus läpäisi myyjien tehoväririvit ja F-Secure kpl/€ yhtenäiset sävyt; kaikki kolme näkymäfingerprintiä ja yhteinen lataus/focus säilyivät. Testikirjoitukset vain omaan Redis-palveluun, ei tuotantokirjoituksia. Lopullinen build läpäisi exit0 (sisältää tyyppitarkistuksen); oma preview päivitetty ja readonly-watcher palautettu. Lokit arxcian-work/shared-row-colors-{ui,build}.log.
- **Julkaistu:** ei tuotantoon. Voimassa oleva lupa ja aiemmat Hermes/Oracle/Telegram/palautusesteet säilyvät. Preview päivitetty onnistuneella lopullisella buildilla; oma readonly-watcher käynnissä.
- **Avoin/seuraava:** selaintarkistus myyjä/myymäläriveille ja identtisille sävyille; Leon4.9. tapahtumaerittely odottaa vahvistusta. Työ /home/arxcian-codex/arxcian-release, release/acceptance-20260915. Muiden töiden tiedot säilyvät alla.

---

# F-Securen kappaleet ja eurot samoilla värirajoilla — 15.9.2026

- **Toteutettu:** myyntiseurannan F-Secure alle5 punainen,5–9 keltainen,>=10 vihreä koko solu. F-Secure € käyttää saman rivin kpl-värirajaa; myyjät, myymälät ja yhteensä-rivit. Runraten ennusteprosentin värirajat säilyvät, ei myyntilaskennan muutosta.
- **Testattu:** nykyiseen Drive-captureen perustuva React/HTTP-tarkistus läpäisi myyjien kaikkien F-Secure-kpl/eurosolujen taustan ja saman tekstivärin; kolmen näkymän fingerprintit säilyivät. Ensimmäinen build keskeytyi SIGKILL:iin; oma readonly-watcher pysäytettiin väliaikaisesti muistikuorman vähentämiseksi. Buildin uusinta läpäisi exit0. Oma preview päivitetty onnistuneella buildilla ja readonly-watcher palautettu. Lokit arxcian-work/fsecure-bands-{build,build-retry,ui-check}.log. Testikirjoitukset vain eristettyyn Redis-palveluun; ei tuotantokirjoituksia.
- **Julkaistu:** oma preview, ei tuotantoon. Julkaisulupa voimassa, aiemmat käyttöönoton esteet säilyvät.
- **Avoin/seuraava:** käyttäjä päivittää nykyisen preview-välilehden ja tarkistaa värit. Leon4.9. tapahtumaerittely odottaa käyttäjätietoa; Hermes/root-auth, oikea Oracle–Drive, Telegram-jatkuvuus ja täysi palvelupalautus edelleen avoinna. Työ /home/arxcian-codex/arxcian-release, release/acceptance-20260915. Muut keskeneräiset työt säilyvät alla.

---

# F-Secure vihreä vähintään10 — 15.9.2026

- **Toteutettu:** käyttäjän tarkennus: F-Secure >=10 vihreä koko solu myyntiseurannan myyjä- ja myymälätaulukoissa. Korvaa aiemman >10-rajan, ei runrate-värirajojen muutosta.
- **Testattu:** React/HTTP-tarkistus läpäisi: nykyisessä Drive-aineistossa3 myyjää tasan10, >=10 vihreä tausta/teksti ja <10 ilman vihreää taustaa. Näkymäfingerprintit säilyivät. Testikirjoitukset vain omaan Redis-palveluun. Build ja preview-päivitys tehdään tälle lähdeversiolle, lokit arxcian-work/fsecure-ten-{build,ui-check}.log.
- **Julkaistu:** oma preview päivitetty onnistuneella buildilla; ei tuotantoon. Lupa voimassa, muut julkaisun esteet alla edelleen avoinna.
- **Seuraava:** käyttäjä päivittää previewn ja tarkistaa myös tasan10-solut. Leo4.9. erittely odottaa vahvistusta. Työ /home/arxcian-codex/arxcian-release, release/acceptance-20260915. Muiden töiden tiedot säilytetty alla.

---

# Taulukoiden keskitys ja mittarien taustavärit — 15.9.2026

- **Toteutettu:** kaikki RJ-Mob-taulukoiden otsikot/solut, nimet ja yhteensä-rivit keskitetty. Myyntiseurannan F-Secure >10 koko solu vihreä (myyjät/myymälät). Runraten tavoite/toteuma/ennuste/% kaikki samalla ennusteprosentin värillä kunkin mittarin sisällä; liittymät, F-Secure ja kassakate itsenäiset, myös yhteensä-rivit. Rajat edelleen >=100vihreä,90–99keltainen,80–89oranssi,<80punainen; puuttuva prosentti neutraali. Ei laskentamuutosta.
- **Testattu:** kohdennettu olemassa olevan React/HTTP-näkymätarkistuksen kertalaajennus: jokainen kaikkien kolmen näkymän taulukkosolu keskitetty, F-Secure koko solu vihreä, Runrate kaikkien kolmen ryhmän neljä solua vastaavat oman prosenttisolun tausta/tekstiväriä. Drive-fingerprintit ja yhteinen lataus/focus ennallaan läpäisevät. Testikirjoitukset vain previewn omaan Redis-palveluun, ei tuotantokirjoituksia. Lokit arxcian-work/table-{centering,colors}-ui-check.log ja build-lokit.
- **Julkaistu:** vain omaan previewyn onnistuneen lopullisen buildin jälkeen, ei tuotantoon. Tuotantojulkaisulupa voimassa; aiemmat palvelukäyttöönoton esteet säilyvät.
- **Avoin/seuraava:** käyttäjä päivittää previewn ja tarkistaa keskityksen sekä mittarikohtaiset taustavärit. Leo4.9. todellinen tapahtumamyynti tai vuoromerkinnän korjaus odottaa käyttäjätietoa. Hermes/root-auth, oikea Oracle–Drive, Telegram ja täysi palvelupalautus edelleen avoinna. Työ /home/arxcian-codex/arxcian-release, release/acceptance-20260915. Muiden töiden tiedot säilyvät alla.

---

# Tapahtumapäivät ja puuttuneet ennusteet korjattu — 15.9.2026

- **Vahvistettu käyttäjältä:** Iisalmi Alec/Hamza 3.–5.9.2026, liittymät 82/127; Ylöjärvi Joona 4.9.2026, liittymät20. Kuvien toteumat sisältyvät kuukausimyyntiin. Tämä korvaa aiemman Iisalmi4.–6.9.-päiväyksen ja ratkaisee alla mainitun puuttuvan erittelyn; tavalliseen ennusteeseen vaihtamista ei tarvita.
- **Toteutettu:** oikeat tapahtumapäivät, Joonan Ylöjärvi-erittely ja työvuorojen tarkistus. Malmi mukaan lukien Joona39/3pv, Alec132/5pv, Hamza238/6pv. Toteumaa ei lisätä toistamiseen. Tulevat tapahtumat edelleen20/pv; tuntematon mennyt tapahtuma, puuttuva vuoro ja kaksoisvuoro estävät epäluotettavan ennusteen.
- **Testattu:**19 kohdennettua tapahtuma/rivitestiä, typecheck sekä uusi oikea Drive-luku (36 readonly-vastausta, kaikki kolme lukijaa onnistuneet, kuukausilähteen modifiedTime muuttumaton). HTTP/React-testi läpäisi kaikki kolme näkymäfingerprintiä, yhteisen latauksen molemmat järjestykset, focus-päivityksen ja käyttörajat;15 GET-datapyyntöä, kirjautumiskirjoitukset vain previewn omaan Redis-palveluun. Ei tuotantokirjoituksia tai oikeaa Oracle-malliajoa. Lokit arxcian-work/event-dates-{tests,typecheck,drive-capture,ui-check}.log.
- **Testiversiossa nyt:** Joona liittymäennuste104,14 (69,43%), Alec220,57 (68,93%), Hamza473,14 (105,14%) tämän lukutilanteen perusteella. Oma readonly watcher käynnistetty uudelleen; Next-build edelleen62c3bfc, lukija käyttää uusia lähteitä. Ennen tuotantoa lopullinen build edelleen tehtävä. Käyttäjä avaa nykyisen toimivan preview-välilehden ja päivittää sivun.
- **Julkaistu tuotantoon:** ei mitään tässä muutoksessa. Aiempi julkaisulupa voimassa; tuotantoversion väitettä ei tehdä preview-testistä.
- **Avoin / seuraava:** käyttäjän kolmen ennusteen selaintarkistus; sen jälkeen aiemmat Hermes/root-auth, oikea Oracle–Drive-vastausvertailu, Telegram-jatkuvuus ja täysi palvelupalautus sekä lopullinen build ja yhteensopiva tuotantokäyttöönotto. Oracle koko sivuston toiminnot/verkkohaku seuraava kokonaisuus. Työ release/acceptance-20260915, /home/arxcian-codex/arxcian-release; muiden keskeneräiset työt säilyvät alla.

---

## Operaattorien nollatulkinta vahvistettu

Kaikkien operaattorien blank-sales=nolla vahvistettu käyttäjältä. Olemassa olevien sarakkeiden tyhjät solut0; formula-error/missing-column null. Oikeassa uudessa readonly-lukutilanteessa uusmyynnin yhteensä ja päiväluvut16/16. 38 kohdennettua testiä/typecheck ja päivitetyn datan HTTP/React/focus/fingerprint läpäisi. Tapahtuma20/25/>30-rajat toteutettu; kolme puutteellisesta menneiden päivien erittelystä estyvää liittymäennustetta edelleen avoinna, eivät ratkea minimitavoitteen asettamisesta. Tuotantoon ei julkaistu; lupa säilyy. docs/HANDOFF.md sisältää täsmälliset päivät ja seuraavan päätöksen.

## Myyntiseurannan käyttötestin jatkomuutokset

Yksi yhdistetty tehosarake, mitatun myyjätehon <7 punainen rivi, >10 F-Secure vihreä luku, viestikortti näkymänappien yläpuolelle, oranssi runrate 80–89%, Basri pois 2026-09 alkaen. Stevenin tuore lähdetavoite 100/15/700 varmennettu readonly. Previewn erillinen readonly lukija päivittyy 60s, selain päivittää kolme reittiä samalla latausrajalla. 57 kohdennettua testiä +typecheck/build +post-restart DOM/HTTP/focus läpäisivät. Ennusteiden tapahtumafallback ja muiden operaattorien tyhjien solujen nollatulkinta odottavat käyttäjän päätöstä, ei merkitä korjatuiksi. Ei tuotantojulkaisua tässä erässä; aiempi lupa voimassa. docs/HANDOFF.md sisältää pääsyesteet ja jatkon.

## Käyttäjätestin korjaukset: Winpos ja operaattorit

Elisan Pakettiliittymät-otsikon whitespace ja tyhjä Telia-yritysuusmyynti korjattu. Winpos-arkiston erittely luetaan suoraan readonly, ei tuontia Exceliin tai cron-kirjoitusta. Kassasivu/Oracle-data erottavat raportin tilanteen (uusin raportti 1.9.2026, tilanne 31.8.2026) valitun kuukauden Excel-katteesta. Raportin jakson alkua ei lähteessä ole, ei arvata. Yksi raportti, ei päällekkäisten kertymien summausta. Käyttäjän uusi hyväksyntä tarvitaan; tämä ei todista varsinaisen Oracle-vastauksen toimivuutta. Ajantasaiset testit/julkaisut docs/HANDOFF.md.

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
