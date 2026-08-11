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

**Maapallolle ei lisätä uutispisteitä.** RSS-artikkeleissa ei ole sijaintikenttää, joten punaiset tapahtumamerkit vaatisivat pääteltyä sijaintia. Sama päätös kuin Intel/Network/Travel-kerrosten kohdalla.

## Tunnetut puutteet

Hubin **RJ-MOB-paneeli on tyhjässä tilassa**: se lukee `rjmob:summary`-avainta jota kukaan ei vielä kirjoita. Paneeli ja tyyppi ([rjmobSummary.ts](src/lib/arxcian/rjmobSummary.ts)) ovat valmiit, mutta kirjoittajaa ei ole tehty arvaamalla — luvut syntyvät Google Sheetsistä [rjmob.ts](src/lib/rjmob.ts):n sääntöjen läpi (sivukulukerroin, läpimeno, myyjäkohtaiset kertoimet, nimien normalisointi), ja väärä myyntiluku etusivulla on pahempi kuin puuttuva. Lisätään kun laskenta on verrattu tuottoseurannan omiin lukuihin.

Alla korjatut, jotta samaa ei ehdoteta uudelleen.

Korjattu 10.8.2026: `/api/webhook/register` oli middlewaressa auki eikä todentanut itse, joten kuka tahansa saattoi laukaista Drive watch -kanavan rekisteröinnin. Reitti todentaa nyt `authorizeCron`illa ([cron.ts](src/lib/arxcian/cron.ts)) eli `CRON_SECRET`illa tai kirjautuneella käyttäjällä, samaan tapaan kuin `/api/arxcian/cron`. Vercel Cron lähettää `CRON_SECRET`in `Authorization`-otsakkeessa automaattisesti, joten `vercel.json`in päivittäinen ajo toimii ennallaan. `/api/webhook/drive` todentaa edelleen itse `x-goog-channel-token`-otsakkeella. Middlewaren poikkeus on nyt eksplisiittinen lista kahdesta polusta (`/api/webhook/drive`, `/api/webhook/register`) eikä `/api/webhook/`-prefiksi, jottei uusi webhook-reitti aukea vahingossa.

Korjattu 10.8.2026: kirjautumisen yritysrajoitus ([api/login](src/app/api/login/route.ts)) tunnisti kutsujan `x-forwarded-for`-otsakkeesta, jonka vasemman arvon kutsuja voi väärentää ja saada joka yrityksellä uuden kiintiön. IP luetaan nyt `req.ip`:stä (varalla `x-real-ip`), jotka tulevat Vercelin proxyltä eivätkä ole asiakkaan asetettavissa.

Korjattu 10.8.2026: RJ-Mobin vanhat API-reitit (`/api/sheets`, `/api/targets`, `/api/receipts`, `/api/files`, `/api/rules`, `/api/shifts`) olivat middlewaressa auki ilman istuntoa. Nyt **kaikki** API-reitit vaativat istunnon lukuun ottamatta `isPublic()`-listaa [middleware.ts](src/middleware.ts):ssä.
