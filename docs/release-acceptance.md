# Hyväksymisvalmistelun päivitys 15.9.2026

Uusi eristetty loopback-preview ja rajatut runtime-/backup-komennot on valmisteltu; uudet ympäristö- ja palautus-fixturetarkistukset läpäisivät. Käyttäjälle valmis päästä päähän -testipalvelu, oikeat Drive/Oracle/Telegram-yhteydet, tehokkaat Hermes-oikeudet ja tuotannon palautuspiste ovat edelleen avoinna. Tarkat käyttöohjeet ja pääsypyynnöt: [ops/acceptance/README.md](../ops/acceptance/README.md). Yhteinen ajantasainen tila: [HANDOFF.md](HANDOFF.md). Alla säilyy aiemman julkaisukokonaisuuden sisältö ja hyväksymislista.

---

# Kokonaisuuden hyväksyntä 15.9.2026

## Julkaisukokonaisuus

Työkopio /home/arxcian-codex/arxcian-release, haara release/acceptance-20260915. Sovellustoteutus 8d9c719, lähtö-HEAD 71b5d9f. Mukana mainin 7346755:n työpäivä- ja Drive-aikataulukorjaukset, Albinin pysyvä käyttötestilista, preflight v2 ja Oracle–RJ-Mob-näkymäkonteksti. 41 tiedostoa eroaa mainista lähtöversiossa. Alkuperäiset työkopiot säilytetty; arxcian/CLAUDE.md:n muiden työn muutos jätetty koskematta.

## Nyt testattu

400 Node/bridge-testiä (378 + 22), 14 Python-testiä, RJ-Mob- ja checklist-DOM, Next build ja typecheck läpäisivät. Oikea checklist-Redis käyttää porttia 0, yksityistä Unix-socketia ja uutta tempfile-hakemistoa; SQLite-kannat ovat tilapäisiä. Vanha ORACLE_REDIS FLUSHDB -testi ohitettu. Prosessit env -i ilman tuotantotunnuksia, työkopiossa ei .env-tiedostoja. DOM:n API:t korvattu. Ensimmäinen Redis-ajo epäonnistui kirjastopolun vuoksi; korjattu testiajon ympäristö, uusinta onnistui. Lokit /home/arxcian-codex/arxcian-work/release-*.log.

## Käyttäjän hyväksymislista

- [ ] Syyskuun 2026 ja seuraavan saatavilla olevan kuukauden tavoite, toteuma, ennuste ja prosentti täsmäävät Drive-lähteeseen sekä kaikkiin kolmeen Myyntiseurannan näkymään. Null ja nolla erottuvat.
- [ ] Oracle vastaa samoista lähdeluvuista, mainitsee käytetyn kuukauden ja mittarin; epäselvä top kolme -pyyntö tarkentuu ilman arvattua järjestystä. Ohje docs/oracle-rjmob-validation.md.
- [ ] Albin aloittaa käyttötestilistan Telegramissa, jatkaa Arxcianissa, avaa selaimen uudelleen ja näkee saman tehtävän. Uusinta ei tee kaksoistyötä; yhteyskatkos ja palautuminen näkyvät.
- [ ] Arbnor ja kirjautumaton eivät lue tai muuta Albinin tehtävää/Oracle-viestejä. Suora Hermes/Kanban/dashboard-pääsy ei ohita käyttäjärajaa.
- [ ] Testiversion Redis, SQLite, jonot, salaisuudet ja bridge on erotettu tuotannosta. Drive on vain lukulähde; oikean Oracle-ajon työkaluilla ei ole kirjoituspääsyä tuotantodataan testissä.
- [ ] Palautus harjoiteltu testiympäristössä ja tuotannon palautuspisteen tunniste kirjattu ennen julkaisua.

## Testiversion raja

Paikallinen yhdistetty lähdeversio ja build eivät ole käyttäjän valmis päästä päähän -testipalvelu. Julkista esikatselua ei ole asennettu. Olemassa olevat DOM-ajot ovat toimivia synteettisiä testejä, eivät oikea Oracle-malliajo tai Telegram-yhteys. Käyttäjätestiin tarvitaan eristetty preview-Redis, SQLite, Hermes-profiili/bridge ja varmennettu käyttäjäraja. Älä kytke tavallista Vercel-previewta tuotannon Redis- tai bridge-asetuksiin.

## Ajonaikainen tarkistus, joka vielä tarvitaan ylläpitäjältä

Codex-käyttäjä uid 1000 ei kuulu Docker-ryhmään; socket root:docker 0660, datahakemisto 0700. Kyse on OS-oikeudesta, ei auto-review-hylkäyksestä. Aiemman preflight v2:n ajaminen sellaisenaan uudelleen ei ratkaise puuttuvia rajoja.

Tarvitaan rajattu salaisuuksia sisältämätön lukukopio hermes_cli/profiles.py:stä ja nykyisestä supervisor/bridge-lähteestä sekä yhteenveto: todella served_profiles, niiden adapterien tehokas auth/pairing-raja, Kanban-dashboardin verkko- ja käyttäjäpääsy, nykyinen gateway SHA/versio, keskeneräisen feature/albin-kanban-continuity-työn aktivointitila, palvelun valvonta ja olemassa oleva palautuspiste. Ei keskusteluja, käyttäjätunnisteita, avaimia tai koko tuotantokantaa.

## Palautus

Main 7346755 varmennettiin git ls-remote -luvulla; GitHub Production deployment 6433181173 success. Tämä on sovelluksen aiempi lähdeversio, ei tietokannan tai gatewayn varmennettu varmuuskopio. Varmennettu /home/arxcian-codex/arxcian-work/release-source-71b5d9f.bundle, SHA256 ee807261516664c934208d7a36ccecabcd394ae185ee902d58ab8f8dfb81207d, säilyttää mainin ja julkaisutyön lähteet. Se ei ole tuotannon datapalautuspiste.

Ennen aktivointia ylläpitäjä ottaa SQLite online backup -kopion, gatewayn kolmen korvattavan lähdetiedoston kopiot, supervisor/bridge-version ja yksityisen asetusten palautuskopion; kirjaa sijainnin, ajan ja tarkisteet salaisuuksia näyttämättä. Harjoittele eristetyssä ympäristössä. Palautuksessa sulje ominaisuuslippu, pysäytä vain uusi checklist-bridge, palauta varmennettu gateway ja tarvittaessa aiempi sovellusversio hyväksytyllä julkaisulla. Älä poista tehtäviä/kuitteja tai nollaa revisiota vanhemman SQLite-kannan pakottamiseksi.

## Käyttäjän tarkennus ja seuraava kokonaisuus

Top kolme oli esimerkki Oraclen sisällönlukukyvyn puutteesta; käyttäjä haluaa Arxcianin kattavan käytön pyynnöillä sekä tiedonhaun netistä. Uutta kiinteää ranking-mittaria ei valittu. Nykyinen UI-protokolla tukee navigointia sekä vahvistettavia muistiinpano-, tavoite-, tapa- ja hintahälytysehdotuksia. RJ-Mob-konteksti kattaa vain etela-sivun. Yleinen kaikkien sivujen luku/toiminta ja Oraclen ajonaikainen verkkohaku ovat todentamatta ja osin toteuttamatta. Seuraava kokonaisuus: Oracle-työkalujen kattavuuskartta, käyttäjäkohtaiset lukurajapinnat, lähteistetty verkkohaku ja nykyisiin toimintorajapintoihin sidotut kirjoitukset; epäselvät mittarit tarkennetaan pyynnössä. Älä lupaa tätä kykyä tämän paikallisen julkaisuerän perusteella.

## Julkaisu

Ei tuotantojulkaisua, pushia, asetusten muutosta tai restartia. Tämän kokonaisuuden julkaisulupaa ei ole löytynyt. Ensin yllä olevat hyväksymisportit ja toimiva eristetty testipalvelu, sitten käyttäjälle konkreettisen version ja aktivointien julkaisupäätös.
