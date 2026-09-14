# Albinin ensimmäinen pysyvä tehtävä

Tämä on rajattu kolmen kohdan käyttötestilista, ei yleinen tehtävämoottori tai
AI-yhteismuisti. Käyttäjä kokoaa listan Telegramissa ja Arxcianissa. Hermesin
gateway käsittelee tehtäväkomennon suoraan; se ei käynnistä mallia tai työntekijää.

## Toteutettu kulku

1. Albin avaa Personal → Käyttötestilista ja luo kertakäyttöisen kytkentäkoodin.
2. Koodin valmistuttua hän lähettää sen olemassa olevan Hermes-botin **yksityiseen**
   keskusteluun. Tämä on tilin kytkentä, ei vielä tehtävän aloitus.
3. `/arxcian_tehtava` luo yhden Kanban-kortin tai näyttää saman olemassa olevan.
4. `/arxcian_tehtava lisaa <kohta>` tai Arxcianin Lisää kohta jatkaa samaa listaa.
5. Kolmannen kohdan jälkeen tila on Valmis. Telegramin `/arxcian_tehtava` näyttää
   myös Arxcianissa lisätyt kohdat ja tuloksen. Erillisiä push-ilmoituksia ei lisätä.

Esimerkkisisältö käyttäjätestiin: ”Tehtävä löytyy Telegramista ja Arxcianista”,
”Sama tehtävä säilyy selaimen sulkemisen jälkeen”, ”Uusittu lähetys ei luo kaksoistyötä”.
Nämä ovat listaan lisättäviä esimerkkikohtia, eivät väite käyttäjätestin hyväksymisestä.

## Tallennus ja rajaukset

- `checklist.py` käyttää olemassa olevan arxcian-Kanbanin `tasks`- ja
  `task_events`-tauluja. Samassa kannassa ovat vain lisäksi kanavakytkentä ja
  idempotenssikuitit, eivät erillinen tehtävätietokanta.
- Kiinteä tehtävän PK ja `BEGIN IMMEDIATE` tekevät luonnista atomisen. Hermeksen
  nykyisen `create_task`-funktion idempotenssihaku on transaktion ulkopuolella ja
  lähdekoodin mukaan sallii kaksi samanaikaista lisäystä. Siksi rajattu kirjoitus
  käyttää samaa skeemaa mutta omaa atomista transaktiota.
- Odotustila on `triage`, valmis `done`. Assignee, worker_pid ja claim jäävät tyhjiksi.
  Gatewayn automaattisia työntekijöitä, dispatch-asetuksia tai muita tauluja ei muuteta.
- SQLite on tehtävän varsinainen tietolähde. Redis on pysyvä toimitusjono ja
  lukukopio ilman seitsemän päivän TTL:ää. Lähetys näytetään odottavana, kunnes
  SQLite-kirjoitus on kuitattu. Kadonnut kuitti uusitaan samalla tunnisteella.
- Arxcianin muutos vaatii tuoreen revision. Vanha välilehti tai toinen kanava ei
  voi hiljaa ylikirjoittaa myöhempää muutosta. Sama kohta torjutaan myös uudella ID:llä.
- Yhteyskatko näytetään näkymässä. SQLite-version taantuminen pysäyttää
  synkronoinnin; varmuuskopion palautusta ei kuitata automaattisesti ajantasaiseksi.
- Vain kirjautunut `albin` pääsee selainreitteihin. Muu käyttäjä saa 404,
  kirjautumaton 401. POST vaatii saman originin. Bridge vaatii olemassa olevan
  ORACLE_BRIDGE_SECRETin ja tarkan middleware-poikkeuspolun.
- Telegram-kytkentä ei käytä nimeä. Albinin sivulla luotu 256-bittinen kertakoodi
  sitoo adapterin varmentaman numeerisen käyttäjän ja saman yksityisen chatin.
  Koodi vanhenee 10 minuutissa. Jo tehtyä kytkentää ei voi vaihtaa tässä kokeilussa.
- Keskustelutietokantoja, sessioita, muistia ja muiden tehtävien sisältöjä ei lueta.
  Lukukopiossa ei ole Telegram-tunnistetta, kytkentäsalaisuutta tai tapahtumahistoriaa.
  Lähetysluonnos poistetaan uloskirjautuessa.

## Lähdepohja ja keskeneräinen rinnakkaistyö

Lähdepaketin SHA256:
`d3ddc437069d0e6b4e54fa34abdd0cd24bd7169b190eb28bc3b3616e3dd31328`.

Hermes-paketin ilmoittama versio on 0.21.0; Git-commit ei ole tiedossa.
131 tiedoston manifesti varmennettu. Arxcian-pohja on `0bf2b39`.
`test-schema.sql` on paketin `hermes_cli/kanban_db.py`:n SCHEMA_SQL sellaisenaan;
lisenssi on tiedostossa HERMES-LICENSE (MIT, Nous Research).

Paketin VERSIONS.json ilmoitti kontin haarassa `feature/albin-kanban-continuity`
keskeneräiset, paketin ulkopuolelle jätetyt polut `scripts/hermes-kanban/`,
`src/app/api/arxcian/personal/hermes-checklist/` ja `src/lib/arxcian/hermesKanban/`.
Niitä ei ole luettu, muutettu tai korvattu. Tämä paikallinen toteutus on eri haarassa
ja eri poluissa. Ennen käyttöönottoa varmista, ettei vanhaa kokeilua oteta yhtä aikaa
käyttöön. Älä poista keskeneräisiä tiedostoja automaattisesti.

## Julkaisua varten valmisteltu, EI suoritettu

Tarvitaan erillinen julkaisulupa sekä Arxcianille että Hermes-liitokselle.
Pelkkä Next-julkaisu ei aktivoi tätä ketjua. Lähdekoodipaketin siirtolupa ei ole
julkaisulupa. Oletuksena ARXCIAN_CHECKLIST_ENABLED puuttuu ja reitit ovat suljettuja.

1. Tarkista senhetkinen Arxcian main ja gatewayn versio/keskeneräinen työ.
2. Ylläpitäjä varmistaa nykyisen arxcian-taulun SQLite-polun, varmuuskopion ja
   sen, että valittu Hermes-profiili/gateway on Albinin käytössä. Hermesin yleinen
   dashboard-token tai `tenant`-kenttä **ei** ole käyttäjäkohtainen oikeusraja:
   tavallisille muille käyttäjille ei saa antaa suoraa pääsyä tämän profiilin
   Kanban-työkaluihin, dashboardiin tai tiedostoihin. Tämä tulee tarkistaa
   ajonaikaisista asetuksista ennen aktivointia; lähdepaketti ei sisällä niitä.
3. `prepare_gateway.py` valmistaa erillisen tarkistettavan gateway-kopion. Se
   ei asenna eikä käynnistä mitään ja kieltäytyy version poiketessa annetusta SHA:sta.
   Tarkistetun gateway/run.py:n SHA256 on
   `3a7e5f62f74f090df750d9c81c1ae8c0fd31987e29e7302d7badf54affcb7547`.
   Muutos kutsuu rajattua käsittelijää nykyisen auth-portin jälkeen. Virhetilanteessa
   komento ei putoa LLM:lle, jotta kytkentäkoodi ei päädy agenttikontekstiin.
4. Vasta hyväksytyssä julkaisussa valmistellut kolme gateway-tiedostoa sijoitetaan
   oikean asennuksen gateway-hakemistoon. `bridge.py` ja `checklist.py` sijoitetaan
   vierekkäin erillisen valvotun prosessin työpolkuun. Nykyinen Oracle-bridge säilyy.
5. Asetukset gatewaylle: `ARXCIAN_CHECKLIST_ENABLED=true`,
   `ARXCIAN_CHECKLIST_DB=<ylläpitäjän varmentama olemassa olevan arxcian-taulun SQLite-polku>`.
   Uudelle bridgelle lisäksi nykyiset `ARXCIAN_ORIGIN` ja `ORACLE_BRIDGE_SECRET`.
   Arxcianille sama ominaisuuslippu ja sen nykyinen Redis/bridge-asetusympäristö.
   Ei uusia julkisia VPS-portteja, botteja, Telegram-pollereita tai botin avaimia.
6. Valvottu prosessi ajaa `python3 bridge.py`, joka synkronoi kahden sekunnin välein.
   Gateway-liitos vaatii gatewayn hallitun uudelleenkäynnistyksen hyväksytyssä ikkunassa.
7. Oikea kirjautunut käyttötesti: Albin kytkee tilinsä ja aloittaa Telegramissa,
   jatkaa Arxcianissa, sulkee selaimen ja avaa uudelleen, lukee tuloksen Telegramissa.
   Varmista toisella käyttäjällä luku-/kirjoituskielto sekä suorien Hermes-pintojen rajaus.

Palautus: sulje ominaisuuslippu Arxcianista, pysäytä vain uusi bridge ja palauta
varmennettu gateway-lähde hallitusti. Älä poista Kanban-tehtävää tai toimituskuitteja.
Vanhempaan SQLite-varmuuskopioon paluuta ei saa ohittaa nollaamalla revision.

## Testit

- `python3 -m unittest discover -s scripts/hermes-checklist -p 'test_*.py' -v`
  käyttää aina uutta tempfile-kantaa ja lähdepaketin oikeaa skeemaa.
- `npm test` sisältää API-käsittelijöiden testit. Uusi Redis-integraatiotesti aktivoituu
  asetuksilla CHECKLIST_REDIS_SERVER ja CHECKLIST_REDIS_CLI. Se käynnistää aina
  oman palvelimen uudessa temp-hakemistossa, portti 0, yksityinen Unix-socket,
  ei FLUSHDB:tä. Testissä on myös Pythonin oikea SQLite ↔ Redis ↔ Telegram-käsittelijä
  -ketju; ei Telegram-verkkoliikennettä eikä koko gateway-prosessia.
- Vanhaa ORACLE_REDIS_* -integraatiotestiä ei käynnistetä: siinä on FLUSHDB.
- DOM-testi on VPS:n arxcian-work/checklist-ui.cjs: todellinen React-komponentti,
  kaikki API-pyynnöt korvattu testivastauksilla, ei ulkoisia kutsuja.
- Tuotantokantaa, oikeaa Telegram-bottia tai mallia ei käytetä näissä testeissä.
