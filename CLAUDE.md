# arxcian

Yksi Next.js-sovellus, kaksi brändiä:

- **arxcian** (aina pienellä) — pääbrändi ja koko sovelluksen kehys. Kaikki sivut ovat polussa `/arxcian/*`, API `/api/arxcian/*`.
- **RJ-Mob** — bisnesportaali, nykyään **yksi arxcianin osio** muiden rinnalla polussa `/arxcian/rj-mob/*` (tuotto, trendit, kassamyynti, etela, tavoitteet, runrate, laskuri, tyovuoro, tyovuorot). Ei enää erillinen sivusto.

Osiot arxcianin alla: RJ-Mob, Trading, Uutiset, Personal. Yksi määrittely: [nav.ts](src/lib/arxcian/nav.ts).

RJ-Mobin sivut saavat arxcianin tumman kehyksen (Shell), mutta niiden **data pysyy tarkoituksella valkoisena** — taulukot ja seurannat on tarkoitettu luettaviksi, ei tunnelmallisiksi. Valkoisen pinnan antaa [rj-mob/layout.tsx](src/app/arxcian/rj-mob/layout.tsx), osionavigaation jaettu [RjMobNav](src/components/rjmob/RjMobNav.tsx).

## Mallin valinta

- **Opus 5** — isot arkkitehtuuripäätökset ja monimutkaiset ongelmat: auth- ja tietomallipäätökset, integraatiot joissa on kiertoteitä (Notion, Rumble, Forex Factory), suorituskyky- ja välimuististrategia, mitä tahansa mikä vaikuttaa useaan osioon kerralla.
- **Sonnet 5** — toistuva toteutustyö: komponentit, sivut, RSS-parsijat, rutiini-CRUD, tyylittely, testit.

**Muistuta käyttäjää vaihtamaan malli**, jos käytössä oleva malli ei vastaa tehtävän vaikeustasoa — molempiin suuntiin. Claude ei voi vaihtaa omaa malliaan kesken session; vaihto tehdään sovelluksen mallivalitsimesta.

## Työtapa

- Edetään vaihe kerrallaan. Vaiheen valmistuttua: pysähdy, kerro mitä tehtiin ja mitä pitää testata, odota vahvistus.
- Committaa pieninä loogisina kokonaisuuksina jokaisen alavaiheen jälkeen, ei isoa kasaa kerralla.
- Kysy ennen uusia isoja riippuvuuksia tai maksullisia palveluita.
- Jos datalähde ei ole luotettava (esim. Forex Factory), sano se suoraan — älä paikkaa hataralla ratkaisulla ilman lupaa.

## Koodityyli

Noudata olemassa olevan koodin tyyliä:

- Ei puolipisteitä rivin lopussa, 2 välilyönnin sisennys.
- Suomenkieliset kommentit ja käyttöliittymätekstit.
- Polkualias `@/*` → `src/*`.
- Jaettu logiikka `src/lib/`-hakemistoon, sivut `src/app/`-hakemistoon.
- Tailwind on käytössä, mutta nykyiset sivut käyttävät paljon inline-tyylejä — seuraa sen tiedoston tapaa jota muokkaat.

## Ympäristömuuttujat

`.env.local` paikallisesti, Vercelissä `vercel env add`. Älä koskaan committaa arvoja.

| Muuttuja | Käyttö |
|---|---|
| `SESSION_SECRET` | iron-session salausavain, väh. 32 merkkiä |
| `ALBIN_PIN`, `ARBNOR_PIN` | kirjautumistunnusluvut |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Google Sheets / Drive (palvelutili, RJ-Mob) |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Google Calendar (käyttäjän oma tili, arxcian) |
| `ANTHROPIC_API_KEY` | AI-tiivistelmät |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis -välimuisti |

Kaksi eri Google-tunnistautumista tarkoituksella: RJ-Mob lukee jaettuja taulukoita **palvelutilillä**, arxcianin kalenteri vaatii **käyttäjän oman OAuth-luvan** omaan kalenteriinsa. Näitä ei voi yhdistää.

## Käyttäjät ja näkyvyys

Kaksi käyttäjää: `albin` ja `arbnor`. Vierastili on poistettu kokonaan — kaikki sisältö vaatii kirjautumisen.

Istunto on iron-sessionilla salattu eväste (`arxcian_session`), ei väärennettävissä selaimesta. Kaikki apurit: [src/lib/session.ts](src/lib/session.ts).

Jokainen henkilökohtainen tietue saa `owner`-kentän: `'albin' | 'arbnor' | 'shared'`. Suodata aina palvelinpuolella `canView()`- tai `visibleTo()`-apurilla, älä selaimessa.

```ts
const user = await currentUser()
const omat = visibleTo(kaikki, user)
```

Globaali `vercel` on 54.4.1 eikä osaa lisätä preview-muuttujia ei-interaktiivisesti (jää `git_branch_required`-tilaan). Päivitys vaatisi sudon, joten käytä preview-lisäyksiin `npx vercel@latest env add <NIMI> preview --value <arvo> --yes`.

## RJ-Mobin laskentaohjeet ovat Drivessä, eivät koodissa

Kaikki RJ-Mobin datapoiminta- ja laskentasäännöt on kirjoitettu auki Google
Driveen kansioon **Arxcian > rjmob > Ohjeet** (kansio-id
`1d8o0ObBBxV5b7xMA-tH014Q8xsPILWGp`): `myyntiseuranta_ohje`,
`tuottoseuranta_ohje`, `tavoitteet_ja_runrate_ohje`, `trendit_ohje`,
`tilannekatsaus_ohje`, `maksukuitti_ohje` ja `rj-mob_myyjät`.

**Tarkista ohje ennen kuin muutat laskentaa, äläkä päättele kaavaa koodista
taaksepäin.** Koodi kertoo mitä tehdään, ohje kertoo miksi — ja ohje on se
jonka Albin päivittää. Ohjeet myös muuttuvat: elokuussa 2026 myyntiseurannan
välilehtirakenne vaihtui kesken kuun ja `rj-mob_myyjät` kirjoitettiin uusiksi
taulukkomuotoon saman päivän aikana. Jos jokin luku näyttää väärältä eikä
koodista löydy syytä, lue ohje uudelleen ennen kuin korjaat koodia.

`rj-mob_myyjät` on myyjälista, jossa on tunnus, koko nimi, tuntipalkka ja
työskenteleekö myyjä yhä. Se on **dokumentaatiota, ei koodin lukema lähde** —
samat tiedot ovat `TUNTIPALKAT` ja `RJ_MOB_SELLERS` ([rjmob.ts](src/lib/rjmob.ts))
sekä `MYYJAT` ([winpos-myyjat.ts](src/lib/winpos/winpos-myyjat.ts)). Kun lista
muuttuu, molemmat päät on päivitettävä. Jos siitä joskus halutaan elävä lähde,
se pitää siirtää Docsista Sheetsiin: Docsin sarkainsisennetystä tekstistä
parien tunnistus nojaa rivijärjestykseen eikä kestä käsin tehtyä muotoilua.

**Lukeminen kun Drive-connectori ei vastaa:** kansio on jaettu projektin
palvelutilille, joten ohjeet saa luettua `GOOGLE_SERVICE_ACCOUNT_KEY`:llä ilman
connectoria — `drive.files.export({ fileId, mimeType: 'text/plain' })` scopella
`drive.readonly`. Huom. että `.env.local`in avain pitää `JSON.parse`ata
**ilman** `\n`-korvausta; korvaus rikkoo private_keyn.

## Ulkoinen data: hae ja välimuistita

Kaikki ulkoiset lähteet kulkevat [src/lib/arxcian/cache.ts](src/lib/arxcian/cache.ts):n kautta. Älä hae RSS:ää tai markkinadataa suoraan sivulla.

```ts
const uutiset = await fetchAndCache(
  { key: 'news:bisnes', ttl: 3600 },
  () => haeSyote(url),
)
// uutiset.source: 'network' | 'cache' | 'stale'
```

Kolme periaatetta: sivulataus ei odota ulkoista lähdettä jos välimuistissa on tuoretta dataa (cron pitää sen lämpimänä), lähteen kaatuessa palautetaan vanhentunutta dataa virheen sijaan, ja Redisin ollessa poissa haku menee suoraan lähteeseen — välimuistin vika ei kaada sivua. Hauilla on aikakatkaisu (oletus 15 s).

Ajastetut haut: työt lisätään `JOBS`-rekisteriin [src/lib/arxcian/cron.ts](src/lib/arxcian/cron.ts):ssä, jolloin cron-reittiä ei tarvitse muuttaa. Reitti on `/api/arxcian/cron`, todennus `CRON_SECRET` tai kirjautunut käyttäjä (käsin käynnistys testatessa). `/api/arxcian/health` kertoo onko Redis tavoitettavissa.

**Ajastus ei ole Vercel Cronissa.** Projekti on Hobby-tasolla, joka sallii kaksi cronia kerran päivässä — `vercel.json`issa on jo yksi (`/api/webhook/register`). Uutisten neljä päivittäistä hakua ajetaan [.github/workflows/arxcian-cron.yml](.github/workflows/arxcian-cron.yml):stä, joka kutsuu samaa reittiä. Jos taso joskus nousee Prohon, ajastuksen voi siirtää `vercel.json`iin koodia muuttamatta.

Redis on Upstash-resurssi `upstash-kv-amethyst-river`, liitetty vakionimillä kaikkiin kolmeen ympäristöön. Paikallinen kehitys käyttää samaa kantaa — aja `vercel env pull .env.local --environment development` kun tunnukset vaihtuvat.

## Google Calendar

Käyttäjäkohtainen OAuth, erillään sovelluksen PIN-kirjautumisesta: [oauth.ts](src/lib/arxcian/personal/calendar/oauth.ts) hoitaa luvan, [accounts.ts](src/lib/arxcian/personal/calendar/accounts.ts) tilit ja tokenit, [events.ts](src/lib/arxcian/personal/calendar/events.ts) haun.

**Yksi käyttäjä voi liittää useita Google-tilejä** (henkilökohtainen + työ). Tallennus on jaettu kahtia tarkoituksella:

| Avain | Sisältö |
|---|---|
| `calendar:accounts:<käyttäjä>` | `CalendarAccount[]` — **ei koskaan tokeneita**, tämä serialisoidaan selaimeen asti |
| `calendar:tokens:<käyttäjä>:<tiliId>` | tokenit, vain palvelimelle |
| `calendar:events:<käyttäjä>:<tiliId>` | tilikohtainen tapahtumavälimuisti |

Yhtä taulukkoa jossa tokenit olisivat mukana ei voi käyttää: access-token uusiutuu haun yhteydessä jokaiselle tilille rinnakkain, ja kaksi yhtaikaista luku-muokkaa-kirjoita -kierrosta samaan avaimeen hukkaisi toisen tilin uuden tokenin. Indeksin luku-muokkaa-kirjoita jää vain lisäykseen ja poistoon, jotka ovat sarjallisia käyttäjän toimintoja.

Tilin tunniste on Googlen `sub`, ei sähköposti — Workspace-osoite voi vaihtua, jolloin sähköpostiavaimella tili katoaisi. **Tyhjä indeksi `[]` on eri asia kuin puuttuva avain:** se tarkoittaa "kaikki katkaistu", ja avaimen olemassaolo on ainoa merkki siitä että migraatio vanhasta yhden tilin mallista on jo ajettu. Siksi katkaisu kirjoittaa `[]` eikä poista avainta.

Scopet: `calendar.readonly` tapahtumiin, `openid` + `userinfo.email` vain tilin tunnisteeseen ja näytettävään osoitteeseen. `prompt: 'select_account consent'` on pakollinen — ilman `select_account`ia Google käyttää vaiti jo kirjautunutta tiliä eikä toista tiliä voi lisätä lainkaan. Tapahtumat haetaan kaikista kalentereista jotka käyttäjä on valinnut näkyviin Googlessa, `singleEvents=true` purkaa toistuvat tapahtumat palvelinpuolella (siksi RRULE-jäsennintä ei tarvita).

Tilin väri johdetaan **järjestysnumerosta listassa** (`--ax-cal-1`…`--ax-cal-4`: sininen, keltainen, vihreä, violetti), ei tallennetusta arvosta eikä sähköpostista. Tilin poisto siis siirtää jäljelle jäävien värejä — tietoinen valinta.

**OAuth-suostumusnäyttö on oltava "In Production", ei "Testing".** Testing-tilassa Google vanhentaa refresh-tokenit 7 päivässä, jolloin kalenteri pitäisi liittää uudelleen viikoittain. Vahvistamaton sovellus tuotantotilassa näyttää varoitusnäytön ja on rajattu 100 käyttäjään — molemmat merkityksettömiä kahdelle käyttäjälle.

Valtuutuksen `state` tallennetaan iron-session-istuntoon ja kelpaa kertaalleen. Uudelleenohjausosoite johdetaan pyynnön originista, joten sama koodi toimii localhostissa ja tuotannossa — molemmat on rekisteröitävä Google-konsoliin.

Valtuutusvirhe (peruutettu lupa) poistaa **vain sen tilin** tokenit ja jättää tilin listaan `reauth`-tilaan, jotta käyttäjä näkee kumpi tili pitää liittää uudelleen. Muiden tilien tapahtumat säilyvät näkyvissä. Verkkovirheessä näytetään vanhentunut data kuten muuallakin. Ylätason tila on `connected` jos vähintään yksi tili toimii, joten yhden tilin sovellus käyttäytyy täsmälleen kuten ennen.

`getCalendarStatus` on kääritty Reactin `cache()`iin: hub-etusivu kutsuu sitä kahdesti samalla renderöinnillä (DailyFocus ja UpcomingEvents), ja useamman tilin myötä ero olisi moninkertainen.

## PWA

Asennettavissa kotiruudulle: manifest [src/app/manifest.ts](src/app/manifest.ts), service worker [public/sw.js](public/sw.js). `start_url` on `/arxcian`, mutta `scope` on `/`, jotta RJ-Mob aukeaa samassa ikkunassa eikä selaimessa.

Service worker **ei tallenna HTML-sivuja välimuistiin** tarkoituksella — sisältö on henkilökohtaista ja Albin ja Arbnor voivat käyttää samaa laitetta. Vain muuttumattomat `/_next/static/*` ja `/icons/*` välimuistitetaan; verkon pettäessä näytetään offline-sivu. Rekisteröinti tapahtuu vain tuotannossa.

Ikonit generoidaan ilman kuvakirjastoja: `node scripts/generate-icons.mjs`. Muokkaa skriptiä jos merkki vaihtuu.

PWA-tiedostot on jätetty middlewaren ulkopuolelle, muuten asennus ei onnistu.

## arxcianin visuaalinen suunta ja pitkän tähtäimen roadmap

Visuaalinen kieli on tietoisesti "JARVIS OS" -henkinen: matta lähes musta tausta
(`#05070B`), elektroninen sinisyaani korostusväri, kerroksellinen hehku
(radial-gradient taustassa + hohtovarjo paneeleissa), lasimainen läpikuultavuus
(`backdrop-blur`), ohuet valaistut reunaviivat ja pyöristys 16 px (`rounded-2xl`).
Kaikki värit kulkevat `.arxcian-root`-luokan CSS-muuttujien kautta
([globals.css](src/app/globals.css)) — yksi muutos näkyy kaikissa osioissa.

**Brändi pysyy "arxcian":na, ei "JARVIS":na** — visuaalinen referenssi, ei
nimeämisohje.

Käyttäjän antama design-brief (17-sivuinen "JARVIS OS" -konsepti: AI-chat,
tietoholvi, projektit, CRM, automaatiobuilder, ääniohjaus, jne.) on hyväksytty
**pitkän tähtäimen suunnaksi**, ei välitöntä toteutuslistaa. Karkea vastaavuus
nykyiseen/tulevaan rakenteeseen:

| JARVIS OS -sivu | arxcian-vastine |
|---|---|
| Home / Command Center | Hub-etusivu (olemassa) |
| Calendar | Personal → Google Calendar (olemassa) |
| Goals & Habits | Personal → tavoitteet/rutiinit (olemassa) |
| Intelligence Feed | Uutiset (olemassa) |
| Interactive World | Hubin 3D-maapallo — markkinapaikat ja kaupunkien sää samassa näkymässä |
| Files | Drive-integraatio, palvelutilillä RJ-Mobin jaettu Drive (suunniteltu) |
| AI (chat, planner, automations) | Kirjoitusoikeuksin toimiva AI-avustaja (suunniteltu, iso arkkitehtuuripäätös → Opus 5) |
| Knowledge Vault, Projects, Finance, People CRM, Voice Center, Automation Builder, Mission Control | Ei vielä suunniteltu — käsitellään yksi kerrallaan kun ajankohtaista |

**Maapallolla ei ole kerrosvalitsinta** (päätös 9.8.2026): erilliset World-,
Markets- ja Weather-näkymät on yhdistetty yhdeksi kartaksi, jossa kaikki pisteet
ovat esillä samaan aikaan. Piste kertoo itse ryhmänsä (`kind`), ja sääpisteille
piirretään kutsuviiva kartan reunaan lämpötilan kanssa. Uutta dataa lisätessä
lisätään pisteitä, ei kerroksia.

**Intel, Network ja Travel on rajattu pois** (sama päätös): niille ei ole
datalähdettä, eikä karttaa rakenneta keksityn datan varaan. GlobalNews on yhä
auki — RSS-artikkeleissa ei ole sijaintikenttää, joten se vaatisi
AI-geokoodauksen jossa sijainti on pääteltu eikä artikkelin metadataa.

Edetään näidenkin kanssa "Työtapa"-osion periaatteella: vaihe kerrallaan, ei
kaikkea kerralla.

## Hubin etusivu

Etusivu on HUD-näkymä ([page.tsx](src/app/arxcian/page.tsx)): kello ja järjestelmän tila ylärivillä, maapallo keskellä, paneelit molemmin puolin ja avustajapalkki alalaidassa.

Kaikki paneelit kulkevat jaetun [Panel.tsx](src/components/arxcian/Panel.tsx):n läpi — **ilme muuttuu yhdestä paikasta**, älä tyylittele yksittäisiä paneeleita erikseen. Taustan [SynapseField](src/components/arxcian/SynapseField.tsx) johtaa pistemääränsä näkymän pinta-alasta ja pysähtyy kun välilehti menee taustalle; viivahaku on O(n²), joten kiinteä pistemäärä olisi puhelimessa turhaa työtä.

Maapallon ympärillä on kaksi eri kerrosta joita ei pidä sekoittaa: [GlobeHud](src/components/arxcian/globe/GlobeHud.tsx) piirtää SVG-renkaat, lähdetiedot ja varaumat pallon **sisälle**, [GlobeFrame](src/components/arxcian/hub/GlobeFrame.tsx) taas HUD-renkaat ja projektorikehän sen **ympärille**. Molemmat ovat `pointer-events-none`, koska pallo on raahattava.

Alapalkki ei ole oma hakukenttänsä vaan avaa `CommandPaletten` ikkunatapahtumalla (`OPEN_PALETTE_EVENT`). Kaksi rinnakkaista kenttää samaan tarkoitukseen olisi kahdenlaista tilaa ilman hyötyä.

Seuratut YouTube-kanavat: [channels.ts](src/lib/arxcian/channels.ts), julkinen RSS-syöte ilman API-avainta, cron-työ `hub-channels`. Kanava-ID on pysyvä vaikka kanava vaihtaisi nimeä — siksi ID kovakoodataan eikä @-tunnusta.

**YouTube vaatii selainmaiset otsakkeet.** Bottimaisella User-Agentilla haku toimii kotiverkosta mutta kaatuu Vercelistä: cron kirjoitti 11.8.2026 nolla videota samalla ajolla jossa uutis-RSS haki kuusikymmentä. Tarvitaan oikea User-Agent, `Accept-Language` ja `CONSENT=YES+cb` -eväste (ilman sitä YouTube ohjaa suostumussivulle). Sama koskee [ict.ts](src/lib/arxcian/trading/ict.ts):ää.

RJ-Mobin kuukausiluvut: [rjmobSummary.ts](src/lib/arxcian/rjmobSummary.ts), cron-työ `rjmob-summary`. Laskenta on jaettu kirjastoihin ([rjmobSheets.ts](src/lib/rjmobSheets.ts), [rjmobDrive.ts](src/lib/rjmobDrive.ts)) juuri siksi että ajastettu työ pääsee siihen ilman istuntoa — `/api/sheets` ja `/api/files` ovat enää ohuita kuoria. **Kuukausi valitaan samalla `vuosi × 100 + kuukausi` -säännöllä kuin tuottoseurannan sivulla**, ja kentät ovat ne joita sivu itse näyttää (`liittKpl`, `kassa`, `fsecKpl`); muuten hubin luku voisi ajautua eri suuntaan kuin se luku jota sivulla katsotaan.

Muutosprosentti on **run rate -ennuste, ei toteuma**: hub näyttää aina kuluvaa kuukautta, joten kertymän vertaaminen edellisen kuun kokonaislukuun näyttäisi romahdusta vaikka myynti kävisi normaalisti. Kertymä projisoidaan kuukauden loppuun ja vertailu tehdään sillä. Ennustetta ei näytetä ennen kuin kuukaudesta on kulunut seitsemän päivää — sitä ennen kerroin on niin suuri (1. päivänä ×31) että yksi päivä heiluttaa prosenttia satoja yksiköitä.

### Kassamyynti-välilehden kaksi nimisaraketta

Winpos-tuonti kirjoittaa ja tuottoseuranta lukee **eri sarakkeesta**, ja se
näyttää virheeltä kummasta päästä tahansa katsottuna. Se on tahallista:

| | |
|---|---|
| sarake C `Nimi` | Winposin **raakanimi** ("Steven"). Tänne [suunnitelma.ts](src/lib/winpos/suunnitelma.ts) kirjoittaa. |
| sarake A `Nimikorjaus` | `=XLOOKUP(C2; J:J; K:K; C2)` kääntää sen koko nimeksi hakutaulusta J:K. |
| lukupää | [rjmobTargets.ts](src/lib/rjmobTargets.ts) lukee sarakkeen A, koska vain korjattu nimi matchaa `RJ_MOB_SELLERS`-listaan. |

Lukupäässä osuma sarakkeeseen A syntyy siitä että `findCol` vertaa
osajonolla ja "Nimikorjaus" sisältää sanan "nimi" ja tulee ensin — **älä
"korjaa" sitä osumaan sarakkeeseen C**, koska lyhytnimet ("Joni V",
"Kasperi K.") eivät vastaa myyjälistaa ja kassaluvut katoaisivat kaikilta.

Toiseen suuntaan sama: jos tuonti alkaisi kirjoittaa koko nimen, XLOOKUP ei
löytäisi sitä hakutaulusta ja palauttaisi varana saman nimen — pinnalta
kaikki näyttäisi toimivan, mutta nimikartan ylläpito siirtyisi hiljaa
taulukosta koodiin, ja uusi myyjä alkaisi vaatia koodimuutoksen sen sijaan
että Albin lisäisi rivin hakutauluun. **Muuta molemmat päät tai kumpaakaan.**

Huom. myös että tuonnin oma otsikkohaku ([suunnitelma.ts](src/lib/winpos/suunnitelma.ts))
tarkistaa **täsmällisen osuman ennen osittaista** juuri tämän takia: pelkkä
osajonovertailu osuisi siellä sarakkeeseen A ja keskeyttäisi jokaisen
tuonnin turvarajaan. Lukupää käyttää tarkoituksella vanhaa `findCol`ia.

**Maapallon mantereet ovat yhtä sinistä sävyä** ([GlobeScene.tsx](src/components/arxcian/globe/GlobeScene.tsx)): päivätekstuurista otetaan vain kirkkaus, ei väriä. Kaupunkivalot luetaan omasta tekstuuristaan eikä niihin kosketa, joten ne pysyvät keltaisina — se kontrasti tekee yöpuolen luettavaksi. Merillä on oma tumma sävynsä; aiemmin niissä näkyi suoraan taustan sumutekstuuri, jolloin pallo oli reikä taustaan eikä kappale.

**Maapallolle ei lisätä uutispisteitä.** RSS-artikkeleissa ei ole sijaintikenttää, joten punaiset tapahtumamerkit vaatisivat pääteltyä sijaintia. Sama päätös kuin Intel/Network/Travel-kerrosten kohdalla.

## Markkina-ajat ja ilmoitukset

Forex-istuntojen (Aasia/Tokio, Lontoo, New York) aukiolot ja käyttäjän omat
treidausajat ovat sama asia eri lähteestä, joten ne kulkevat yhden tyypin
kautta: [marketEvents.ts](src/lib/arxcian/trading/marketEvents.ts) tuottaa
aikajanan `MarketEvent`-tapahtumia, eikä ilmoituksen antaja tiedä kummasta on
kyse. Kaksi ilmoituspolkua ajautuisi erilleen — toinen dedupetaan, toinen ei,
toinen soittaa äänen, toinen unohtaa.

Ajat määritellään **paikallisena kellonaikana IANA-vyöhykkeessä**, ei
UTC-siirtymänä. Muunnos on [zoneTime.ts](src/lib/arxcian/zoneTime.ts):ssä,
erotettuna sessions.ts:stä juuri siksi että molemmat käyttävät sitä. Lontoo ja
New York siirtyvät kesäaikaan eri viikonloppuina eikä Tokio siirry lainkaan,
joten kiinteä siirtymätaulukko olisi väärässä useita viikkoja vuodessa: 16.3.
New York avaa Suomen aikaa 14.00, muina aikoina 15.00.

### Kaksi ilmoituskerrosta, ei yhtä

**In-app-kerros** ([MarketAlerts](src/components/arxcian/trading/MarketAlerts.tsx))
hoitaa bannerin ja äänimerkin silloin kun arxcian on auki. Se ei ole
väliaikaisratkaisu vaan pysyvä puolisko: käyttöjärjestelmän push ei näytä
mitään avoimessa välilehdessä, joten pelkkä push tarkoittaisi että arxciania
katsoessa ilmoitus tulee puhelimeen eikä ruudulle.

**Web Push** tavoittaa suljetun sovelluksen. Se on päätetty 14.8.2026 ja
rakennetaan samojen `MarketEvent`ien päälle — ei toista aikajanaa.

Ajastin oli koko kysymyksen pullonkaula. Vercel Cron ei kelpaa millään
tasolla johon tässä ollaan: Hobby sallii 100 cronia per projekti mutta
**kukin vain kerran vuorokaudessa, tarkkuus ±59 min**. (Aiempi merkintä
"kaksi croniä/vrk" oli väärä — määrä ei ollut koskaan rajoite, tarkkuus oli.)
GitHub Actions myöhästyy rutiinilla 5–15 min, mikä riittää uutishakuun mutta
ei siihen että "Lontoo avautuu" on totta silloin kun se sanotaan.

Valittu **QStash**: se ajastaa yksittäisen HTTP-kutsun absoluuttiseen hetkeen
(`Upstash-Not-Before`), joten pollausta ei ole lainkaan. Yksi vuorokausittainen
ajastus suunnittelee seuraavan 36 h tapahtumat jonoon. Volyymi ~30 viestiä/vrk,
ilmaisraja 1 000/vrk. Sivuhyöty: QStash allekirjoittaa pyyntönsä, joten
push-reitit verifioidaan allekirjoituksella eikä `CRON_SECRET`illa.

**Suunnittelija on idempotentti, ei kertaluontoinen.** QStashin oma
deduplikaatio-ikkuna on vain 10 minuuttia, joten se ei estä saman tapahtuman
jonottamista uudelleen seuraavana päivänä. Idempotenssi tehdään itse: jokainen
jonotettu tapahtuma kirjataan Redisiin avaimella `push:planned:<tapahtuma-avain>`
ja QStashin viesti-id:llä, ja suunnittelija ohittaa jo jonossa olevat. Sivutuote
on peruutus: kun oma treidausaika poistetaan, tallennettu viesti-id kertoo mikä
jonosta pitää poistaa.

**Talouskalenteri ei ulotu viikonlopun yli.** ForexFactoryn syöte kattaa vain
kuluvan viikon (su–la) eikä `ff_calendar_nextweek` vastaa mitään, joten
perjantaina ajettu suunnittelija ei näe maanantain punaisia julkaisuja — niitä
ei vielä ole olemassa. Tätä **ei ratkaista pidemmällä ikkunalla** vaan
ajoituksella: suunnittelija ajetaan vuorokausittaisen ajastuksen lisäksi aina
kun `trading-calendar`-cron on päivittänyt syötteen, ja idempotenssi tekee
ylimääräisistä ajoista vaarattomia. Istuntoajat eivät kärsi tästä lainkaan —
ne ovat sääntöjä ja laskettavissa miten kauas tahansa.

**Kuljetus ei saa olla markkinakohtainen.** Sama "herää oikeaan aikaan ja
kerro käyttäjälle" -mekanismi tarvitaan talouskalenterin punaisille
julkaisuille (T-15 min) ja myöhemmin YouTube-kanavien uusille videoille, ks.
[docs/trading-backlog.md](docs/trading-backlog.md). Kaksi erillistä ratkaisua
samaan ongelmaan on juuri se mitä ei haluta, joten ajastin ja tilaukset
rakennetaan yleisiksi ja `MarketEvent` on yksi lähde niiden päällä.

### Yksityiskohdat

Kanavia on kolme (selainilmoitus, banneri, ääni) erikseen kytkettävinä, koska
ne epäonnistuvat eri tavoin: ilmoitus vaatii luvan, ääni käyttäjän eleen,
banneri toimii aina. Yksi yhteinen kytkin piilottaisi sen että kaksi kolmesta
ei tullut perille. Ääni syntetisoidaan Web Audiolla eikä ladata tiedostona —
äänitiedosto olisi verkkohaku juuri sillä hetkellä kun ilmoituksen pitäisi
olla välitön.

In-app-kerroksen kaksoisilmoitus estetään **yhdellä kasvavalla aikaleimalla**
selaimen localStoragessa, ei avainlistalla: tapahtumat tulevat ilmoitushetken
järjestyksessä, joten "tätä vanhemmat on hoidettu" on sama tieto ilman
siivousta. Yli 10 minuuttia myöhässä olevat ohitetaan mutta merkki siirretään
silti — muuten nukkuneen koneen herätessä tulisi kerralla koko päivän rypäs.
Merkki on laitekohtainen eikä käyttäjäkohtainen; sama tapahtuma kuuluukin
näyttää erikseen puhelimessa ja koneella. Pushin puolella sama tieto on
palvelimella, koska lähettäjä on siellä.

Asetukset ja omat ajat ovat KV:ssä käyttäjäkohtaisesti
([notifyStore.ts](src/lib/arxcian/trading/notifyStore.ts)), eivät selaimessa:
Albin ja Arbnor voivat käyttää samaa laitetta, ja selaimeen tallennettu asetus
tarkoittaisi että toisen killzone-ajat hälyttäisivät toiselle.

**iOS:** push toimii vain kotiruudulle asennetusta PWA:sta (16.4+), lupakysely
vaatii käyttäjän eleen, ja tilaus kuolee jos sovellus poistetaan — kuolleet
tilaukset (410/404) siivotaan lähetyksen yhteydessä.

## Tunnetut puutteet

Maapallolla **ei ole punaisia uutispisteitä** eikä kaupunkien välisiä synapsikaaria. Uutispisteet vaatisivat pääteltyä sijaintia (RSS:ssä ei ole sijaintikenttää), kaaret odottavat käyttäjän omaa toteutusta.

Kaupunkilaput on pinottu pallon reunoihin eikä sijoitettu vapaasti pisteen viereen: kaupunkeja on 14 ja Eurooppa yksin tuo seitsemän lappua muutaman asteen sisään toisistaan, jolloin vapaa sijoittelu menisi päällekkäin ilman törmäyksenväistoa.

Alla korjatut, jotta samaa ei ehdoteta uudelleen.

Korjattu 11.8.2026: hubin RJ-MOB-paneeli oli tyhjässä tilassa, koska `rjmob:summary`-avainta ei kirjoittanut kukaan. Laskenta siirrettiin reiteiltä kirjastoihin ja cron-työ `rjmob-summary` kirjoittaa avaimen. Siirto varmistettiin vertaamalla `/api/sheets`-vastausta ennen ja jälkeen: tuloste oli tavumerkilleen identtinen kahdelta kuukaudelta.

Korjattu 10.8.2026: `/api/webhook/register` oli middlewaressa auki eikä todentanut itse, joten kuka tahansa saattoi laukaista Drive watch -kanavan rekisteröinnin. Reitti todentaa nyt `authorizeCron`illa ([cron.ts](src/lib/arxcian/cron.ts)) eli `CRON_SECRET`illa tai kirjautuneella käyttäjällä, samaan tapaan kuin `/api/arxcian/cron`. Vercel Cron lähettää `CRON_SECRET`in `Authorization`-otsakkeessa automaattisesti, joten `vercel.json`in päivittäinen ajo toimii ennallaan. `/api/webhook/drive` todentaa edelleen itse `x-goog-channel-token`-otsakkeella. Middlewaren poikkeus on nyt eksplisiittinen lista kahdesta polusta (`/api/webhook/drive`, `/api/webhook/register`) eikä `/api/webhook/`-prefiksi, jottei uusi webhook-reitti aukea vahingossa.

Korjattu 10.8.2026: kirjautumisen yritysrajoitus ([api/login](src/app/api/login/route.ts)) tunnisti kutsujan `x-forwarded-for`-otsakkeesta, jonka vasemman arvon kutsuja voi väärentää ja saada joka yrityksellä uuden kiintiön. IP luetaan nyt `req.ip`:stä (varalla `x-real-ip`), jotka tulevat Vercelin proxyltä eivätkä ole asiakkaan asetettavissa.

Korjattu 10.8.2026: RJ-Mobin vanhat API-reitit (`/api/sheets`, `/api/targets`, `/api/receipts`, `/api/files`, `/api/rules`, `/api/shifts`) olivat middlewaressa auki ilman istuntoa. Nyt **kaikki** API-reitit vaativat istunnon lukuun ottamatta `isPublic()`-listaa [middleware.ts](src/middleware.ts):ssä.
