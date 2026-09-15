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
