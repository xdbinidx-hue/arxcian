# rjmob-portal

Yksi Next.js-sovellus, kaksi brändiä:

- **RJ-Mob** — nykyinen bisnesportaali (`/tuotto`, `/trendit`, `/tavoitteet`, `/tyovuorot`, …). Pysyy ennallaan.
- **arxcian** (aina pienellä) — henkilökohtainen hub-kokonaisuus RJ-Mobin rinnalla. Kaikki uusi arxcian-sisältö menee polkuun `/arxcian/*` ja API `/api/arxcian/*`.

Osiot arxcianin alla: RJ-Mob, Trading, Uutiset, Personal.

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
| `ALBIN_PIN`, `ARBNOR_PIN`, `GUEST_PIN` | kirjautumistunnusluvut |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Google Sheets / Drive |
| `ANTHROPIC_API_KEY` | AI-tiivistelmät |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis -välimuisti |

## Käyttäjät ja näkyvyys

Kaksi käyttäjää: `albin` ja `arbnor`. Lisäksi RJ-Mobin `guest` (1 h istunto, max 5 kirjautumista) — **guest ei pääse arxcianin osioihin lainkaan**.

Istunto on iron-sessionilla salattu eväste (`arxcian_session`), ei väärennettävissä selaimesta. Kaikki apurit: [src/lib/session.ts](src/lib/session.ts).

Jokainen henkilökohtainen tietue saa `owner`-kentän: `'albin' | 'arbnor' | 'shared'`. Suodata aina palvelinpuolella `canView()`- tai `visibleTo()`-apurilla, älä selaimessa.

```ts
const user = await currentUser()
const omat = visibleTo(kaikki, user)
```

Globaali `vercel` on 54.4.1 eikä osaa lisätä preview-muuttujia ei-interaktiivisesti (jää `git_branch_required`-tilaan). Päivitys vaatisi sudon, joten käytä preview-lisäyksiin `npx vercel@latest env add <NIMI> preview --value <arvo> --yes`.

## PWA

Asennettavissa kotiruudulle: manifest [src/app/manifest.ts](src/app/manifest.ts), service worker [public/sw.js](public/sw.js). `start_url` on `/arxcian`, mutta `scope` on `/`, jotta RJ-Mob aukeaa samassa ikkunassa eikä selaimessa.

Service worker **ei tallenna HTML-sivuja välimuistiin** tarkoituksella — sisältö on henkilökohtaista ja Albin ja Arbnor voivat käyttää samaa laitetta. Vain muuttumattomat `/_next/static/*` ja `/icons/*` välimuistitetaan; verkon pettäessä näytetään offline-sivu. Rekisteröinti tapahtuu vain tuotannossa.

Ikonit generoidaan ilman kuvakirjastoja: `node scripts/generate-icons.mjs`. Muokkaa skriptiä jos merkki vaihtuu.

PWA-tiedostot on jätetty middlewaren ulkopuolelle, muuten asennus ei onnistu.

## Tunnetut puutteet

- RJ-Mobin nykyiset API-reitit (`/api/sheets`, `/api/targets`, …) ovat middlewaressa auki ilman istuntoa — vanha käytäntö, ei muutettu jotta mikään ei hajoa. `/api/arxcian/*` vaatii aina istunnon.
