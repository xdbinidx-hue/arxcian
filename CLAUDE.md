# arxcian

Yksi Next.js-sovellus, kaksi brändiä:

- **arxcian** (aina pienellä) — pääbrändi ja koko sovelluksen kehys. Kaikki sivut ovat polussa `/arxcian/*`, API `/api/arxcian/*`.
- **RJ-Mob** — bisnesportaali, nykyään **yksi arxcianin osio** muiden rinnalla polussa `/arxcian/rj-mob/*` (tuotto, trendit, kassamyynti, etela, tavoitteet, runrate, laskuri, tyovuoro, tyovuorot). Ei enää erillinen sivusto.

Osiot arxcianin alla: RJ-Mob, Trading, Uutiset, Personal. Yksi määrittely: [nav.ts](src/lib/arxcian/nav.ts).

RJ-Mobin sivut saavat arxcianin tumman kehyksen (Shell), mutta niiden **data pysyy tarkoituksella valkoisena** — taulukot ja seurannat on tarkoitettu luettaviksi, ei tunnelmallisiksi. Valkoisen pinnan antaa [rj-mob/layout.tsx](src/app/arxcian/rj-mob/layout.tsx), osionavigaation jaettu [RjMobNav](src/components/rjmob/RjMobNav.tsx).

## Nimet: repo on arxcian, Vercel-projekti on rjmob-portal

Repo, GitHub-projekti ja paikallinen kansio ovat nimeltään **arxcian**
(ent. `rjmob-portal`). Vercelin projekti **ei ole**, eikä sitä nimetä
uudelleen:

| Mikä | Nimi |
|---|---|
| GitHub-repo | `xdbinidx-hue/arxcian` |
| paikallinen kansio | `~/Downloads/arxcian` |
| npm-paketti ([package.json](package.json)) | `arxcian` |
| **Vercel-projekti** | **`rjmob-portal`** |
| **tuotanto-osoite** | **`https://rjmob-portal.vercel.app`** |

**Ero on tahallinen, älä "siisti" sitä.** Vercel-projektin uudelleennimeäminen
katkaisisi GitHub-kytkennän josta deploy syntyy pushista, ja vaihtaisi samalla
`.vercel.app`-osoitteen — jolloin jokainen kovakoodattu tuotanto-URL osoittaisi
olemattomaan isäntään. Niitä on kaksi paikkaa, ja molemmissa on sama varoitus
kommenttina:

- [.github/workflows/arxcian-cron.yml](.github/workflows/arxcian-cron.yml) —
  päivittäiset cron-kutsut, jotka ovat ainoa ajastus (ks. Ulkoinen data)
- [api/webhook/register/route.ts](src/app/api/webhook/register/route.ts) —
  Drive watch -kanavan callback-osoite, joka on rekisteröity Googlelle tällä
  nimellä

`rjmob-portal` koodissa ei siis ole jäänne vanhasta nimestä vaan nykyinen
tuotanto-osoite. Jos nimi joskus halutaan vaihtaa, se on oma vaiheensa:
Vercelissä uudelleennimeäminen, molempien URL-kohtien päivitys ja Drive watch
-kanavan uudelleenrekisteröinti samalla kertaa.

## Mallin valinta

- **Opus 5** — isot arkkitehtuuripäätökset ja monimutkaiset ongelmat: auth- ja tietomallipäätökset, integraatiot joissa on kiertoteitä (Notion, Rumble, Forex Factory), suorituskyky- ja välimuististrategia, mitä tahansa mikä vaikuttaa useaan osioon kerralla.
- **Sonnet 5** — toistuva toteutustyö: komponentit, sivut, RSS-parsijat, rutiini-CRUD, tyylittely, testit.

**Muistuta käyttäjää vaihtamaan malli**, jos käytössä oleva malli ei vastaa tehtävän vaikeustasoa — molempiin suuntiin. Claude ei voi vaihtaa omaa malliaan kesken session; vaihto tehdään sovelluksen mallivalitsimesta.

## Työtapa

- Edetään vaihe kerrallaan. Committaa pieninä loogisina kokonaisuuksina jokaisen
  alavaiheen jälkeen, ei isoa kasaa kerralla.

**Valmis vaihe viedään tuotantoon itse. Portti on testit, ei Albinin vahvistus.**
Kun vaihe on valmis:

1. `npm run typecheck && npm run test && npm run build`
2. jos kaikki menee läpi: merge `main`iin ja `git push origin main`
3. poista mergetty haara: `git push origin --delete <haara>` ja `git branch -d <haara>`
4. **älä aja `vercel deploy` tai `vercel --prod`** — GitHub-integraatio deployaa
   pushista automaattisesti. Manuaalinen komento tekee toisen samanlaisen buildin
   turhaan.
5. kerro vasta sitten mitä tehtiin ja mitä kannattaa testata selaimessa

**Jos typecheck, testi tai build kaatuu: pysähdy.** Älä mergeä, älä pushaa mainiin.
Kerro mikä hajosi ja mitä se tarkoittaa.

**Kysy silti ennen kuin teet nämä** — automaatio ei koske näitä:
- uusi maksullinen palvelu tai iso riippuvuus
- mikä tahansa mitä ei saa peruttua: datan poisto, avaimen vaihto, tuotannon
  ympäristömuuttujan muutos, Drive-taulukkoon kirjoittaminen ensimmäistä kertaa
- arkkitehtuuripäätös joka koskee useaa osiota kerralla

- Jos datalähde ei ole luotettava (esim. Forex Factory), sano se suoraan — älä
  paikkaa hataralla ratkaisulla ilman lupaa.

**Jos vika näkyy lokissa mutta ei vastauksessa, se on bugi — ei kosmetiikkaa.**
Jokainen `"ok": true` jonka takana ei oikeasti tapahtunut mitään maksaa puoli
tuntia väärän asian korjaamista, ja väärä virheviesti maksaa saman: testi-push
kehotti sallimaan ilmoitukset silloin kun avaimet olivat väärin palvelimella.
Kun tulos niellään jotta muu työ ei kaadu — ja se on usein oikein — nieltyä
tulosta ei silti saa jättää kertomatta: laita se vastaukseen, laske se
epäonnistuneisiin, ja pidä eri asiat eri lukuina (kalenteririvit ja jonotetut
ilmoitukset eivät ole sama luku).

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
| `WATCH_SOURCES_SHEET_ID` | watchin lähdelistan taulukko (valinnainen — ilman sitä varalista) |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis -välimuisti |

**`GOOGLE_SERVICE_ACCOUNT_KEY` katkeaa paikallisesti joka kerta kun
`.env.local` vedetään Vercelistä.** Muuttuja itsessään on kunnossa kaikissa
kolmessa ympäristössä (korjattu 20.8.2026 `korjaa-dev-avain.sh`:lla), ja
tuotanto lukee sen suoraan prosessin ympäristöstä ilman välikäsiä. Vika on
`vercel env pull`issa: se kirjoittaa **jokaisen** arvon lainausmerkkeihin, ja
Next.js:n dotenv-lukija laajentaa lainausmerkkien sisällä olevat `\n`-escapet
oikeiksi rivinvaihdoiksi. Silloin `private_key`hyn tulee raakoja rivinvaihtoja
kesken JSON-merkkijonon ja `JSON.parse` kaatuu virheeseen *"Bad control
character in string literal at position 169"*.

Korjaus on poistaa **vain sen rivin** ympäröivät lainausmerkit `.env.local`ista
— ilman lainausmerkkejä dotenv ei laajenna mitään ja `\n` säilyy escapena,
jollaisena JSON sen itse purkaa. `korjaa-dev-avain.sh` tekee tämän nykyään
pullin jälkeen automaattisesti.

Kaksi ansaa jotka maksoivat tunnin 20.8.2026:

- **`\n`-escapeja ei saa korvata rivinvaihdoilla** — korvaus rikkoo avaimen.
  Tämä on eri asia kuin se mitä dotenv tekee vahingossa; suunta on sama, ja
  siksi korjaus on lainausmerkkien poisto eikä merkkijonon muokkaus.
- **Varmistus on tehtävä samalla tavalla kuin sovellus lukee.** Skriptin
  vanha varmistus riisui lainausmerkit itse ja tulosti `VARMISTUS OK`, vaikka
  sovellus kaatui samaan arvoon — juuri se `"ok": true` jonka takana ei
  tapahtunut mitään.

Huom. myös että worktreessä `.env.local` kannattaa olla **oikea tiedosto eikä
symlinkki**: Next.js:n tiedostovahti ei seuraa symlinkin kohdetta, joten
`Reload env` ei laukea eikä korjattu avain tule voimaan ilman uudelleen-
käynnistystä.

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
`tilannekatsaus_ohje` ja `maksukuitti_ohje`.

`rj-mob_myyjät` **ei ole Ohjeet-kansiossa** vaan kansiossa **Infopaketti**
(`1sj6Qg5NTgqv634gYBIZhta8ipdMzJrin`) — todettu 20.8.2026 palvelutilillä.
Ohjeet-kansiossa on kuusi tiedostoa, ei seitsemää.

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

Ajastetut haut: työt lisätään `JOBS`-rekisteriin [src/lib/arxcian/cron.ts](src/lib/arxcian/cron.ts):ssä, jolloin cron-reittiä ei tarvitse muuttaa.

**Ajastetun työn on pakotettava haku ja kerrottava mistä data tuli.** `fetchAndCache` palauttaa tuoreen välimuistin ilman verkkokutsua, joten ilman `force: true` -lippua cron on tyhjäkäyntiä: `hub-channels` raportoi `"ok": true, "items": 5` **51 millisekunnissa** tekemättä yhtään hakua (mitattu 19.8.2026). Työn tulokseen kuuluu siksi `source`, ja cron-reitti pudottaa työn `ok`-tilan kun se on `stale` — silloin haku kaatui ja luvut tulevat vanhasta välimuistista. Vanhentuneen datan palauttaminen on oikein, sen kertomatta jättäminen ei.

**Vanhentuneisuus kuuluu käyttöliittymään asti, ei vain lokiin.** [fetchStatus.ts](src/lib/arxcian/fetchStatus.ts) kirjoittaa avaimen `arxcian:status:<avain>` **jokaisella** ajolla, myös kaatuneella: `lastAttempt`, `lastSuccess`, `failed`, `ok`. Sitä tarvitaan koska välimuistin kirjekuori kirjoitetaan vain onnistuneesta hausta — epäonnistunut yritys ei jätä siitä jälkeä, ja `fetchedAt` jää osoittamaan viime viikon onnistumiseen. Hubin KANAVAT-paneeli näyttää hakuajan otsikkorivillä ja erillisen rivin kun viimeisin yritys epäonnistui. **Älä päättele vanhentuneisuutta datan iästä:** ajoväli on yön yli laillisesti 12 h (20:00 → 08:00), joten ikäraja joko hälyttää joka aamu turhaan tai ei huomaa menetettyä päivää. Reitti on `/api/arxcian/cron`, todennus `CRON_SECRET` tai kirjautunut käyttäjä (käsin käynnistys testatessa). `/api/arxcian/health` kertoo onko Redis tavoitettavissa.

**Ajastus ei ole Vercel Cronissa.** Projekti on Hobby-tasolla, joka sallii kaksi cronia kerran päivässä — `vercel.json`issa on jo yksi (`/api/webhook/register`). Uutisten neljä päivittäistä hakua ajetaan [.github/workflows/arxcian-cron.yml](.github/workflows/arxcian-cron.yml):stä, joka kutsuu samaa reittiä. Jos taso joskus nousee Prohon, ajastuksen voi siirtää `vercel.json`iin koodia muuttamatta.

Redis on Upstash-resurssi `upstash-kv-amethyst-river`, liitetty vakionimillä kaikkiin kolmeen ympäristöön. Paikallinen kehitys käyttää samaa kantaa — aja `vercel env pull .env.local --environment development` kun tunnukset vaihtuvat.

## Uuden sisällön seuranta (watch)

"Seuraa lähdelistaa ja tee jotain uusille" on sama tarve kolmessa osiossa: Tradingin YouTube-kanavat, Personalin self-growth-kanavat ja osittain Uutiset. Se on rakennettu **kerran** hakemistoon `src/lib/arxcian/watch/` samaan tapaan kuin `fetchAndCache` — osiot käyttävät sitä, eivät toteuta omaansa. Suunniteltu 13.8.2026, toteutettu 19.8.2026.

| Tiedosto | Vastuu |
|---|---|
| `types.ts` | jaetut tyypit |
| `sources.ts` | lähdelistan luku Drive-taulukosta + koodiin käännetty varalista |
| `feed.ts` | yksi normalisoitu syötteenhakija (YouTube-Atom, RSS2) |
| `seen.ts` | nähtyjen tunnisteiden rekisteri |
| `inbox.ts` | ilmoitusten ainoa kirjoituskohde |
| `watch.ts` | hae → erota uudet → aja listan toiminto |

**Taulukon id on `WATCH_SOURCES_SHEET_ID`, ja sen puuttuminen ei ole virhe.**
Ilman muuttujaa käytetään koodiin käännettyä varalistaa (hubin viisi kanavaa
+ Mark Moss, jaettuna trading/personal), jolloin watch toimii ennen kuin
taulukkoa on olemassa. Konfiguroimaton ja rikki ovat eri tiloja, ja vain
jälkimmäinen ansaitsee hälytyksen — rikki lähdelista heittää, ja `sourcesFrom`
kertoo kummasta on kyse.

**Ensimmäinen ajo ei tuota ilmoituksia.** Kun `watch:seen:<lista>` ei vielä
ole, koko syöte olisi määritelmällisesti uutta ja neljä kanavaa purskauttaisi
kuusikymmentä ilmoitusta kerralla. Silloin kaikki merkitään nähdyiksi ja
palautetaan tyhjä; uutuus alkaa seuraavasta ajosta. Sama koskee kadonnutta
avainta — se on erottamaton ensimmäisestä ajosta, ja hiljaisuus on oikea
vastaus kumpaankin.

**Kaikkien lähteiden kaatuessa ei merkitä mitään nähdyksi.** Muuten katkos
söisi uutuudet hiljaa: tunnisteita ei tullut, ja seuraava ajo pitäisi niitä
vanhoina. Osittainen kaatuminen merkitään normaalisti, koska saadut
tunnisteet ovat aitoja.

**Lähdelista on Drive-taulukossa, ei koodissa.** Palvelutilillä on jo `spreadsheets.readonly` RJ-Mobia varten, joten uutta tunnistautumista ei tarvita. Sarakkeet: `lista` (`trading` | `personal` | `uutiset`), `nimi`, `tyyppi` (`youtube` | `rss`), `tunniste` (kanava-ID tai syöte-URL), `toiminto` (`tiivista` | `ilmoita` | `ei mitään`), `omistaja` (`albin` | `arbnor` | `shared`), `aktiivinen`. Yksi taulukko kaikille osioille — `lista`-sarake on juuri se mikä tekee tästä yhden mekanismin eikä kolmea.

**Tyhjä lähdelista on virhe, ei tulos.** Jos taulukko katoaa, nimetään uudelleen tai sarakeotsikko kirjoitetaan väärin, haun on heitettävä — muuten watch näyttää "ei uutta sisältöä" ikuisesti sen sijaan että kertoisi olevansa rikki. Heitto vie `fetchAndCache`n vanhentuneeseen listaan, ja jos sitäkään ei ole, koodiin käännettyyn varalistaan. Sama päättely kuin [channels.ts](src/lib/arxcian/channels.ts):n `videos.length === 0` -heitossa.

**Nähtyjen rekisteri on eri avain kuin sisältövälimuisti.** `watch:seen:<lista>` on Redis-joukko jossa on vain tunnisteita, ja sen elinikä on pidempi kuin minkään sisältöavaimen. Uutuus ei saa johtua sisältövälimuistista: [fetchNews.ts](src/lib/arxcian/news/fetchNews.ts) päättelee sen nykyään 60 artikkelin listasta jolla on 5 h TTL, joten avaimen kadotessa kaikki näyttää uudelta. Tiivistyksessä se maksaa vain tokeneita, ilmoituksissa se olisi ilmoitusryöppy. `sadd` palauttaa lisättyjen määrän, joten erotus ja merkintä tapahtuvat yhdellä atomisella kutsulla.

**Uutuus ja ilmoitus ovat eri asioita.** `watch` kertoo mikä on uutta; mitä sille tehdään, on listan oma `toiminto`. ICT-videot pidetään vain tuoreina, self-growth-kanavat ilmoitetaan, uutiset tiivistetään. Ilmoitukset menevät yhteen `watch:inbox`-avaimeen eivätkä osiokohtaisiin, jotta hub näyttää yhden merkin. Inbox on omistajatietoinen ja suodatetaan `visibleTo()`llä palvelimella — Personalin kanavat ovat henkilökohtaisia.

**YouTube-haku yhteen paikkaan — tehty jo 19.8.2026.** Tämä kohta suunniteltiin `feed.ts`:lle, mutta kanavahaun korjaus toteutti sen ensin: [youtube.ts](src/lib/arxcian/youtube.ts) on nyt ainoa paikka jossa otsakkeet, uudelleenyritys ja aikakatkaisu elävät, ja kaikki kolme kutsujaa käyttävät sitä. Ennuste piti paikkansa — kiertotie oli kopioituna kahteen paikkaan ja YouTube rikkoi sen uudelleen. `feed.ts` rakentuu tämän päälle eikä korvaa sitä: se lisää RSS2-normalisoinnin, ei toista YouTube-hakua.

**Uutiset siirretään watchin päälle vasta erikseen, ei samalla kertaa.** `refreshCategory` toimii ja sisältää jo erotuksen, tiivistyksen ja yhdistämisen. Siirto varmistetaan vertaamalla tulostetta ennen ja jälkeen, kuten `rjmob-summary`-siirrossa.

**Ei PubSubHubbubia.** YouTube tukee WebSub-työntöä, mutta tilaukset vanhenevat muutamassa päivässä ja vaativat uusinnan, julkisen callback-reitin ja HMAC-tarkistuksen — eli toisen toimitustien joka voi kuolla hiljaa. Sisältö on "katso myöhemmin" -tavaraa, ei aikakriittistä, joten neljä cron-ajoa vuorokaudessa riittää. Reitti vaatisi lisäksi kolmannen poikkeuksen middlewaren julkiseen listaan, joka on tarkoituksella rajattu kahteen.

Yksi cron-työ per lista (`watch-trading`, `watch-personal`), jotta yhden listan kaatuminen ei vie muita — sama jako kuin uutisten kategoriatöissä.

## Ulkoiset riippuvuudet: päätökset 13.8.2026

Selvitys tehtiin ennen kuin osiot alkavat rakentaa näiden varaan.

| Lähde | Tila | Lyhyesti |
|---|---|---|
| YouTube-kanavat | 🟡 | Julkinen Atom-syöte, ei avainta eikä kiintiötä — mutta YouTube rajoittaa Vercelin konesali-IP:tä ajoittain (todettu 19.8.2026, ks. Hubin etusivu -osio). Uudelleenyritys hoitaa sen toistaiseksi. |
| ForexFactory-kalenteri | 🟡 | Epävirallinen JSON toimii, mutta vain viikko eteenpäin eikä toteutuneita lukuja. |
| Gmail | 🟡 | Sama OAuth-kuvio kuin kalenterissa, mutta restricted-scope — riski on käytäntö, ei tekniikka. |
| WhatsApp | 🟡 | Toimii vain erilliseen yritysnumeroon, ei omaan WhatsAppiin. |
| NotebookLM | 🔴 | Ei julkista API:a. Sama työ tehdään jo Anthropic-SDK:lla. |
| Memorae | 🔴 | Ei API:a, ei webhookeja. Ei mitään mihin integroida. |

### ForexFactory

ForexFactoryn oma sivu on Cloudflaren takana eikä sitä raavita. Kalenterin vientisyöte on kuitenkin avoinna Faireconomyllä: `https://nfs.faireconomy.media/ff_calendar_thisweek.json`. Varmistettu 13.8.2026 — HTTP 200, 74 tapahtumaa, ei avainta eikä tunnistautumista.

**Kentät ovat `title, country, date, impact, forecast, previous` — `actual` puuttuu**, ja `ff_calendar_lastweek.json` sekä `nextweek.json` vastaavat 404. Syöte kertoo siis mitä on tulossa tällä viikolla, ei mitä luvuksi tuli eikä mitään menneestä. "Torstaina 15:30 USD CPI, High, ennuste 2.9 %" onnistuu; toteutumien näyttäminen, historia tai backtestaus ei — ne vaatisivat maksullisen lähteen (Finnhub, FXStreet, Trading Economics). Älä lupaa niitä tämän syötteen varassa.

Syöte on dokumentoimaton eikä sillä ole palvelulupausta. Kulkee `fetchAndCache`n läpi pitkällä stale-ikkunalla, ja hakuaika näytetään käyttöliittymässä.

### Gmail

Teknisesti helppo: sama käyttäjäkohtainen OAuth kuin kalenterissa, ja [oauth.ts](src/lib/arxcian/personal/calendar/oauth.ts):n monen tilin rakenne kantaa sellaisenaan.

Riski on käytännöissä. Gmailin lukuscopet ovat Googlen **restricted**-luokkaa, tiukempi kuin `calendar.readonly`. Restricted-scope vaatii lähtökohtaisesti vuosittaisen CASA-tietoturva-arvioinnin (self-serve tier 2 noin 540–1000 $, käsittely 4–12 viikkoa). Googlen oma dokumentaatio antaa **henkilökohtaisen käytön poikkeuksen** ("only you or a few people you know"), johon kaksi käyttäjää mahtuu — hintana sama vahvistamattoman sovelluksen varoitusnäyttö ja 100 käyttäjän katto, jotka on jo hyväksytty kalenterin kohdalla.

Poikkeus on käytäntö, ei tekninen takuu, ja Gmail on tarkemmassa valvonnassa kuin Calendar. Lisäksi restricted-scopen lisääminen pakottaa **uuden suostumuksen jo liitetyille kalenteritileille**. Älä lupaa Gmailia mihinkään osioon ennen kuin suostumusnäyttö on kertaalleen viety läpi scopen kanssa.

### WhatsApp

Virallinen tie on WhatsApp Business Cloud API. Alusta itsessään on maksuton, hinnoittelu on ollut viestikohtainen 1.7.2025 alkaen ja 24 tunnin palveluikkunan sisällä vastaukset ovat ilmaisia — kahdelle käyttäjälle kustannus on käytännössä nolla, ja vahvistamattomankin numeron 250 aloitettua keskustelua vuorokaudessa riittää moninkertaisesti.

**Este ei ole hinta vaan malli.** Cloud API toimii erikseen varatulla yritysnumerolla, jota ei saa olla rekisteröitynä henkilökohtaiseen WhatsAppiin. Se ei siis lue eikä lähetä Albinin omasta WhatsAppista: "arxcian ilmoittaa WhatsAppiin" tarkoittaa, että perustetaan yritysnumero, jolle lähetetään viesti ja joka vastaa. Yrityksen aloittamat viestit vaativat lisäksi hyväksytyn mallipohjan.

Epäviralliset kirjastot (whatsapp-web.js, Baileys) ajavat kuluttajasovellusta, rikkovat käyttöehtoja ja johtavat oman numeron porttikieltoon. Ei käytetä.

Jos tavoite on "ilmoita puhelimeeni", Telegramin Bot API tekee saman ilmaiseksi, ilman yritystiliä, mallipohjia tai erillistä numeroa, ja voi lähettää suoraan omaan chattiin.

**Ilmoituskanavaksi valittiin 13.8.2026 pelkkä sovelluksen sisäinen `watch:inbox` ja merkki hubissa.** Ei ulospäin lähtevää kanavaa: ei uutta riippuvuutta, tiliä eikä ympäristömuuttujaa, ja `watch` pysyy testattavana ilman ulkoista palvelua. Ulkoinen kanava — Telegram, WhatsApp-yritysnumero tai Web Push — on myöhemmin oma erillinen lukijansa saman inboxin päällä, joten sen lisääminen ei muuta `watch`in omaa logiikkaa. **Älä siis kirjoita ilmoituksen lähetystä `watch.ts`:ään**, vaan pidä inbox ainoana kirjoituskohteena.

### NotebookLM

Kuluttaja-NotebookLM:llä ei ole julkista API:a. Yritystason Gemini Notebook -API on preview ja vain Enterprise-asiakkaille, erillinen Podcast-API on merkitty vanhentuneeksi eikä ota uusia asiakkaita, ja kolmansien osapuolten "NotebookLM API" -palvelut ovat epävirallisia välikäsiä.

Tärkeämpi huomio: **arxcian ei tarvitse sitä.** `ANTHROPIC_API_KEY`, [summarize.ts](src/lib/arxcian/news/summarize.ts):n JSON-skeemavastaukset, nimetyt mallivakiot ja pyyntörajoitin ovat jo paikallaan, ja tiivistys tehdään niillä paremmin kuin ulkoisen tuotteen kautta. NotebookLM:n oma anti on käyttöliittymä ja audio overview; jos varsinainen halu on "viikon kooste kuunneltavana", se on TTS-tehtävä olemassa olevan [tts.ts](src/lib/arxcian/tts.ts):n päälle, ei uusi riippuvuus.

### Memorae

Kuluttajatuote WhatsAppin päällä. Ei julkista API:a, ei kehittäjädokumentaatiota, ei webhookeja eikä Zapier/Make/n8n-integraatioita (tarkistettu memorae.ai 13.8.2026). Ei siis mitään mihin integroida, ja toiminnallisuus — muistutukset, listat, kalenteri — on päällekkäinen sen kanssa mitä Personal ja Google Calendar jo tekevät. Jos vetovoima on "juttelen avustajalle puhelimen chatista", se on sama ilmoituskanavapäätös kuin WhatsAppin kohdalla, osoitettuna arxcianin omaan avustajaan.

### Käyttöönottojärjestys

1. **Watch-mekanismi** ja Drive-lähdelista. Ei uusia riippuvuuksia eikä tilejä, ja avaa Tradingin ja Personalin kanavaseurannan yhdellä kertaa. Yhdistetty YouTube-haku kuului alun perin tähän, mutta se on jo tehty ([youtube.ts](src/lib/arxcian/youtube.ts), 19.8.2026) — kolmen kopion ongelmaa ei siis enää ole ratkaistavana.
2. **ForexFactoryn viikkokalenteri** `fetchAndCache`n läpi, merkittynä epäviralliseksi.
3. **Gmail-OAuth** vasta kun suostumusnäyttö on testattu restricted-scopella.

Kohdat 1–2 eivät vaadi käyttäjältä mitään, joten ne eivät saa jäädä odottamaan kohtaa 3. Ilmoituskanava ei ole jonossa: sovelluksen sisäinen inbox syntyy kohdan 1 mukana, ja ulkoinen kanava on oma päätöksensä sitten kun sellaista halutaan. NotebookLM ja Memorae eivät ole jonossa lainkaan.

## Personalin listat: yksi avain, atominen kirjoitus

Tavoitteet, rutiinit, muistiinpanot ja tehtävät ovat kukin yhdessä avaimessa
(`personal:goals`, `:habits`, `:notes`, `:todos`), ja avain on **jaettu
molemmille käyttäjille** — `shared`-omistajuus tekee jakamisesta
mahdottoman, toisin kuin kalenterin tileillä.

Kirjoitus oli 23.8.2026 asti luku-muokkaa-kirjoita ilman lukkoa, joten kaksi
yhtaikaista kirjoitusta hukkasi toisen hiljaa: Albinin lisäämä tehtävä katosi
jos Arbnor merkitsi samalla hetkellä tavoitteen tehdyksi. Sama vaara on
kirjattu kalenterin tokeneille, ja siellä se ratkaistiin jakamalla avain.

**Ratkaisu on versionumero ja ehdollinen kirjoitus, ei uusi tietomuoto.**
[ownedStore.ts](src/lib/arxcian/personal/ownedStore.ts) pitää
lue–muokkaa–kirjoita-silmukan ja uudelleenyrityksen,
[ownedStoreKv.ts](src/lib/arxcian/personal/ownedStoreKv.ts) tekee ehdollisen
kirjoituksen Lua-skriptinä (`EVAL`, versio sivuavaimessa `<avain>:v`).
Tallennettu muoto (`{ data, fetchedAt }`) ja avain säilyivät ennallaan, joten
**migraatiota ei tarvittu**: puuttuva versioavain tarkoittaa versiota 0, ja
ensimmäinen kirjoitus luo sen siinä sivussa.

Redis-hash olisi poistanut koko kuvion, mutta hinta olisi ollut
kertaluonteinen migraatio neljälle listalle joissa on käyttäjien omaa dataa.
Kilpailun todennäköisyys on kahdella käyttäjällä pieni; migraatiobugin hinta
ei ole. **Älä siis vaihda tallennusmuotoa ilman erillistä syytä.**

**Omistajuustarkistus kuuluu mutaation sisään.** `canView` tarkistettiin
aiemmin vanhentuneesta luvusta ja kirjoitus tehtiin sen perusteella. Nyt
takaisinkutsu ajetaan joka yrityksellä sitä listaa vasten jota vasten
kirjoitus oikeasti tehdään.

**Takaisinkutsu voi ajautua useamman kerran — älä laita sinne sivuvaikutuksia.**
`promoteNoteToGoal` on tästä esimerkki: tavoitteen id arvotaan etukäteen ja
muistiinpano varataan sillä ensin, ja tavoite luodaan vasta varauksen
onnistuttua. Luonti takaisinkutsun sisällä tekisi kahden tavoitteen
kaksoiskappaleen yhdestä muistiinpanosta heti kun kirjoitus törmää kerran.

Kolme yritystä riittää (kirjoittajia on kaksi). Jos kaikki törmäävät,
palautetaan viimeisin luettu tila eikä kirjoiteta väkisin — hiljainen
ylikirjoitus on juuri se vika jota tämä estää. `ownedStore.test.mts` väärentää
kilpailevan kirjoittajan ja kaatuu jos versiotarkistus poistetaan.

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

**YouTube rajoittaa Vercelin konesali-IP:tä, eivätkä otsakkeet korjaa sitä.** Kaikki YouTube-haut kulkevat nyt yhden hakijan kautta: [youtube.ts](src/lib/arxcian/youtube.ts), jota käyttävät [channels.ts](src/lib/arxcian/channels.ts), [ict.ts](src/lib/arxcian/trading/ict.ts) ja uutisten Mark Moss -lähde [rss.ts](src/lib/arxcian/news/rss.ts):n kautta.

11.8.2026 pääteltiin että vika oli bottimaisessa User-Agentissa, ja selainmaiset otsakkeet lisättiin. **Päätelmä oli väärä** — vika jatkui vielä kahdeksan päivää. Selvitys 19.8.2026: kaikki kuusi YouTube-ID:tä (viisi `CHANNELS`-listalta + Mark Moss) vastasivat `HTTP 200` kotiverkosta *ilmankin* otsakkeita, samana päivänä kun tuotanto lokitti niille `HTTP 404` ja `HTTP 500`. Klo 08:00 ajo kaatui kokonaan ja klo 20:00 ajo haki kaikki viisi kanavaa. Muuttuja on siis lähettävä IP, ei otsake eikä kanava. Otsakkeet ovat yhä tallella (`CONSENT`-eväste on aidosti tarpeen), mutta ne eivät ole korjaus.

**Korjaus on uudelleenyritys:** kolme yritystä kasvavalla viiveellä ja hajonnalla. Uusittaviin koodeihin kuuluu **404**, koska se on tässä YouTuben botinestovastaus eikä "kanavaa ei ole". Siksi yhdestäkään 404:stä ei saa päätellä että kanava kannattaa poistaa `CHANNELS`-listalta.

**Lokissa erotetaan kolme tilaa, eikä erotin ole statuskoodi vaan saman ajon muiden kanavien tulos.** Jos yksikään kanava ei onnistunut, vika on hakuyhteydessä (`haku rikki`) ja kanavakohtaisia laskureita ei kosketa — muuten kolmen vuorokauden katkos merkitsisi kaikki kanavat poistuneiksi. Jos osa onnistui, kaatunut kanava saa oman laskurinsa (`arxcian:youtube:fail:<id>`), ja vasta 12 perättäisen ajon jälkeen (≈ 3 vrk) loki sanoo `lähde poissa`. Yhtään kanavaa ei poistettu 19.8.2026, koska yksikään ei ollut poissa.

Jos esto muuttuu pysyväksi, uudelleenyritys ei riitä. Seuraava askel olisi silloin YouTube Data API v3 (`playlistItems.list` maksaa 1 yksikön, ~24 yksikköä/vrk kun katto on 10 000) tai haun siirto GitHub Actionsiin. Kumpikin vaatii oman päätöksensä: API-avain on uusi riippuvuus ja ympäristömuuttuja. **Odota mittausdataa ennen kuin lisäät sen** — nyt loki kertoo kuinka usein esto oikeasti osuu.

RJ-Mobin kuukausiluvut: [rjmobSummary.ts](src/lib/arxcian/rjmobSummary.ts), cron-työ `rjmob-summary`. Laskenta on jaettu kirjastoihin ([rjmobSheets.ts](src/lib/rjmobSheets.ts), [rjmobDrive.ts](src/lib/rjmobDrive.ts)) juuri siksi että ajastettu työ pääsee siihen ilman istuntoa — `/api/sheets` ja `/api/files` ovat enää ohuita kuoria. **Kuukausi valitaan samalla `vuosi × 100 + kuukausi` -säännöllä kuin tuottoseurannan sivulla**, ja kentät ovat ne joita sivu itse näyttää (`liittKpl`, `kassa`, `fsecKpl`); muuten hubin luku voisi ajautua eri suuntaan kuin se luku jota sivulla katsotaan.

Muutosprosentti on **run rate -ennuste, ei toteuma**: hub näyttää aina kuluvaa kuukautta, joten kertymän vertaaminen edellisen kuun kokonaislukuun näyttäisi romahdusta vaikka myynti kävisi normaalisti. Kertymä projisoidaan kuukauden loppuun ja vertailu tehdään sillä. Ennustetta ei näytetä ennen kuin kuukaudesta on kulunut seitsemän päivää — sitä ennen kerroin on niin suuri (1. päivänä ×31) että yksi päivä heiluttaa prosenttia satoja yksiköitä.

### Rukousajat ja aurinko: kaksi ansaa jotka näkyvät vain osan vuodesta

**Isha on kesällä pienin luku, ei suurin.** Helsingissä on pakko käyttää
korkean leveysasteen sääntöä (`latitudeAdjustmentMethod=3`), koska
touko–heinäkuussa aurinko ei laske 18 asteen taakse eikä Fajrilla ja Ishalla
ole laskennallista hetkeä. Sivuvaikutus: Angle Based vie Ishan keskiyön yli —
21.6.2026 Maghrib 22:50 mutta **Isha 00:16**. Suora `minutes > nowMinutes`
-vertailu ei löydä sitä lainkaan, jolloin paneeli väittää klo 23 että päivän
rukoukset ovat ohi. Vika oli tuotannossa noin 25.5.–28.7. eli kahtena
kuukautena vuodesta. **Lajittelu ei korjaa tätä** — Ishan arvo 16 on aidosti
pienempi kuin Fajrin 143, joten `nextPrayer` tunnistaa tilanteen ehdosta
`Isha < Maghrib` ([prayerLogic.ts](src/lib/arxcian/prayerLogic.ts)).
`prayerLogic.test.mts` kaatuu jos ehto poistetaan.

Aamuyön ikkunassa (00:00–00:16) näytetään tämän päivän rivin Isha, vaikka kyse
on tarkkaan ottaen eilisen rivin Ishasta. Ajat siirtyvät tuona vuodenaikana
alle minuutin vuorokaudessa, ja vaihtoehtona olisi kolmas hakukutsu
kuudentoista minuutin takia.

**Menetelmä on osa vastausta, ei tekninen yksityiskohta.** `method=3` (Muslim
World League) ja Angle Based -korkeussääntö määräävät Fajrin ja Ishan
kokonaan, ja kesällä ne **johdetaan säännöstä** eikä todellisesta 18 asteen
kulmasta. Menetelmän vaihto muuttaa näytettyjä aikoja — älä vaihda ilman
pyyntöä.

**Open-Meteon leimat ovat vyöhykemerkinnätöntä paikallista aikaa**
(`"2026-08-20T09:00"`), joten `new Date()` tulkitsee ne palvelimen
vyöhykkeellä ja Vercelin UTC-ympäristössä kolme tuntia väärin.
`sunClock` kiertää tämän lukemalla kellonajan merkkijonosta; tuntiennusteen
suodatin ei kiertänyt, jolloin "seuraavat 24 h" alkoi kesällä kolme tuntia
menneisyydestä. **Virhe ei näy paikallisessa kehityksessä** (Macin vyöhyke on
Europe/Helsinki) **eikä esityksessä** (`toLocaleTimeString` tekee saman
virheen toiseen suuntaan) — vain tuntien valinta oli väärä. Vertailu tehdään
nyt merkkijonona `nowLocalISOHelsinki`ä ([time.ts](src/lib/arxcian/time.ts))
vasten: ISO-muotoiset paikallisajat ovat merkkijonoina samassa järjestyksessä
kuin ajallisesti.

**`pickSunDay` hyväksyy vain täsmäosuman.** Aiempi varahaara palautti
ensimmäisen tulevan päivän, jolloin vanhentunut välimuisti olisi näyttänyt
huomisen nousun ja laskun tämän päivän lukuina ilman mitään merkkiä siitä.
Tyhjä lohko on rehellisempi kuin väärän päivän kellonaika.

### Paneelit kertovat hakuaikansa, ja napista ajaa haun heti

Päätös 20.8.2026. Hubin luvut tulevat välimuistista jonka cron pitää
lämpimänä — neljä ajoa vuorokaudessa (8, 12, 16, 20), eli **enimmillään neljän
tunnin viive**, yön yli 12 h. Se on oikea suunnittelu, mutta paneeli ei
kertonut siitä mitään: 19.8.2026 klo 21:23 päivitetty myyntiseurantataulukko
näkyi hubissa vanhoina lukuina, ja vian etsimiseen meni tunti. Sama periaate
kuin kanavahaussa: **jos näytetty data ei ole tuoretta, sen on näyttävä
käyttöliittymässä asti, ei vain lokissa.**

Hakuaika ja virkistysnappi ovat jaetussa
[Panel.tsx](src/components/arxcian/Panel.tsx):ssä yhtenä `refresh`-proppina,
eivät kuudessa erillisessä toteutuksessa. Tila kootaan
[panelStatus.ts](src/lib/arxcian/panelStatus.ts):llä ja nappi ajaa
`/api/arxcian/cron?job=<id>`.

| Paneeli | Cron-työ | Aikaleiman lähde |
|---|---|---|
| RJ-MOB | `rjmob-summary` | `rjmob:summary` |
| KANAVAT | `hub-channels` | `hub:channels` |
| SÄÄ & AURINKO | `hub-weather` | `weather:current` |
| RUKOUSAJAT | `hub-prayer` | `hub:prayer-times` |
| MARKKINAT | `trading-quotes` | `trading:quotes` |
| UUTTA (watch) | `watch-trading` + `watch-personal` | molempien tilat yhdistettynä |

### Hubin TO-DO on tehtävälista, ei tavoitelista

Päätös 20.8.2026. Paneeli
([TodoPanel.tsx](src/components/arxcian/hub/TodoPanel.tsx)) näytti 11.8.
alkaen **kesken olevia tavoitteita**, ja sen oma kommentti perusteli miksi:
toinen rinnakkainen lista tarkoittaisi omaa tallennustaan ja kahta paikkaa
jossa sama asia voi olla kesken. Perustelu oli oikea silloin kun tavoitteet
olivat ainoa lista.

Seuraavana päivänä rakennettiin oikea päivätehtävälista
([todos.ts](src/lib/arxcian/personal/todos.ts)) päivineen ja muistutuksineen,
eikä paneelia päivitetty. Lopputulos oli pahempi kuin se mitä perustelu esti:
kaksi listaa oli olemassa joka tapauksessa, ja etusivu näytti niistä sen jonka
otsikko ei ollut "Tehtävät". **Älä siis palauta tavoitteita tähän paneeliin** —
ne ovat etusivulla omina lukuinaan TÄNÄÄN- ja tavoitepaneeleissa.

Rivit ovat linkkejä eivätkä valintaruutuja: valmiiksi merkitseminen kuuluu
sinne missä tehtävä elää, eikä hub saa olla toinen kirjoituspiste samaan
dataan. Päivä luetaan `todayISOHelsinki()`llä, koska paneeli renderöidään
palvelimella eikä selaimen paikallista päivää ole saatavilla — sama valinta
kuin TÄNÄÄN-paneelissa, ks. `Todo.date`n kommentti
[types.ts](src/lib/arxcian/personal/types.ts):ssä.

**Muistutus on sivun oma ajastin, ei push.** Se soi vain kun arxcian on auki
selaimessa, ja käyttöliittymä sanoo sen itse — muuten klo 9:00 asetettu
muistutus näyttäisi lupaukselta joka ei pidä suljetulla sovelluksella.
Ilmoitus annetaan `registration.showNotification`illa eikä
`new Notification()`illa, koska jälkimmäinen heittää iOS:n kotiruutu-PWA:ssa
`Illegal constructor`in vaikka lupa on myönnetty. Kun push-kanava on
korjattu, tehtävämuistutukset ovat oma lukijansa saman
kuljetuksen päällä — älä kirjoita lähetystä TodoListiin.

**Ilman nappia jäävät TÄNÄÄN, TO-DO, KALENTERI, ISTUNNOT ja PIKATOIMINNOT** —
niiden data ei tule ajastetusta hausta. Kalenteri on näistä se joka näyttää
puutteelta muttei ole: tapahtumat haetaan käyttäjän omalla OAuth-tokenilla
pyynnön yhteydessä, eikä cronilla ole istuntoa. **Älä keksi paneelille
cron-työtä jota ei ole.**

**Vanhentuneisuus on mitattua, ei datan iästä pääteltyä.** Aikaleima ja
punainen ⚠ tulevat [fetchStatus.ts](src/lib/arxcian/fetchStatus.ts):n
avaimesta, joka kirjoitetaan jokaisella ajolla myös kaatuneella. `hub-weather`,
`hub-prayer`, `trading-quotes` ja `rjmob-summary` eivät kirjoittaneet sitä
aiemmin lainkaan; `cron.ts`:n `kirjaaYritys` hoitaa sen nyt niiden osalta.
`hub-channels`, `watch-*`, `news-*` ja `trading-ict` kirjoittavat oman,
lähdekohtaisen tilansa kirjastoissaan eivätkä kulje sen läpi.

**`soloOnly`-työt on rajattu ulos käyttöliittymästä.** Nappi kutsuu cron-reittiä
kirjautuneen käyttäjän oikeuksilla, ja `winpos-import` kirjoittaa elävään
Google Sheets -taulukkoon tyhjentäen Kassamyynti-alueen ennen kirjoitusta.
Cron-reitti vastaa siksi **403:lla jokaiseen `soloOnly`-työhön kun
`authorizeCron` tunnisti kutsujan istunnosta**
([cronAccess.ts](src/lib/arxcian/cronAccess.ts):n `soloOnlyEstetyt`). Esto on
palvelimella eikä komponentissa, koska osoiterivi ei kysy komponentilta lupaa.
`CRON_SECRET` pääsee edelleen läpi — GitHub-workflow ajaa tuonnin omana
vaiheenaan. `cronAccess.test.mts` vartioi ettei yksikään napin työ-id ole
`soloOnly` eikä osoita olemattomaan työhön.

Rajaus koskee **cron-reittiä**, ei kaikkea tuontia: `/api/winpos/import` on oma
reittinsä, se ei tunne `soloOnly`ta ja on yhä ajettavissa istunnolla. Se on
Winpos-sivun oma toiminto eikä muuttunut tässä — mutta älä lue yllä olevasta
että tuonti olisi kokonaan pois selaimen ulottuvilta.

Nappi on jäähyllä 20 s ajon jälkeen ja estetty ajon aikana: työt hakevat
ulkoisista rajapinnoista eikä niitä ole tarkoitettu ajettavaksi kymmentä kertaa
minuutissa. Epäonnistunut ajo näytetään paneelissa omana viestinään, ja
`source: 'stale'` erotellaan kovasta virheestä — eri vika, eri korjaus.

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

### Teho lasketaan komponenteista, ei lueta taulukon Teho €/h -sarakkeesta

Päätös 19.8.2026. Teho on `liittymä + kassakate + F-Secure-provisio / tunnit`,
ja bonukset (F-Secure-bonus, DNA-uusmyynti) jätetään pois: ne ovat
portaittaisia kertasuorituksia joita ei ansaita tunnissa. Näin ohje sanoo.

Taulukossa on oma `Teho €/h` -sarake (= `Provikka / tunnit`), **eikä se täsmää
tähän**: Holma elokuussa 2026 taulukko 16,42, liittymä+kassaprovisio 15,40,
liittymä+kate 13,83. Provikka sisältää enemmän kuin nuo kolme komponenttia.
Sarakkeen lukeminen näyttäisi saman luvun kuin taulukko, mutta se olisi eri
suure kuin se jonka ohje määrittelee. Ohje voittaa — se on se jonka Albin
päivittää.

**Krenarilla on kaksi asteikkoa, ja ne ovat molemmat oikein.** Tuottoseuranta
käyttää hänen nelinkertaista sopimusprovisiotaan (`KRENAR_SELLER_MULT`), koska
se mittaa mitä myyjälle todella maksetaan. Myyntiseuranta käyttää
liittymäprovisiota sellaisenaan (×1) **kuten kaikilla muillakin**, koska se
vertaa myyntisuoritusta myyjien kesken eikä kerroin saa tehdä hänestä
nelinkertaista ilman että hän on myynyt euroakaan enempää. Elokuussa 2026:
36,80 €/h tuottoseurannan asteikolla, 9,20 €/h myyntiseurannan asteikolla.
Muilla sarjat ovat numeerisesti identtiset. Kentät ovat `tehoLiitt`/`teho`/
`tehoTotal` ja `myyntiTehoLiitt`/`myyntiTeho`/`myyntiTehoTotal`
([rjmob.ts](src/lib/rjmob.ts)).

F-Secure-leikkuri **vaikuttaa tehoon**: luvut lasketaan leikatuista
provisioista (`jaljelle`-kerroin), samoin kuin palkka ja kate.

Haara **`rj-mob-palautus`** ehdotti päinvastaista mallia — teho luettuna
taulukon sarakkeesta (`tehoTaulukko: parseNum(row[idxTehoMyyja])`), leikkuri
ohitettuna. **Sitä ei mergetä.** Haara on tallella mittauslukujensa takia, ei
toteutettavana suunnitelmana.

Tämä kohta luki 23.8.2026 asti haaran nimenä `claude/rj-mob-osio-8b7572`, jota
ei ole olemassa. Varoitus osoitti siis haamuun samalla kun kielletyn mallin
toteuttava haara istui repossa nimeämättömänä — eli juuri siinä muodossa jossa
seuraava lukija mergeää sen, koska mikään ei kerro että tämä on se haara.
**Jos haara joskus nimetään uudelleen, päivitä nimi tähän samalla.**

**Liittymäteholla on oma statusraja 8,5 €/h, muilla 9 €/h.** Päätös 19.8.2026.
Liittymäteho on kolmesta luvusta aina pienin — pelkkä liittymäprovisio ilman
kassakatetta ja F-Securea — joten yhteinen 9 €/h väritti sen punaiseksi myös
silloin kun liittymämyynti oli kunnossa. Heikon raja on 7 €/h kaikilla.
**Älä yhdenmukaista rajoja**: eri asteikko on koko pointti, samoin kuin
kassakatteen ×10/÷10 eri suuntiin. Rajat ja `tehoTaso()` ovat yhdessä paikassa
([rjmob.ts](src/lib/rjmob.ts)); `rjmobTeho.test.mts` kaatuu jos ne muuttuvat.

**Jokainen kolmesta luvusta väritetään omalla arvollaan.** Laajempi luku on
väistämättä vähintään kapeamman suuruinen, joten yhden yhteisen tilan käyttö
näyttäisi total-tehon 11,20 €/h keltaisena siksi että liittymä+kassa on 8,40 —
sama vika kuin liittymän rajassa, vain toiseen suuntaan. Ratkaiseva on silti
keskimmäinen: siitä tulevat `tehoStatus`, Tila-sarake ja järjestys, ja vain se
saa korostetun taustan.

Teholuvun tekstiväri on **aina** tumma (`#A32D2D` / `#854F0B` / `#3B6D11`),
myös korostetussa solussa. Yhteenvedon `VARIT`-täyttöpaletti ei kelpaa
teholukuun: `#eab308` jää 1,8:1 kontrastiin oman `#fef9c3`-taustansa päällä eli
täyttö heikentää sitä, ja "rajalla" on juuri se tila johon suurin osa myyjistä
osuu. Korostus tulee taustasta, ei tekstin sävystä.

**Maapallon mantereet ovat yhtä sinistä sävyä** ([GlobeScene.tsx](src/components/arxcian/globe/GlobeScene.tsx)): päivätekstuurista otetaan vain kirkkaus, ei väriä. Kaupunkivalot luetaan omasta tekstuuristaan eikä niihin kosketa, joten ne pysyvät keltaisina — se kontrasti tekee yöpuolen luettavaksi. Merillä on oma tumma sävynsä; aiemmin niissä näkyi suoraan taustan sumutekstuuri, jolloin pallo oli reikä taustaan eikä kappale.

**Maapallolle ei lisätä uutispisteitä.** RSS-artikkeleissa ei ole sijaintikenttää, joten punaiset tapahtumamerkit vaatisivat pääteltyä sijaintia. Sama päätös kuin Intel/Network/Travel-kerrosten kohdalla.

## Työvuorolista

Kuukauden kierto on: Albin täyttää tapahtumat Drive-taulukkoon → Generoi →
korjaa käsin → Vahvista → taulukko päivittyy. Kuukauden vaihtuminen **ei vaadi
koodimuutosta** — tapahtumat, onnenpäivät ja poissaolot luetaan taulukosta.

| Tiedosto | Vastuu |
|---|---|
| [tyovuoroExcel.ts](src/lib/shifts/tyovuoroExcel.ts) | Taulukon rakenne ja jäsennys — **puhdas**, ei Drive-yhteyttä |
| [shiftSchedule.ts](src/lib/shiftSchedule.ts) | Vuorosäännöt ja generointi — **puhdas** |
| [tyovuoroKirjoitus.ts](src/lib/shifts/tyovuoroKirjoitus.ts) | Kirjoitussuunnitelma — **puhdas** |
| [tyovuoroDrive.ts](src/lib/shifts/tyovuoroDrive.ts) | Luku Drivestä, readonly-scope |
| [tyovuoroDriveKirjoitus.ts](src/lib/shifts/tyovuoroDriveKirjoitus.ts) | Kirjoitus Driveen, ainoa kirjoitusoikeus |
| [shiftStore.ts](src/lib/shifts/shiftStore.ts) | KV-avaimet ja migraatio |

Drive-kansio: `1TQbm2sYst8Bz_Z1WoZm0lEasM6fTrTKT`, tiedostonimi "Työvuorot 9.
Syyskuu 2026", **natiivi Google Sheets** (todettu kuiva-ajolla 19.8.2026), yksi
välilehti `Taulukko1`. Kuukausi tunnistetaan `monthOrder`illa eli samalla
`vuosi × 100 + kuukausi` -säännöllä kuin tuottoseurannassa.

**Luonnos ja vahvistettu lista ovat eri avaimissa.** Aiemmin oli vain
`shifts:<YYYY-MM>`, johon Generoi kirjoitti suoraan — jolloin uudelleengenerointi
tuhosi käsin tehdyt korjaukset. Nyt `shifts:draft:*` on generoinnin ainoa kohde
ja `shifts:final:*` ainoa totuus. Vanha avain luetaan yhä finalin varalähteenä
eikä sitä poisteta.

**Kirjoitus on yksi `updateCells` alueeseen B4:AH33** (31 päivän kuukaudessa
AH34). Suorakaide on turvaominaisuus eikä optimointi: sarakkeisiin A (Pvm), AR
(Tapahtumat) ja AU (Toiveet) tai riville 35 (tuntisummakaavat) ei voi osua edes
bugin sattuessa, ja kenttämaski tyhjentää vanhat jäänteet samalla kertaa.
Väritetään **vain myymäläsarake**; vuoro- ja tuntisarake jäävät valkoisiksi.

**Sarake AU luetaan tarkoituksella ohi.** Siinä on toiveiden lisäksi
viikkorutiini- ja onnenpäivälegenda, eli vapaata tekstiä jossa esiintyy
myymälöiden nimiä ja sana "OP" — automaattinen luku tekisi siitä valheellisia
onnenpäiviä.

**Poissaolomerkinnät kirjoitetaan takaisin.** Kirjoitusalue on täsmälleen sama
jossa Albinin omat merkinnät ("Nizza", "loma") ovat, joten pelkkä tyhjennys söisi
ne eikä seuraava generointi enää löytäisi poissaoloja lainkaan.

**31 päivän kuukausi ulottuu riville 34.** Toimeksiannon "rivit 4–33" mitattiin
syyskuun tiedostosta, jossa on 30 päivää. Päivärivit johdetaan kuukauden
pituudesta. Ennen ensimmäistä 31 päivän kuukautta on tarkistettava ulottuuko
`SUM(C4:C33)` riville 34 — se korjataan taulukossa, ei koodissa.

### Säännöt tulevat referenssilistasta, eivät koodista taaksepäin

Syyskuun 2026 lista tehtiin Coworkissa käsin, ja generaattori portattiin
siitä. **Alkuperäinen referenssi (1 184 h) on vanhentunut**: Albin muutti
sääntöjä 19.8.2026 (lauantain miehitys 7 → 4 vuoroa, Antti vain Kivistöön,
Malmi tasan kokoaikaisten kesken). Testi pitää nyt kirjaa **nykyisten sääntöjen
tuottamasta tilannekuvasta**: Alec 156 · Joona 155 · Arbnor 131 · Lauri 117 ·
Krenar 115 · Kasperi 104 · Hamza 95 · Vladimir 94 · Ramin 78 · Antti 70 ·
Albin 4 = 1 119 h, ei yhtään vajetta.

Suhtautuminen testiin ei muutu: jos muutat logiikkaa ja luvut muuttuvat,
**oletus on että muutos on väärä**. Päivitä odotukset vasta kun olet lukenut
uuden listan läpi ja todennut sen paremmaksi — ei koskaan siksi että testi on
punainen.

Neljä sääntöä syntyi oikeista virheistä eivätkä ole tyylikysymyksiä:

1. **Lauantai täytetään viikon sisällä ensin**, vasta sitten ma–pe. Muuten
   kokoaikaisten viisi viikkovuoroa kuluvat arkeen eikä lauantaille jää ketään.
2. **Arkipäivä täytetään kerroksittain** myymälöiden yli (kaikkien ensimmäiset
   vuorot, sitten toiset). Myymälä kerrallaan kaataa koko vajeen viimeisen
   myymälän niskaan.
3. **Valinta kertyneiden tuntien mukaan.** Ilman tätä ero kokoaikaisten välillä
   kasvoi 44 tuntiin kuukaudessa.
4. **Päällikölle pisin *vapaa* vuoro.** Keskiviikkoisin kolme päällikköä jakaa
   Malmin kolme paikkaa, ja pelkkä "pisin" pudotti kolmannen kokonaan pois.

**Malmi jaetaan tasan kokoaikaisten kesken.** Malmi on paras myyntipaikka, joten
sen jakautuminen on oma tavoitteensa eikä tuntitasauksen sivutuote: viikkoankkurit
annetaan sille jolla on vähiten Malmia takanaan, ja Malmin paikkausvuoro menee
samalla perusteella. Aiempi kiinteä +2-kierto jakoi Malmin tasan vasta viidessä
viikossa eikä lainkaan tasan kuukauden sisällä. Arbnor on Malmin päällikkö eli
siellä joka tapauksessa; Ramin ja Antti ovat osa-aikaisia eivätkä kuulu jakoon.

**Antti tekee vain Kivistöä, ja saa sen ennen kokoaikaisia.** Myymälärajaus on
varajärjestyksessä eikä toiveena — muuten hän päätyisi Malmille aina kun vaje
sattuu sinne. Etuoikeus on yhtä tärkeä: ilman sitä kokoaikaiset ehtivät täyttää
Kivistön kaikki 48 kuukausivuoroa ja Antti jää **nollaan tuntiin**, jolloin
Albin tekee tunteja samaan aikaan kun Antti ei tee yhtään.

**Albin on hätävara, ei osa miehitystä.** Hänen tuntinsa ovat oire: jos ne
nousevat, joku muu on jäänyt ilman vuoroja. Syyskuussa hän saa 4 h eli yhden
vuoron, ja testi vartioi ettei luku karkaa. Vajeen paikkausjärjestys on siis
**Antti (vain Kivistö) → Albin**, ei toisin päin.

Antin etuoikeus ja viikkokatto ovat sama luku (3) tarkoituksella: pienempi
etuoikeus kokeiltiin ja se jätti syyskuuhun kaksi vajetta (18.9. ja 25.9.
Malmi 3/4) sekä kolminkertaisti Albinin tunnit.

Keskiviikon sääntö (**kaikki kolme päällikköä Malmilla**) on ehdoton, ei toive.
Onnenpäivänä kyseiseen myymälään merkitään vain päällikkö, mutta **muut myymälät
toimivat normaalisti** — aiempi toteutus jätti ne miehittämättä.

Ramin päätyy syyskuussa 82 h eli kaksi tuntia yli 60–80 h tavoitehaarukan. Se on
tiedossa ja hyväksytty: haarukka on tavoite eikä kova raja, ja kiristäminen
rikkoisi golden-testin.

**Miehitys ei ole enää yhtä tiukka:** lauantain keventäminen seitsemästä
vuorosta neljään vapautti kolme vuoroa viikossa arjen käyttöön, ja syyskuu
menee nyt täyteen ilman vajeita myös Arbnorin lomaviikolla. Perjantai
(Malmi 4 + Easton 3) on silti se päivä joka ensimmäisenä jää vajaaksi jos
poissaoloja tulee lisää. Siksi vajeet
näytetään käyttöliittymässä päivineen — tyhjä solu jonka voi ohittaa vahingossa
on vaarallisempi kuin näkyvä varoitus.

### Testit ajetaan ilman testiajuria

`npm test` → `node --test "src/**/*.test.mts"`. Node 24 ajaa TypeScriptiä
natiivisti, joten vitestiä tai jestiä ei tarvita. Kaksi ehtoa seuraa siitä:

- Testitiedostojen pääte on **`.test.mts`** (repo on CJS-oletuksella).
- Testattavissa moduuleissa importit ovat joko `import type` (katoaa
  käännöksessä) tai päättyvät **`.ts`**:ään — Noden ESM-resolveri ei osaa
  extensiotonta muotoa. `allowImportingTsExtensions` on tsconfigissa tätä varten.

Siksi I/O on erotettu puhtaista funktioista: `.env.local`in palvelutiliavain on
paikanpitäjä eikä Drive-koodia voi ajaa Macilla lainkaan, mutta säännöt ja
kirjoitussuunnitelma testataan täysin ilman verkkoa.

**Ensimmäinen kirjoitus ajetaan aina kuivana.** `/api/shifts/vahvista?kuiva=1`
(sivulla Kuiva-ajo-nappi) kertoo kohdealueen ja lukumäärät kirjoittamatta
mitään. Sama kuri kuin Winpos-putkessa, jossa kuiva-ajo paljasti oikean bugin.

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

**Suunnittelija on idempotentti, ei kertaluontoinen.** Jonotetut tapahtumat
kirjataan Redisiin ([planned.ts](src/lib/arxcian/push/planned.ts)), yksi kartta
käyttäjää kohti: `MarketEvent.key` -> QStashin viesti-id. Suunnittelija ohittaa
jo jonossa olevat, peruu poistuneet ja siivoaa menneet — yhdellä kierroksella,
koska kaikki kolme vertaavat samaa kahta listaa.

QStashilla on oma deduplikaationsa ja se asetetaan toiseksi lukoksi
(`deduplicationId`) siltä varalta että julkaisu onnistuu mutta kartan kirjoitus
kaatuu. Idempotenssi ei silti nojaa siihen: **viesti-id tarvitaan joka
tapauksessa peruutukseen.** Kun oma treidausaika poistetaan tai istunto
kytketään pois, jo jonotettu ilmoitus on saatava pois, eikä sitä voi tehdä
ilman id:tä.

**Suunnittelu ei tarvitse omaa ajastusta.** Suunnittelu ja toimitus ovat eri
tarkkuusluokkaa: toimitus vaatii minuutin, suunnittelu ei mitään. 48 tunnin
ikkuna kestää hyvin sen että suunnittelija ajetaan myöhässä, joten se
ratsastaa olemassa olevalla GitHub Actions -cronilla (neljä ajoa/vrk) ja
QStashin kymmenestä ilmaisesta ajastuksesta jää käyttämättä kaikki kymmenen.
Suunnittelu ajetaan `trading-calendar`-työn *sisällä* eikä omana työnään, koska
cron-reitti ajaa työt `Promise.all`illa — erillinen työ voisi ajautua ennen
kalenterin päivitystä.

Lisäksi uudelleensuunnittelu laukeaa heti kun asetus, oma aika tai laite
muuttuu (`replanQuietly`): tunnin päähän lisätty killzone olisi muuten mennyt
ohi ennen seuraavaa cron-ajoa. Se on tarkoituksella hiljainen — jos QStash on
alhaalla, tallennuksen on silti onnistuttava.

**Lähetysreittiin ei pääse istunnolla eikä `CRON_SECRET`illa.** Rungossa
kerrotaan kenelle lähetetään, joten jaettu salaisuus riittäisi kenelle tahansa
lähettämään ilmoituksen kenen tahansa puhelimeen. QStash allekirjoittaa kutsun
ja allekirjoitus kattaa rungon ja osoitteen. Suunnittelureitti sen sijaan
käyttää tavallista `authorizeCron`ia, koska QStash ei kutsu sitä.

**Punaiset julkaisut ovat neljäs tapahtumalaji, eivät oma polkunsa.**
`marketEvents` tuottaa `session-open`, `session-close`, `trading-time` ja
`calendar-release` -tapahtumia, ja kaikki neljä kulkevat samaa kuljetusta —
banneri, ääni ja push. Kalenteri annetaan **parametrina** eikä haeta
`marketEvents`in sisältä: moduuli on puhdas ja ajetaan myös selaimessa
minuuttitikityksessä, joten haku rikkoisi palvelimen ja selaimen saman
tuloksen ja näkyisi hydraatiovirheenä. Layout ja suunnittelija lukevat
molemmat pelkkää välimuistia, koska haku on rate-limitattu ja kuuluu cronille.

**Valuuttarajaus on ajallinen, ei aihepiirin.** AUD Employment julkaistaan
Suomen aikaa klo 4.15 ja JPY vielä aiemmin, joten rajaamaton lista herättäisi
useita kertoja viikossa. Oletus on `['USD', 'EUR']`. Tyhjä lista tarkoittaa
"ei yhtään" eikä "kaikki" — muuten valuuttojen poistaminen yksi kerrallaan
kääntyisi viimeisellä poistolla päinvastaiseksi. Sama sääntö kuin kalenterin
tyhjällä indeksillä.

Ennakko on kiinteä 15 min eikä istuntojen `leadMinutes`: julkaisu on hetki eikä
ikkuna, ja ainoa mielekäs kysymys on "ehdinkö koneelle". Yhteinen säädin
sitoisi kaksi eri tarvetta yhteen lukuun. Vain tulevat julkaisut ilmoitetaan —
syötteessä ei ole `actual`-kenttää, joten ilmoitus menneestä kertoisi että
jokin tapahtui, ei mitä.

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

### BadJwtToken on kolme eri vikaa, ei yksi

Apple vastaa `403 BadJwtToken` kolmeen eri syyhyn, eikä statuskoodi erota
niitä. Tuotanto lokitti 19.8.2026 yhdeksän tällaista, ja koska syytä ei voinut
päätellä, testi-push kehotti sallimaan ilmoitukset — asian joka oli jo
kunnossa.

| Syy | Korjaus | Miten todetaan |
|---|---|---|
| Palvelimen avainpari on epäsuhta | uusi pari Verceliin | `vapidKeyCheck()` johtaa julkisen avaimen yksityisestä (P-256) ja vertaa |
| Tilaus on tehty vanhalla julkisella avaimella | uusi tilaus laitteella | tilaukseen tallennettu `appServerKey` vs. nykyinen |
| `VAPID_SUBJECT` ei ole `mailto:` tai `https:` | muuttujan korjaus | muototarkistus |

**403:sta ei saa poistaa tilausta pelkän koodin perusteella, eikä avainparin
eheys yksin riitä erottimeksi.** Taulukon kolmas rivi on syy: eheälläkin
parilla 403 syntyy väärästä `sub`-kentästä ja palvelimen kellosta, ja silloin
jokainen laite saa saman virheen riippumatta omasta avaimestaan.
Koodisidonnainen poisto tyhjentäisi koko laitelistan yhdellä ajolla.

Erotin on sama kuin YouTube-hauissa: **saman ajon muiden laitteiden tulos.**
Poistopäätös tehdään vasta kun koko erä on lähetetty
([send.ts](src/lib/arxcian/push/send.ts):n `ratkaiseAvainvirheet`), ja
poistetaan vain kun **molemmat** pätevät: jokin toinen laite sai ilmoituksen
samassa erässä **samasta push-palvelusta**, ja tämän tilauksen oma avain ei ole
nykyinen. Palvelurajaus on olennainen: Apple ja Google tarkastavat
`sub`-kentän, kellon ja allekirjoituksen erikseen, joten FCM:ään mennyt
ilmoitus ei kerro mitään siitä miksi Apple hylkäsi pyynnön.

**Myös `vanha` vaatii sen onnistuneen lähetyksen**, vaikka se näyttää suoralta
todisteelta. "Vanha" tarkoittaa eroa nykyiseen `VAPID_PUBLIC_KEY`hyn, joten se
todistaa jotain vain jos nykyinen julkinen avain on itse luotettava — ja
tavallisin tapa saada epäsuhta pari on päivittää vain toinen puolikas, jolloin
jokainen tilaus näyttää vanhalta ja jokainen lähetys saa 403:n. Ehdoton poisto
veisi silloin koko laitelistan yhdellä ajolla.

Seuraus on tietoinen: **yhden laitteen käyttäjältä ei koskaan poisteta mitään
lähetyksen yhteydessä**, koska hänen ainoan lähetyksensä epäonnistuessa
onnistuneita on määritelmällisesti nolla. Sen tapauksen hoitaa selaimen
automaattinen uudelleentilaus, joka vertaa avainta suoraan eikä tarvitse
lähetystä lainkaan. Runkotekstin "vapid"-osumaan ei myöskään
luoteta yksinään: se kelpaa vain 400:n kanssa, muuten 429 tai 502 luokittuisi
avainvirheeksi ja veisi tilauksia mukanaan.

`SendResult` pitää poistot eri lukuina (`pruned` vs. `prunedStale`), koska
niiden korjaus on eri: kuollut vaatii ilmoitusluvan uudelleen, vanhentunut vain
uuden tilauksen samalla luvalla.

**Avain leimataan myös onnistuneesta lähetyksestä, ei vain tilaushetkestä.**
Perille mennyt ilmoitus on vahvempi todiste kuin mikään mitä tilaushetkellä
voitiin tallentaa: push-palvelu itse hyväksyi allekirjoituksen. Siksi
`reconcileSubscriptions` kirjaa nykyisen avaimen jokaiselle laitteelle joka sai
ilmoituksen. Ilman sitä `tuntematon` jäisi pysyväksi tilaksi riveille jotka
ovat kenttää vanhempia — todettu 20.8.2026: testi-push meni molempiin
laitteisiin klo 22.48, mutta kumpikin näytti yhä kirjaamattomalta, koska
selaimessa pyöri sivun aiemmasta latauksesta vanha JS eikä automaattinen
uudelleentilaus ajanut.

**Ero mekanismien välillä ei ole tila vaan se mitä ne vaativat tapahtuakseen.**
Selaimen uusinta laukeaa molemmista tiloista (`vanha` ja `tuntematon`), mutta
vaatii että Trading-sivu avataan **tuoreella JS:llä** — juuri se ehto jäi
täyttymättä 20.8. Palvelinleimaus ei vaadi mitään: se tapahtuu ensimmäisen
onnistuneen lähetyksen yhteydessä, myös laitteille jotka eivät koskaan avaa
sivua uudelleen.

**Leimaus muuttaa yhden poistotapauksen, ja se on tarkoitus.** Kerran
onnistuneesti toimittanut rivi on `nykyinen`, joten sitä ei enää poisteta
`tuntematon`-perusteella vaan sen 403 luokitellaan palvelimen vikaan. Se on
oikein: `tuntematon`-poisto oli arvaus, ja mitattu todiste syrjäyttää
arvauksen. Jos tilaus on todistetusti kelvannut nykyiselle avaimelle eikä
avain ole vaihtunut, 403 ei voi johtua tämän tilauksen avaimesta — kuollut
tilaus vastaisi 404/410.

Sivuhyöty: leimattu rivi ei enää laukaise turhaa unsubscribe+subscribe
-kierrosta jokaisella sivun latauksella.

**Tilaus tallentaa sen avaimen jolla se tehtiin** ([subscriptions.ts](src/lib/arxcian/push/subscriptions.ts)).
Ilman kenttää vanhaan avaimeen sidottua tilausta ei voi erottaa palvelimen
asetusvirheestä, ja laite jäisi listalle näyttämään toimivalta. Arvo otetaan
palvelimen ympäristöstä eikä asiakkaan rungosta. Puuttuva arvo tarkoittaa
"tuntematon" (rivi on kenttää vanhempi), ei "ei täsmää" — mutta korjaus on
sama, joten kumpikin uusitaan.

Vanhentunut tilaus **uusitaan selaimessa itsestään** kun Trading-sivu avataan
([PushDevices](src/components/arxcian/trading/PushDevices.tsx)). Ilmoituslupa
ei liity VAPID-avaimeen, joten selain ei kysy mitään eikä käyttäjän tarvitse
poistaa ja antaa lupia uudelleen. Uusinta ajetaan korkeintaan kerran latausta
kohti, ettei epäonnistuva tilaus jää silmukkaan.

Kaksi yksityiskohtaa joita ei saa "siistiä" pois: selaimen vanha tilaus
perutaan **aina** ennen uutta, koska `pushManager.subscribe` hylkää uuden
`applicationServerKey`n `InvalidStateError`illa jos tilaus on jo voimassa
toisella avaimella — ehdollinen peruutus jättää umpikujan jossa palvelin on jo
poistanut rivin mutta selaimen tilaus elää. Ja avaintila luetaan kolmena
nimettynä arvona eikä `!== 'nykyinen'`-vertailuna: puuttuva kenttä tarkoittaa
"palvelin ei kertonut" (vanha PWA uutta palvelinta vasten), ei "avain on
vanha".

**VAPID-avaimet ovat vain Production-ympäristössä, tarkoituksella.** Kaikki
kolme ympäristöä jakavat saman Redis-kannan, joten preview'n oma avainpari
kirjoittaisi tuotannon laitelistaan tilauksen jota tuotannon avain ei koskaan
kelpuuta — eli tuottaisi juuri sen vian jota tämä osio kuvaa. Push lähtee vain
tuotannosta. `QSTASH_TOKEN` sen sijaan on kaikissa kolmessa.

**Vika todetaan mittaamalla, ei odottamalla aamucronia.** Kolme reittiä,
kaikki istunnolla käsin ajettavia:

| Reitti | Kertoo |
|---|---|
| `GET /api/arxcian/push/diag` | avainpari, subject, laitteiden avaintila, jonon koko, QStashin vastaus, ympäristömuuttujien olemassaolo **ajavassa deployssa** |
| `POST /api/arxcian/push/test` | oikea lähetys ja sen syy jos kaatuu |
| `GET /api/arxcian/push/plan` | suunnittelee jonon heti, idempotentti |

`diag` lukee ympäristömuuttujat ajavasta prosessista eikä `vercel env ls`:stä,
koska muuttuja astuu voimaan vasta uudessa deployssa: asetettu muuttuja ja
käytössä oleva muuttuja ovat eri asia. Salaisuuksia ei palauteta — yksityisestä
avaimesta vain onko se pari julkiselle, päätepisteistä vain isäntä.

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
