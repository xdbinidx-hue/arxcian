# Preview ei avaudu käyttäjälle — tarkistus 15.9.2026

- **Toteutettu:** ei uutta sovelluskoodimuutosta eikä palvelurestarttia. Nykyiset testipalvelut edelleen käynnissä. Tuotantojulkaisulupa säilyy voimassa; tuotantoon ei tässä vuorossa julkaistu.
- **Testattu nyt:** VPS:n loopback-proxy /acceptance ja /login 200 myös Host localhost:61568:llä; kirjautumissivun kaikki 7 viitattua Next-tiedostoa 200. Vain GET, ei kirjautumista, testikirjoituksia tai tuotantodataa muuttavia pyyntöjä. Aiemmat sovellustestit eivät uusittu.
- **Avoin käyttäjäpääsy:** käyttäjä ei saa previewtä auki. Palvelimen HTTP200 ei todista Macin porttivälityksen toimivuutta. Aiemman vastauksen vaihtuva preview-porttilinkki ei ole varmennettu käyttäjäosoite. Codexin browser-open jäi queued-tilaan, ei todistetta selaimessa renderöinnistä. Tässä tehtävässä ei ole Macin terminaalia liitettynä tai työkalua paikallisen SSH-tunnelin tarkistamiseen.
- **Käyttäjältä kysytty:** tarkka virheilmoitus ja onko SSH-tunneli ajettu Macin Terminalissa sekä jätetty käyntiin. Kun tunneli käyttää paikallista 3302-porttia, osoite on http://localhost:3302/acceptance; VPS-webconsoleen ajettu tunneli ei tee Macin yhteyttä. Älä anna uusia vaihtuvia portteja toimivina ilman käyttäjäpään vahvistusta.
- **Seuraava:** ratkaise käyttäjän selainyhteys virheen/SSH-tuloksen perusteella. Julkaisutyön root-auth-raportti ja Hermes/Oracle-käyttöönoton puuttuva root-pääsy säilyvät erillisinä avoimina asioina alla. Ei uutta julkaisulupakysymystä.

---

# Tuotantojulkaisulupa ja valmistelu — 15.9.2026

- **Lupa:** käyttäjä sanoi ”julkase kaikki tuotantoon”. Voimassa oleva lupa koskee nykyistä RJ-Mob/Oracle/Hermes-julkaisukokonaisuutta, myös tarvittavaa käyttöönottoa. Uutta julkaisulupaa ei pyydetä. Koko sivuston Oracle-toiminnot/verkkohaku ovat edelleen seuraava toteutuskokonaisuus; niitä ei toteutettu.
- **Nykyinen tuotanto tarkistettu:** origin/main `44fdf009dff2f9812927ffcaa4a80bf3c388c5c7`; GitHub Production deployment `6460090985` success 15.9.2026 13:36:36 UTC. Tämä uudempi Winpos-automaattituonnin poisto säilytetty: yhdistetty release-haaraan konfliktitta, sovellusversio `cfa84ae`.
- **Toteutettu:** julkaisutyö `/home/arxcian-codex/arxcian-release`, haara `release/acceptance-20260915`. Lähdepaketti `/home/arxcian-codex/arxcian-work/production-release-cfa84ae.bundle`, SHA256 `0e2a6c78052027590fb30c4460f24fbb2c5701da32030fdc3ae874d45cba25ef`. Ei tuotantotunnuksia/testiavaimia paketissa.
- **Testattu muutoksen vuoksi:** mainin muuttamien lukijoiden/cronin/Oracle-kontekstin 42 testiä läpäisi. Repon julkaisugate: 378 Node/TS +22 bridge läpäisi, kaksi eristettyä Redis-integraatiota ohitettu ilman testiasetuksia; typecheck läpäisi. Clean env-i, ei tuotantotunnuksia tai kirjoitustestejä tuotantokantoihin. Aiemmat backup-/DOM-testit säilyvät, ei uusittu. Build rinnakkaisajossa SIGKILL; erillinen uusinta läpäisi exit 0. Loki production-release-build-retry.log. Sovelluksen julkaisugatet nyt läpäisty.
- **Julkaistu tämän pyynnön perusteella:** ei vielä mitään, ei main-pushia/uutta Vercel-tuotantojulkaisua tai Hermes-asennusta. Pelkkä frontend-julkaisu jättäisi vanhan Oracle-bridgen sivuuttamaan uuden viewContextin; koko ketju vaatii yhteensopivan VPS-päivityksen. Julkaisulupa ei poista puuttuvaa pääsyä tai todistamattomia oikeusrajoja.
- **Puuttuva pääsy:** uid1000: sudo -n vaatii salasanan, Docker socket permission denied. Käyttäjältä pyydetty vain root-webconsoleajo `bash /home/arxcian-codex/arxcian-release/ops/acceptance/check-api-auth.sh`; raportti puuttuu edelleen. Se on GET-only eikä julkaisu. Root tarvitaan myös varsinaiseen Hermes/gateway/bridge-asennukseen ja hallittuun restarttiin. Ei oleteta tuntematonta supervisor-käynnistystä.
- **Seuraava:** vahvista build, lue root-auth-raportti, valmistele nykyiseen supervisor-asennukseen sopiva VPS-käyttöönotto ja palautus. Ratkaise runtime-oikeudet ja oikea Oracle-Drive-vastaus; julkaise jo annetun luvan perusteella yhteensopiva kokonaisuus, tarkista tuotanto. Älä kysy julkaisulupaa uudelleen. Muut avoimet käyttäjätesti/Telegram/täysi palvelupalautus ja aiemmat muistiot säilyvät alla.

---

# Preview-yhteyden korjaus — 15.9.2026

- **Toteutettu:** käyttäjän ilmoittama avaamisongelma toistettu: omat Next/proxy-prosessit eivät kuunnelleet. Käynnistetty vain eristetty preview uudelleen erillisissä prosessisessioissa. Uusi `ops/acceptance/start-preview.py` tekee saman ilman riippuvuutta transientin exec-session elinkaaresta, kieltää rinnakkaisen käynnistyksen ja poistaa vain connection-refused oman Redis-socketin. Ei automaattista VPS-reboot-käynnistystä tai palveluvalvontaa.
- **Toteutettu:** proxy hyväksyy localhost/127.0.0.1:n myös Codexin välitetyllä portilla (havaittu selaimen URL-portti 61434). Aiempi tarkistus hyväksyi vain 3302 ja esti eri portin Host-otsakkeen. Bind pysyy 127.0.0.1:3302; vieraat hostit edelleen torjutaan.
- **Testattu:** erillisestä seuraavasta exec-kutsusta /acceptance ja /login HTTP 200 Host localhost:61434:llä, anonyymi data 401, vieras host 403. Uusi välitetyn Hostin regressio ja snapshot-HTTP/React-testi läpäisivät. Käynnistin torjui jo käytössä olevan portin; syntax tarkistettu. Käyttäjän Macin/previewn päästä todellinen avaaminen vielä vahvistamatta. Selainpaneelin avaus pyydetty Codex-työkalulla (queued), ei näyttöä renderöinnistä.
- **Julkaistu:** vain omat testiprosessit uudelleenkäynnistetty, ei tuotantojulkaisua/muutosta. Sovelluskoodi/laskennat muuttumattomia, aiemmat 13 testiä ja Drive-vertailut säilyvät; ei koko testisarjan uusintaa.
- **Seuraava:** käyttäjä päivittää nykyisen /acceptance-previewtabin. Jos yhteys edelleen puuttuu, tarvitaan Macin välityksen virhe/SSH-yhteyden tila. Hermes-auth, oikea Oracle-vastaus ja täysi palvelupalautus ovat edelleen avoimia kuten alla.

---

# Jatkomuistio — Drive-lukutesti ja hyväksyntäesteen korjaus 15.9.2026

- **Toteutettu:** yhteinen julkaisutyö `/home/arxcian-codex/arxcian-release`, haara `release/acceptance-20260915`, edellinen commit `9f3edff`; tämän päivityksen commit sisältää Drive-snapshot-testipalvelun ja laskentakorjauksen. Google-avaimen käyttäjäimportti tarkistettu: yksityinen `arxcian-work/acceptance-preview/drive-candidate.json` 0600. Ei aktiivista sovellusavainta eikä salaisuuksia Gitissä.
- **Toteutettu korjaus:** oikealla datalla myyjien UI-järjestys aiheutti summan `7725.800000000001` / `7725.8` eron ja esti Oracle-näkymätunnisteen hyväksynnän. Myyjäkokonaissumman syöte nyt vakaassa nimijärjestyksessä; rivien näyttöjärjestys säilyy.
- **Testattu:** nykyiset kolme Google-lukijaa lukivat oikean syyskuun 2026 samalla tiedostolla readonly-scopellisessa erillisprosessissa, kaikki onnistuivat, lähdetiedoston modifiedTime säilyi. 34 lukuvastausta talletettu yksityiseen captureen. Myöhempää kuukautta ei löytynyt nykyisestä listasta. Ei Google-kirjoituksia tai avaimen aktivointia sovelluksessa. Korjauksen jälkeen vain laskennat uusittu samasta capturesta, alkuperäinen lukuaika säilytetty.
- **Testattu:** korjatun moduulin ja Oracle-kontekstin 13 testiä, typecheck ja Next build läpäisivät. Uusi HTTP + oikean React-sivun DOM-testi: kaikki kolme näkymätunnistetta vastaavat Drive-capturea; molempien testikäyttäjien yhteinen data, anonyymi/peukaloitu istunto torjuttu, väärä tiedosto torjuttu, webhook-reitti estetty, kytkemätön Oracle palauttaa 503. Testien toistossa oman Redisin login-kiintiö täyttyi (429); vain eristetty testilaskuri poistettiin. Tuotantoon ei yhdistetty. Aiemmat läpäisseet testit/backup-drill säilyvät alla eikä niitä uusittu.
- **Testiversio:** loopback `http://localhost:3302/acceptance`, SSH-tunneli `ssh -N -L 3302:127.0.0.1:3302 arxcian-codex@77.37.49.27` käyttäjän olemassa olevalla VPS-SSH-tunnistautumisella. Oma Next 3300, oma Redis 3301/Unix socket/AOF, snapshot-proxy 3302. Ei julkista HTTPS-osoitetta; käyttäjän todellinen selain-/SSH-kirjautumistesti vielä tekemättä. Testisalasanat yksityisessä browser-credentials.json:ssa; niitä ei pidä kopioida keskusteluun. Snapshot sisältää oikeaa liiketoimintadataa, ei synteettistä, eikä jatkuvasti päivity. Checklist-kirjoitukset vain omaan testijonoon; Oracle ja Telegram eivät kytkettyinä.
- **Julkaistu:** ei tuotantoon mitään, ei pushia tai tuotantorestarttia. Vain paikallinen eristetty testipalvelu käynnistetty korjatulla buildilla. Ei julkaisulupaa.
- **Avoimet hyväksyntäesteet:** Hermesin todellinen profiili-/käyttäjä-/dashboard-raja; eristetty oikea Oracle ja vastauksen vertailu tämän saman näkymän/aikavälin lukuihin; Telegram-jatkuvuuden oikea käyttäjätesti; täysi palvelupalautus. Otettu palautuspiste `20260915T075851Z-4754f8ce` ja backupin SQLite-sandbox-palautus läpäisty aiemmin; ei väitettä täydestä palvelupalautuksesta.
- **Seuraava käyttäjätoimi:** root-webconsole `bash /home/arxcian-codex/arxcian-release/ops/acceptance/check-api-auth.sh`. GET-only nykyisen gatewayn models-reittiin anonyymi/virheellinen/oma/toinen profiiliavain; ei malleja, tehtäviä tai avainarvojen vientiä. Raportti `arxcian-work/acceptance-api-auth-read.json` puuttuu vielä. Tämä tarvitaan ennen oikean Oracle-ajon turvallista kytkentää; Docker/root-pääsy ei ole Codexilla.
- **Seuraava työ:** lue tämä auth-raportti, ratkaise runtime-eristys ja todellinen Oracle-vastaus, täysi palautusmenettely ja käyttäjän hyväksyntä. Koko sivuston Oracle-toiminnot ja verkkohaku säilyvät seuraavana kokonaisuutena, niitä ei toteuteta tässä. Säilytetyt muiden töiden muistiot alla; Macin muistiota ei ole tarkistettu.

---

# Testisijainnit luettu ja Vercel-pääsy vahvistettu — 15.9.2026

- **Varmennettu:** acceptance-test-access.json luettu suoraan. Rajatuista tunnetuista sijainneista löytyivät /opt/data/.env ja /opt/data/profiles/oracle/.env, molemmissa API_SERVER_KEY. oracle-preview/oracle-staging/acceptance-hakemistoja ei löytynyt, ei GOOGLE_SERVICE_ACCOUNT_KEY:tä näistä hakupaikoista. Tämä ei ole koko VPS:n credential-inventaario eikä todista muiden sijaintien puuttumista. Supervisorin AST:stä ei löytynyt aiemman rajauksen mukaisia absoluuttisia lähdepolkuja.
- **Käyttäjän päätös/tieto:** käyttäjällä on pääsy Verceliin. Sovelluskoodin vaatima Google-JSON on GOOGLE_SERVICE_ACCOUNT_KEY. Sen olemassaoloa Vercelissä ei vielä tarkistettu eikä avainta siirretty. Vercelin nykyinen virallinen ohje tarkistettu: Project Settings → Environment Variables; Sensitive-arvoa ei voi lukea takaisin. Tuotantoavainta ei poisteta/vaihdeta tämän selvityksen vuoksi.
- **Toteutettu:** ops/acceptance/import-drive-key.py valmis. Root-webconsolessa piilotettu myös monirivinen JSON-syöte LOPPU-riviin asti, tunnetun Google token-endpointin ja service_account-rakenteen tarkistus, uusi 0600 drive-candidate.json Codex-omistukseen; ei ylikirjoitusta, verkkokutsuja tai app-aktivointia. Active drive-readonly.json ei synny. Avainarvoja ei keskusteluun tai Git-tiedostoihin.
- **Toteutettu:** ops/acceptance/check-api-auth.sh + .py käyttää löydettyjä gateway-avaimia vain kontin sisällä GET /v1/models ja GET /p/oracle/v1/models -lukupyyntöihin. Anonyymi/virheellinen/oma/toinen profiiliavain statuskoodeina; ei kehoja, avainarvoja, malliajoja tai tehtäviä. Per-user omistajuus/dashboard-verification merkitty false; portti luetaan nykyisistä API-asetuksista, vain loopback-URL. Todellinen root-ajo vielä tekemättä.
- **Testattu uutta:** importer-fixture: 0600, overwrite refusal, tuntematon token-URL torjuttu. Oikea tmp-PTY multiline-input-testi: fake avain ei kaiu, syöte kulutettu, echo palautuu, pending-file 0600; tulokset acceptance-key-import-check.json ja acceptance-key-import-pty-check.json. Syntaksit tarkistettu. Ei uusittu aiempia sovellus- tai backup-ajotestejä.
- **Julkaistu:** ei mitään, ei tuotantorestartia tai -asetusmuutoksia. Sovelluskoodiin ei muutoksia.
- **Seuraavat käyttäjätoimet:** Vercel rjmob-portal → Settings → Environment Variables → GOOGLE_SERVICE_ACCOUNT_KEY. Jos arvo on luettavissa, kopioi vain se yksityisesti; VPS-rootissa python3 -B /home/arxcian-codex/arxcian-release/ops/acceptance/import-drive-key.py , liitä JSON piilotettuna ja kirjoita omalle riville LOPPU. Jos Sensitive/arvoa ei saa luettua, ilmoita se ja käytä myöhemmin alkuperäisen JSON:n turvallista siirtoa; älä muuta production-envia. Lisäksi rootissa bash /home/arxcian-codex/arxcian-release/ops/acceptance/check-api-auth.sh oikeaa read-auth-testiä varten.
- **Seuraava agenttityö:** lue auth-statusraportti, tarkista candidate-Drive-avain vain readonly-scopellisessa erillisessä lukijassa ilman app-aktivointia. Varmista testikytkentöjen kirjoitusrajat ennen oikeaa Oracle/Drive-vertailua. Eristetty oikea Oracle runtime, Telegram-testirouting, HTTPS-testipääsy ja täysi palvelupalautus edelleen avoimia. Kaikki aiemmat muiden töiden rajaukset ja evidenssi alla säilyvät.

---

# Testipääsyjen sijaintien selvitys — 15.9.2026

Käyttäjä ei tiedä, onko eristetty Oracle/Drive/HTTPS-testipalvelu olemassa. Sijaintien selvitys tehdään käyttäjän puolesta; uusia palveluja tai tuotantotunnusten käyttöä ei oleteta tämän vastauksen perusteella.

- **Toteutettu:** ops/acceptance/find-test-access.sh + .py valmisteltu. Rajatut tunnetut /opt/data/workspace/arxcian-, private/arxcian/oracle-{production,preview,staging}-, profiles/oracle-asetussijainnit ja supervisorin staattiset lähdepolut. Raporttiin vain tarvittavien avainnimien olemassaolo, tiedostopolut ja credential-free origin/p/oracle-URL:t; ei avainarvoja, keskusteluja tai kantasisältöä. Hostin Codex-työkopiosta ei löytynyt Vercel-preview-linkitystä eikä luettavaa nginx/caddy-testiproxyä. Tämä ei todista etteikö kontissa olisi testipalvelua.
- **Testattu:** uuden lukuskriptin fixture-tarkistus läpäisi: salaiset arvot ja tunnuksia sisältävä URL jäävät pois, tunnuksen olemassaolo ja turvallinen origin löytyvät. Vain uusi tmp-fixture; acceptance-access-finder-check.json. AST/shell-syntaksi tarkistettu. Aiemmat sovellus/auth-/backup-testit eivät uusittu.
- **Julkaistu:** ei mitään; ei tuotantoasetusten/palvelujen muutosta.
- **Avoinna/seuraava:** käyttäjältä rajattu root-ajo bash /home/arxcian-codex/arxcian-release/ops/acceptance/find-test-access.sh . Raportti acceptance-test-access.json työtilaan. Root tarvitaan edelleen Docker-lukurajan vuoksi. Lue sijainnit ja selvitä turvallinen testikytkentä näiden perusteella; älä pyydä käyttäjää arvaamaan avainten sijainteja. HTTPS-pääsyn ja eristetyn Oracle-ajon perustaminen konkretisoidaan löydösten perusteella. Jos uutta maksullista palvelua tai olennainen käyttäjäpäätös tarvitaan, kysy se vasta konkreettisesta ehdotuksesta. Muut hyväksymistulokset/rajaukset alla säilyvät.

---

# Korjattu profiiliraportti luettu — 15.9.2026 klo 08:15 UTC

- **Toteutettu:** julkaisutyö /home/arxcian-codex/arxcian-release, haara release/acceptance-20260915, lähtöversio c889748. Kaikki tähän asti pyydetyt root-raporttikomennot ajettu käyttäjän toimesta ja tulokset luettu tiedostoista. Yhteinen tulostaulukko docs/acceptance-results.md. Sovelluskoodiin ei uutta muutosta.
- **Testattu/varmennettu nyt:** acceptance-profile-gates.json checked_at 2026-09-15T08:15:10.835759+00:00. Default yksi TELEGRAM_ALLOWED_USERS ilman wildcardia; kummankin profiilin API-avain täyttää vähintään 16 merkin pituusrajan. Default-configin api_server löydetty; enabled/bind_loopback null. Oracle-configin platforms tyhjä. Nämä ovat vain luettuja asetuksia; profile_authorization_verified=false säilyy perusteltuna. Älä päättele tyhjistä kentistä adapterien puuttumista, portin sulkeutumista tai käyttäjärajan toimivuutta.
- **Aiemmin tässä hyväksymistyössä läpäissyt:** erilliset HTTP-login/checklist-rajat omassa previewssä; testijonon AOF-persistenssi oikean restartin yli; otetun tuotantobackupin hashit/SQLite-palautus yksityiseen sandboxiin (8 taulua, eheys ok, lähde muuttumaton). Nämä ja aiemmat sovellustestit eivät ole tämän dokumentointivuoron uusia ajoja. Ei tarvetta uusia suoritettuja root-asetus-/backup-tarkistuksia ilman uutta kohdistettua muutostarvetta.
- **Julkaistu:** ei tuotantoon mitään, ei pushia, tuotantoasetusten muutosta tai restartia. Loopback-preview localhost:3300/login on alustava. Tuotannon palautuspiste 20260915T075851Z-4754f8ce on otettu ja SQLite-palautusdrill läpäissyt; täydellinen palvelupalautus on avoin.
- **Avoinna:** oikea käyttäjätestipalvelu/HTTPS-pääsy; eristetty Oracle/Telegram-ajo ja Drive-lukupääsy; tehokkaat sallitut/kielletyt profiili-/dashboard-käyttäjäpyynnöt; oikean Oracle-vastauksen Drive-vertailu samalla kuukaudella/näkymällä; supervisor/profiiliasetusten täysi palautusvalmius. Varsinaista käyttäjän selaintestiä ei ole tehty, eikä oikeita vastauksia simuloitu.
- **Käyttäjältä tarvittava seuraava tieto:** ovatko eristetty Oracle-testipalvelu, Drive-lukupääsy ja HTTPS-testiosoite olemassa vai perustetaanko ne nykyiselle VPS:lle. Pyydetty sijainnit/osoitteet ilman avaimia. Tämä ratkaisee seuraavien konkreettisten kytkentöjen ja oikeiden auth/data-testien edellytykset. Ei uutta root-lukuraporttipyyntöä tässä vaiheessa.
- **Seuraava tehtävä:** saatujen testipääsytietojen perusteella viimeistele eristetty käyttäjätestipalvelu, tee tehokkaat käyttöoikeuspyynnöt ja oikea Oracle–Drive-vertailu, varmista täysi sandbox-palvelupalautus. Anna toimiva käyttäjätestiosoite ja hyväksymistulokset erillistä julkaisupäätöstä varten. Koko sivuston Oracle-työkalut/verkkohaku säilyvät seuraavana kokonaisuutena. Oracle-/Mac-koontirajaukset ja muiden töiden historia alla säilytetty.

---

# Captured-backup-palautus luettu — 15.9.2026 klo 08:03 UTC

## Testattu ja varmennettu

Käyttäjä ajoi finish-evidence.sh:n. Luettu todellinen raportti /home/arxcian-codex/arxcian-work/acceptance-final-evidence.json, checked_at 2026-09-15T08:03:18.995882+00:00. Palautuspisteen 20260915T075851Z-4754f8ce neljän kopioidun tiedoston tarkisteet täsmäsivät; SQLite palautettiin uuteen yksityiseen tilapäishakemistoon, 8 taulua ja integrity_check läpäisivät. Capture ei muuttunut, sandbox poistettu, palveluja ei käynnistetty. **Otetun backupin tarkiste-/SQLite-sandbox-palautusharjoitus läpäisi.** Täydellinen gateway/supervisor/palveluasetusten palautusvalmius on edelleen avoin; raportin full_service_restore_verified=false on oikea rajaus.

Uusi riippumaton testipalvelun parannus: ops/acceptance/local-preview.py käyttää nyt oman Redisin AOF-persistenssiä. Vain loopback-preview ja sen oma Redis käynnistettiin uudelleen. Oma testiavain säilyi molempien prosessien uudelleenkäynnistyksen yli ja poistettiin tarkistuksen jälkeen. /home/arxcian-codex/arxcian-work/acceptance-preview-durability.json passed=true, production_touched=false. Ei aiempien sovellustestien tai backup-palautuksen uusintaa.

## Oikeusraportin rajoitus — ei hyväksytty vielä

Default: yksi TELEGRAM_ALLOWED_USERS ilman wildcardia; oracle: env-gate-lista tyhjä; molemmilla API-avain olemassa; pairing-lukumäärät tyhjiä. Näitä ei tulkita tehokkaaksi käyttäjärajaksi. Havaittiin oman raporttiskriptin puute: se luki vain top-level platforms:n, vaikka varmennettu config.py tukee gateway.platforms-, gateway.telegram/api_server- ja top-level telegram/api_server -lohkoja sekä legacy gateway.json:ia ja allow_from-kenttiä. Tyhjät platforms-listat eivät siis todista adapterien puuttumista.

Raporttiskripti korjattu; uusi **vain lukuasetuksille** tarkoitettu ops/acceptance/inspect-profile-gates.sh käyttää audit-only-tilaa eikä toista läpäissyttä backup-palautusharjoitusta. AST/shell-syntaksi ja diff-check läpäisivät; itse uusi konttiajo puuttuu. Käyttäjälle kerrotaan avoimesti, että lisäajo tarvitaan oman raportin rajauksen vuoksi. Todellisten sallittujen/kiellettyjen auth/dashboard-lukupyyntöjen varmistus ja lähde-/runtime-asetusten sovitus ovat edelleen avoimia.

## Toteutettu / julkaistu / avoinna

Sovelluskoodiin ei muutoksia. Testipalvelussa oma persistentti Redis, samat uudet testitunnukset, localhost:3300/login vain VPS-loopbackissa. Ei oikeaa Drive/Oracle/Telegram-kytkentää eikä valmista käyttäjän HTTPS-testiosoitetta. Ei tuotantojulkaisua, pushia tai tuotantorestartia. Alkuperäiset työkopiot ja Oracle/Mac-koontirajaukset säilytetty alla.

## Seuraava askel

VPS-rootissa vain uusi korjattu lukuajo: bash /home/arxcian-codex/arxcian-release/ops/acceptance/inspect-profile-gates.sh . Se tuottaa acceptance-profile-gates.json:n; **älä uusi** finish-evidence.sh:n palautusosaa. Lisäksi käyttäjältä odotetaan Drive-testilukutunnuksen, eristetyn Oracle-ajoympäristön ja HTTPS-testipääsyn sijainti-/osoitetietoja ilman salaisia arvoja. Niiden jälkeen viimeistellään testikytkennät, oikea Oracle–Drive-vertailu ja tehokkaat käyttäjärajatestit. Julkaisupäätös vasta hyväksymistuloksista; laaja Oracle/web search edelleen seuraava kokonaisuus.

---

# Käyttäjän ajamat konttikomennot — 15.9.2026 klo 07:58 UTC

## Varmennettu uusi evidenssi

- Käyttäjä ajoi export-runtime.sh:n ja capture-restore-point.sh:n root-webconsolessa. Raportit acceptance-runtime.json ja acceptance-restore-point.json luettiin tässä työssä suoraan paikallisista tiedostoista; onnistumista ei päätelty pelkästä keskusteluviestistä.
- Puuttuva hermes_cli/profiles.py saatiin; SHA256 edeafa558cea28cc42ce4e80a21489a3176454a48bae9f767d8c179b954e0981. Yksityinen lukukopio /home/arxcian-codex/arxcian-work/acceptance-profiles.py. profiles_to_serve lähteessä: multiplex palvelee defaultia aina sekä allowlistin sallimia named-profiileja. Tämä ei ole käyttäjäoikeuden todiste.
- gateway/run.py, gateway/authz_mixin.py ja gateway/status.py:n runtime-tarkisteet vastaavat tarkistettua lähdepakettia. Runtime-status listaa default/oracle, PID 86752 olemassa, mutta updated_at on 14.9.2026 06:08:48 UTC. PID-olemassaolo ja vanha persisted-status eivät yksin todista tuoretta tehokasta adapteri/auth-rajaa.
- Otettu yksityinen palautuspiste /opt/data/private/arxcian/restore-points/20260915T075851Z-4754f8ce kontissa hermes-agent-vmvu-hermes-agent-1. Capture-aika 15.9.2026 07:58:51 UTC, SQLite SHA256 9203c4ad77fe41d8a1754beac2787948e77a1ce78784aa74349e3697726b9bf1, integrity_check ok. Mukana alkuperäinen run.py, root .env/config.yaml ja supervisor.py (SHA256 54185f029942771792d3e4aec8fc3fb3fab048ba38caf8f66f988c3ad9d6b860). Uusia checklist-gatewaymoduuleja ei ollut live-asennuksessa; manifestiin merkitty absent. Salaisuudet/databackup pysyvät yksityisessä konttihakemistossa.

## Toteutettu / testattu / julkaistu

Valmisteltu ops/acceptance/finish-evidence.sh + .py: seuraava rajattu root-komento tarkistaa nyt olemassa olevan capture-ID:n tiedostohashit, palauttaa SQLite-kopion uuteen yksityiseen tilapäishakemistoon ja tarkistaa sen eheyden muuttamatta backupia tai liveä. Samassa raportissa vain default/oracle-profiilien allowlist/wildcard/allow-all/pairing-lukumäärät ja rajatut config-kentät; ei tunnisteita, avaimia tai keskustelutietoja. Ei PairingStore-importtia (se voi migroida/kirjoittaa), ei palvelukäynnistyksiä. Python-AST ja shell-syntaksi sekä diff-check läpäisivät; itse konttiajo on vielä käyttäjältä odotettava. Aiemmat sovellustestit ja fixture-palautusajo säilyvät aiempina ajoina. Ei sovelluskoodimuutosta, pushia, julkaisua tai tuotantorestartia. Käyttäjän capture loi vain uuden varmuuskopion.

## Jäljellä

- Tehokas ajonaikainen profiili-/dashboard-oikeusraja on yhä avoin. Default/oracle-kohtainen gate-yhteenveto ja todelliset sallitut/kielletyt lukupyynnöt tarvitaan; uusi raportti ei lupaa auth-varmennusta pelkistä lukumääristä.
- Tuotannon palautuspiste ON nyt otettu ja metadata/eheys luettu. Täysi palautusvalmius EI vielä ole varmennettu: runtime_settings_complete=false ja production_restore_tested=false ovat capture-manifestissa tarkoituksella. Otetun backupin sandbox-palautus ja supervisor/profiiliasetusten täydellisyys puuttuvat.
- Drive viewer-ACL-tunnus, eristetty Oracle/Telegram-testiajo ja käyttäjälle HTTPS-osoite edelleen puuttuvat. Loopback-preview jatkaa alustavana; status.json sanoo user_acceptance_ready=false. Oikeaa Oracle–Drive-vertailua ei ole ajettu eikä simuloitu.

## Seuraava konkreettinen askel

Käyttäjältä tarvitaan VPS-rootissa: bash /home/arxcian-codex/arxcian-release/ops/acceptance/finish-evidence.sh . Ajo tuottaa /home/arxcian-codex/arxcian-work/acceptance-final-evidence.json. Tämä kohdistuu juuri saatuun palautuspisteeseen ja todettuihin default/oracle-profiileihin eikä toista vanhaa preflightia. Lue tulos, päätä puuttuvan oikeus-/palautusevidenssin jatko ja kytke käyttäjän järjestämät testipääsyt vasta varmennetun eristyksen jälkeen. Yhteinen koontivastuu säilyy tässä HANDOFF-tiedostossa; Oracle- ja Mac-tiedostojen aiemmat tiedot alla säilytetty. Koko sivuston toiminnot/verkkohaku edelleen seuraava kokonaisuus.

---

# Hyväksymisesteiden jatko — 15.9.2026

Yhteinen koonti tehdään tässä julkaisutyökopiossa. Oracle-tehtävä lopetti käyttäjän pyynnöstä koonnin eikä tehnyt tässä vaiheessa tiedostomuutoksia tai committia. /home/arxcian-codex/arxcian-oracle/docs/HANDOFF.md ja sen 71b5d9f-version tiedot huomioitu ja säilytetty alla; Oracle-työpuu tarkistettiin puhtaaksi. Macin docs/HANDOFF.md on tarkistamatta, eikä sen synkronointia väitetä tehdyksi. Muiden työkopioiden tiedostoja ei muutettu.

## Toteutettu

- Jatkettiin /home/arxcian-codex/arxcian-release-haarassa release/acceptance-20260915 versiosta b4a73a6. Sovelluskoodiin ei tehty muutoksia; käytetään aiempaa testattua buildia.
- Uusi loopback-testipalvelu käynnistetty osoitteeseen http://localhost:3300/login VPS:llä. Oma Redis-prosessi, portti 0 ja yksityinen Unix-socket; uudet vain testiin luodut kirjautumis-/sessio-/bridge-tunnukset. Ei tuotantoasetusten tuontia. Käynnistin ops/acceptance/local-preview.py, yksityinen tilahakemisto /home/arxcian-codex/arxcian-work/acceptance-preview, logi acceptance-preview.log. Testitunnukset browser-credentials.json:ssa (0600), ei Gitissä tai keskustelussa.
- Rajattu root-lukukomento ops/acceptance/export-runtime.sh ja capture-only-varmuuskopiokomento ops/acceptance/capture-restore-point.sh valmisteltu ja käyttäjältä pyydetty ajettaviksi. Molempien tarkat polut ja perustelut ops/acceptance/README.md:ssä. Ei broad Docker/root-oikeuksien muutosta.
- Turvallinen palautusharjoitus ops/acceptance/rehearse-restore.py ja tuotantocapture-työkalun fixture-tarkistus tehty uusissa tilapäishakemistoissa.

## Testattu tässä jatkossa

- Uusi paikallinen Next-palvelu: kirjautumaton checklist API 401; testialbin login 200 / read 200; testiarbnor login 200 / read 404. @vercel/kv:n todellinen HTTP→oma Redis -kirjoitus/luku läpäisi. Tulos /home/arxcian-codex/arxcian-work/acceptance-preview-smoke.json. Eväste välitettiin HTTP-testissä käsin; varsinaista selainta ei testattu tässä vaiheessa.
- SQLite online backup→palautuskopio, molempien integrity_check, vanhan revision palautuminen ja uudemman live-fixturen säilyminen läpäisivät. Capture-työkalun yksityiset 0700/0600-oikeudet, lähteen muuttumattomuus, olemassa olevan kohteen ylikirjoituskiellot ja salaisuuksien puuttuminen metatietotulosteesta läpäisivät. Tulokset acceptance-restore-drill.json ja acceptance-capture-check.json arxcian-workissa.
- Uusien Python-skriptien AST- ja shell-skriptien syntaksitarkistus sekä git diff --check läpäisivät. Sovelluksen aiempia 400 Node/bridge + 14 Python / DOM / build / typecheck -ajoja EI uusittu eikä laskettu tämän vuoron uusiksi testeiksi. Ei tuotantotietojen kirjoitustestejä, mallikutsuja tai Telegram-viestejä.

## Julkaistu / käytössä

Ei tuotantojulkaisua, pushia, aktivointia, julkista porttia/DNS-muutosta tai tuotantorestartia. Ainoa uusi käynnistetty palvelu on loopback-preview ja sen oma Redis. Tuotannon aiempi varmennettu 7346755 / deployment 6433181173 säilyy edellisen tarkistuksen tuloksena; sitä ei tarkistettu uudelleen tässä jatkossa.

## Avoinna — ei väitetä ratkaistuiksi

1. Lopullinen käyttäjälle osoitettavissa oleva HTTPS-testiversio puuttuu. Loopback-preview on alustava ympäristö: Drive-tunnus puuttuu, oikea Oracle/Telegram ei ole kytketty, Redis on vielä ilman persistenssiä. Ei seeded/simuloitua onnistunutta tehtävää. http://localhost:3300 on VPS-paikallinen, muualta tarvitaan SSH-forward nykyiseen VPS:ään; tarkka SSH-host ja HTTPS-proxy pitää vielä sopia/järjestää.
2. Käyttäjältä odotetaan root-lukuraporttia acceptance-runtime.json. Suora sudo vaatii salasanan, Docker-pääsy puuttuu edelleen. Raportti ei yksin todista tehokasta profiilien/dashboardin oikeusrajaa; puuttuva profiles.py ja todelliset sallitut/kielletyt pyynnöt tarvitaan jatkoarviointiin.
3. Dedicated Drive viewer-ACL-tunnus ja eristetty Hermes Oracle -profiili/API-key/työkalusandbox sekä varmennettu testirouting Telegramista erilliseen SQLiteen puuttuvat. Avaimia ei pyydetä keskusteluun. Tuotannon kirjoitusoikeuksista tiliä, supervisor-prosessia tai bottipolleria ei saa ottaa previewn käyttöön.
4. Oikean Oraclen vastauksia ei verrattu Driveen: estetty kunnes yllä oleva pääsy ja eristys on todennettu. Vertailun fileId/kuukausi/näkymä/snapshot/viesti ja jokaisen luvun hyväksyntä kirjataan samalla aikavälillä ops/acceptance/README.md:n ja docs/oracle-rjmob-validation.md:n mukaan.
5. Tuotannon palautuspiste ei ole vielä otettu/varmennettu tässä työssä. Käyttäjältä odotetaan capture-komennon acceptance-restore-point.json. Capture tallentaa vain yksityisen kontin backupin/metatiedot ja merkitsee runtime_settings_complete=false: lähteet pitää sovittaa todelliseen supervisor/profiilien asetuksiin ja palveluyksiköihin. Palautusta harjoiteltiin vain fixturessa; oikean backupin sandbox-palautus puuttuu. Lähde-Git-bundle ei korvaa tätä.

## Seuraava tehtävä

Lue saapuvat kaksi metatietoraporttia; tarkista puuttuva lähde/ajonaikaiset oikeusrajat. Kytke rajatut Drive/Oracle-testitunnukset vasta eristyksen vahvistuttua, viimeistele persistentti testijono/SQLite ja HTTPS-pääsy sekä autentikoitu Telegram-testirouting. Tee oikea Oracle–Drive-vertailu ja otetun backupin palautus uuteen sandboxiin. Anna tämän jälkeen valmis testiosoite ja hyväksymistulokset julkaistavan sisällön päätöstä varten. Tuotantojulkaisu päätetään erikseen. Koko sivuston Oracle-toiminnot ja verkkohaku säilyvät seuraavana kokonaisuutena.

---

# Kokonaisuuden hyväksyntä — uusin tarkistus 15.9.2026

Tämä päivitys täydentää alla säilytettyä Oracle/Hermes/RJ-Mob-muistiota. Vanhoja testiraportteja ei laskettu uusiksi ajoiksi.

- **Toteutettu:** julkaisukokonaisuus koottu erilliseen työkopioon /home/arxcian-codex/arxcian-release, haara release/acceptance-20260915, lähtöversio 71b5d9f / sovellustoteutus 8d9c719. Nykyiset toimivat korjaukset säilyvät. Hyväksymislista ja palautussuunnitelma docs/release-acceptance.md. Alkuperäiset työkopiot ja muiden arxcian/CLAUDE.md-muutos säilytetty.
- **Testattu tässä työssä:** 400 Node/bridge + 14 Python, kaksi todellisen komponentin DOM-ajoa. Redis/SQLite-ketju eristetty, ei tuotantotunnuksia tai -kirjoituksia. Vanha FLUSHDB-testi ohitettu. Ensimmäinen Redis-ajo epäonnistui testibinaarin kirjastopolkuun, uusinta onnistui korjatulla ajoasetuksella. Next build ja erillinen typecheck läpäisivät.
- **Julkaistu:** ei tätä kokonaisuutta, ei pushia tai aktivointia. Uusi suora tarkistus: origin/main 7346755ebb4b61aea6f12429e2b8201d39a34b6d, GitHub Production 6433181173 success. Tuotannon RJ-Mob kirjautumattomana 307 /login; bridge systemd active. Kirjautunut käyttö ja oikeat lähdeluvut eivät tästä varmistu.
- **Avoinna:** eristetty käyttäjän päästä päähän -testipalvelu; oikeat Drive/Oracle-vastaukset; Hermes served_profiles/auth/dashboard-rajat, nykyinen supervisor ja palautuspiste. OS Docker-lukupääsy estyy edelleen. Varmennettu lähdepaketti /home/arxcian-codex/arxcian-work/release-source-71b5d9f.bundle (SHA256 ee807261516664c934208d7a36ccecabcd394ae185ee902d58ab8f8dfb81207d) säilyttää lähtöversion ja mainin. Paikallinen lähdepalautuspaketti ei korvaa tuotannon data/gateway-varmuuskopiota. Julkaisulupa puuttuu.
- **Käyttäjäpäätös:** top kolme oli lukukyvyn esimerkki. Tavoite on Oraclen kattava Arxcian-käyttö ja verkkohaku; kiinteää ranking-mittaria ei ole pyydetty valittavaksi. Alla oleva ranking-mittarin päätöspyyntö ei enää ole tämän erän erillinen hyväksymiseste. Kattavat sivutyökalut ja verkkohaku ovat seuraava kokonaisuus, nykyiset kyvyt rajattu hyväksymisohjeessa.
- **Seuraava tehtävä:** hanki hyväksymisohjeen rajattu ajonaikainen lukuevidenssi, viimeistele eristetty testipalvelu ja palautusharjoitus, vertaa oikeat vastaukset/lähteet, esittele konkreettinen versio julkaisu- ja aktivointipäätökseen. Älä julkaise pelkän aiemman paikallisen testiraportin perusteella.

---

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
