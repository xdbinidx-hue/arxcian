# Oracle-komentokeskus v1

Tila: toteutusspeksi
Päivä: 2026-09-08
Omistaja: Albin
Manageri: Oracle

## Tavoite

Korvataan Arxcianin nykyisen komentopaletin suora Anthropic-keskustelu aidolla Hermes/Oracle-yhteydellä rakentamatta uudelleen toimivaa käyttöliittymää, puhetta, tietolähteitä tai hyväksyntälogiikkaa.

Vaihe 1 päättyy toimivaan kehitysversion Oracle-keskusteluun. Agenttiprofiilit, raporttiajastus ja tuotantojulkaisu eivät kuulu tähän vaiheeseen.

## Nykyisestä säilytettävät osat

- Arxcianin Shell, HUD, maapallo ja paneelit
- `CommandPalette` ja `AssistantBar`
- käyttäjäistunto ja nykyinen käyttöoikeusrajaus
- ElevenLabs-TTS, puhejono, mikrofonipainike ja keskustelutila
- nykyiset navigointi- ja kirjoitusehdotusten vahvistuskortit
- Upstash/Vercel KV
- nykyiset datan haku- ja cron-työnkulut

Suora Anthropic-reitti säilytetään väliaikaisena palautuspolkuna, kunnes Oracle-polku on testattu. Sitä ei laajenneta uusilla ominaisuuksilla.

## Arkkitehtuuri

1. Kirjautunut selain lähettää viestin Arxcianin Oracle-API:lle.
2. API validoi käyttäjän ja luo idempotentin, käyttäjäkohtaisen viestin nykyiseen KV:hen.
3. VPS:n ulospäin yhteyttä ottava Oracle-silta lunastaa odottavan viestin suojatusta bridge-reitistä.
4. Silta kutsuu vain localhostissa olevaa Hermes Runs/Sessions API:a bearer-avaimella.
5. Silta palauttaa työkalutapahtumat, tekstin, hyväksyntäpyynnöt, tilan ja virheet Arxcianin bridge-reitille.
6. Selain lukee tapahtumat Arxcianin API:n kautta. Hermes-avain ja bridge-salaisuus eivät koskaan mene selaimeen.
7. Hermes-istunnon tunniste sidotaan käyttäjäkohtaiseen Arxcian-keskusteluun, jotta jatkuminen toimii sivun uudelleenlatauksen jälkeen.

Hermes API:a ei julkaista internetiin eikä sille avata CORSia.

## Ensimmäinen tracer bullet

Ensimmäinen toteutettava pystyleikkaus:

- kirjautunut käyttäjä luo yhden Oracle-viestin
- viesti tallentuu odottavaksi
- vain oikealla bridge-salaisuudella sen voi lunastaa
- sama viesti voidaan lunastaa vain kerran
- bridge palauttaa yhden tekstivastauksen
- käyttäjä näkee vastauksen ja lopputilan
- saman idempotency-avaimen uusinta ei luo toista työtä.

Työkalutapahtumat, hyväksynnät, keskeytys ja käyttöliittymän laajennus lisätään vasta tämän pystyleikkauksen jälkeen erillisin RED–GREEN-kierroksin.

## Tietomalli

Oracle-viesti sisältää vähintään:

- palvelimen luoma tunniste
- käyttäjän omistajuus
- asiakkaan idempotency-avain
- käyttäjän teksti
- Hermes-session tunniste tai tyhjä arvo ensimmäisellä vuorolla
- tila: `queued | claimed | running | waiting_approval | completed | failed | cancelled`
- luonti- ja päivitysaika
- bridge-lunastuksen määräaika
- järjestysnumero tapahtumille.

Selaimelle ei palauteta bridge-salaisuutta, Hermes-avainta, sisäisiä virhepinoja tai toisen käyttäjän tietoja.

## Turvarajat

- Kaikki käyttäjärajapinnat vaativat nykyisen Arxcian-istunnon.
- Bridge-reitit käyttävät ajoitusturvallisesti verrattavaa erillistä salaisuutta.
- Käyttäjä ei voi valita mielivaltaista Hermes-profiilia, mallia, työhakemistoa tai työkalua pyynnön mukana.
- Viestin pituus ja formaatti validoidaan palvelimella.
- Lunastus on lease-pohjainen: kaatuneen bridgen työ palautuu jonoon määräajan jälkeen.
- Kaikki kirjoitukset ovat idempotentteja.
- Virhetilanne kerrotaan käyttäjälle, eikä epäselvää verkkokatkoa väitetä onnistumiseksi.
- Oikeat henkilötiedot eivät kuulu automaattisiin testeihin tai katselmointipakettiin.

## Valmistumiskriteerit

1. Yksi tekstivuoro kulkee selaimesta Arxcianin kautta localhost-Hermekseen ja takaisin.
2. Keskustelu jatkuu samalla Hermes-istunnolla sivun uudelleenlatauksen jälkeen.
3. Käyttöliittymä näyttää vähintään tilat `jonossa`, `Oracle työskentelee`, `valmis`, `odottaa hyväksyntää` ja `epäonnistui`.
4. Käyttäjä voi keskeyttää aktiivisen Hermes-ajon.
5. Hermesin hyväksyntäpyyntö voidaan hyväksyä tai hylätä Arxcianissa täsmällisen toimen näkyessä.
6. Uudelleenlähetetty pyyntö ei käynnistä kaksoisajoa.
7. Bridge-katkos ei kadota viestiä, vaan lease vapautuu uudelleen käsiteltäväksi.
8. Toisen käyttäjän viestejä, tapahtumia tai sessiotunnisteita ei voi lukea.
9. Hermes API ei ole julkisesti saavutettavissa, eikä sen avain esiinny selainvastauksissa tai Git-diffissä.
10. Nykyinen avustajapolku voidaan palauttaa ilman tietokantamigraation purkua.
11. Kohdistetut testit, koko testisarja, typecheck, build ja diff-tarkistus läpäisevät.
12. Riippumaton katselmointi hyväksyy toteutuksen ennen preview-pushia.

## Rajaus vaiheesta 1 ulos

- Hermes-agenttiprofiilien luominen
- Kanbanin käyttöönotto
- RJ-Mob-raportin klo 8.30 ajastus
- paikallisen herätesanamallin npm-riippuvuudet
- ElevenLabs-äänten muuttaminen tai luominen
- visuaalinen kokonaisuudistus nykyisen Arxcian-tyylin ulkopuolelle
- tuotantomerge, tuotantodeploy ja henkilöstölle lähtevät viestit

## Toteutusjärjestys

1. Testattava jonon ja tapahtumien ydinkirjasto.
2. Käyttäjä- ja bridge-API-reitit.
3. VPS-silta ja Hermes-session jatkuvuus.
4. Nykyisen komentopaletin Oracle-tila.
5. Hyväksyntä, keskeytys ja virhepalautus.
6. Laatuportit, riippumaton katselmointi ja preview-valmistelu.
