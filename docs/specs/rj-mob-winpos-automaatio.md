# Speksi: Winpos-raportin automaattinen vienti Kassakate-välilehdelle

**Osio:** rj-mob
**Päivätty:** 14.8.2026
**Laatinut:** Cowork (yhdessä Albinin kanssa)

---

## 1. Tausta — mitä repossa jo on

Tämä ei ole uusi putki nollasta. Arxcianissa on jo kaikki paitsi
automaattinen syöttö:

- `src/lib/rjmobDrive.ts` — Myyntiseuranta-kansio `1QKY-rxqFQwbfK9saX5fvhVIixrv_9kYz`,
  vuosikansiot, kuukausitiedostojen listaus
- `src/app/api/targets/route.ts` — lukee kuukausitiedoston **Kassakate**-välilehden:
  sarakkeet Myyjä / Virallinen nimi / Myynti / Palautus / Alennus / Kuitit / Kate
- Vercel-cron (`vercel.json`) ja Drive-webhook (`/api/webhook/register`)
- `googleapis` ja `exceljs` riippuvuuksina

**Kassakate-välilehden sarakkeet ovat täsmälleen Winpos-raportin sarakkeet.**
Albin on tähän asti kopioinut luvut sinne käsin. Tämä speksi automatisoi
juuri sen työvaiheen — ei mitään muuta.

Koodissa oleva kommentti vahvistaa myös rivien rakenteen:
*"Sama myyjä voi esiintyä usealla rivillä (eri kustannuspaikat) — summataan."*
Winposin raportin monta riviä per myyjä ovat siis kustannuspaikkoja eli
myymälöitä, vaikka myymälän nimi ei viennissä näy.

## 2. Tavoite

```
Winpos → sähköposti → "Lisää Driveen" → Winpos-arkisto/
   → Arxcian lukee .xls
   → kirjoittaa rivit kuluvan kuukauden Kassakate-välilehdelle
   → olemassa oleva RJ-Mob-näkymä päivittyy itsestään
```

Albin ei tee muuta kuin ajaa raportin ja painaa Gmailissa "Lisää Driveen".

## 3. Kaksi muutosta olemassa olevaan

### 3.1 Kirjoitusoikeus

Kaikki nykyiset reitit käyttävät readonly-scopeja:

```ts
scopes: ['.../auth/drive.readonly', '.../auth/spreadsheets.readonly']
```

Kirjoittaminen vaatii `.../auth/spreadsheets` (ja `.../auth/drive` jos
tiedostoja siirretään). **Älä laajenna kaikkien reittien scopea** — tee
kirjoittavalle työlle oma auth-funktio `rjmobDrive.ts`:ään, esim.
`getWriteAuth()`. Lukureitit pysyvät readonly-tilassa, jolloin bugi
lukureitissä ei voi koskaan rikkoa dataa.

Palvelutili `rjmob-reader@peerless-sensor-497221-a9.iam.gserviceaccount.com`
on jaettu Muokkaaja-oikeuksin ARXCIAN-kansioon, joten Driven puolella
oikeudet ovat jo kunnossa.

### 3.2 .xls-lukija

`exceljs` **ei osaa lukea vanhaa .xls-muotoa** (BIFF), jota Winpos käyttää.
Lisää `xlsx` (SheetJS) riippuvuudeksi.

Valmiit moduulit (testattu oikealla raportilla, summat täsmäävät sentilleen):

- `winpos-parser.ts` — palauttaa `WinposRaportti`
- `winpos-myyjat.ts` — koodi/lyhytnimi → koko nimi

Sijoitus: `src/lib/winpos/`. Älä kirjoita omaa parseria.

## 4. Toteutus

Uusi reitti `src/app/api/winpos/import/route.ts`, ajastettuna
`vercel.json`-croniin (kerran vuorokaudessa riittää — raportti ajetaan käsin).

1. Listaa `Winpos-arkisto` (`1pdgpw0Vb_fzuyxWhTXjaJeakrEQErkg5`) `.xls`-tiedostot
2. Ohita jo käsitellyt — pidä kirjaa **Drive-tiedosto-ID:istä** KV:ssä
   (`@vercel/kv` on jo käytössä). Älä käytä `modifiedTime`-vertailua: se
   pettää jos tiedosto siirretään.
3. Lataa ja aja `parseWinposReport()`
4. Etsi kuluvan kuukauden tiedosto `listSeurantaFiles()` + `monthOrder()`
5. Etsi Kassakate-välilehti samalla `findSheet(..., 'kassakate', 'kassamyynti')`
   -logiikalla kuin `targets/route.ts`
6. Kirjoita rivit `sheets.spreadsheets.values.update`
7. Täytä **Virallinen nimi** -sarake nimikartasta

### Sarakkeiden kohdistus

Lue otsikkorivi ja kohdista **nimen perusteella**, samalla `findCol`-tavalla
kuin `targets/route.ts`. Älä oleta sarakejärjestystä — Albin voi järjestää
välilehden uudelleen milloin tahansa.

| Winpos | Kassakate |
|---|---|
| Nimi | Myyjä |
| (nimikartasta) | Virallinen nimi |
| Myynti (alv 0) | Myynti |
| Kate (alv 0) | Kate |
| Palautus | Palautus |
| Alennus | Alennus |
| Kuittien määrä | Kuitit |

## 5. Reunatapaukset

| Tilanne | Toiminta |
|---|---|
| Sama raportti kahdesti | `reportId` tunnettu → ohita. Älä lisää rivejä. |
| Päällekkäiset jaksot (1.–12.8. ja 1.–20.8.) | **Korvaa** kuukauden rivit, älä lisää. Winpos-raportti on aina kumulatiivinen jakson alusta. |
| Myyjä puuttuu nimikartasta | Luvut menevät läpi, Virallinen nimi jää tyhjäksi, varoitus näkyviin. |
| Summat eivät täsmää Yhteensä-riviin | **Älä kirjoita mitään.** Nosta virhe. Väärä luku on pahempi kuin puuttuva. |
| Tiedosto ei ole Winpos-raportti | Parser heittää → merkitse käsitellyksi, jatka muihin. |
| Kuukausitiedostoa ei löydy | Älä luo uutta. Nosta virhe — Albin luo kuukausitiedoston kopiona pohjasta. |
| Kassakate-välilehteä ei ole | Nosta virhe, älä luo. |

**Kirjoita vain Kassakate-välilehdelle.** Muut välilehdet (Tavoitteet, Data,
Myyjät yhteensä) ovat Albinin käsin ylläpitämiä.

## 6. Testit

1. Elokuun oikea raportti → 35 638,31 € / 6 499,57 € / 612 kuittia
2. Sama tiedosto kahdesti → rivimäärä ei kasva
3. Päällekkäinen jakso → rivit korvautuvat, eivät kahdennu
4. Tuntematon myyjä → luvut oikein, varoitus annetaan
5. Sarakkeet eri järjestyksessä Kassakatteella → kohdistus toimii
6. Roskatiedosto → ei kaada ajoa
7. Lukureitit toimivat yhä readonly-scopella

## 7. Mitä EI tehdä

- Älä laajenna lukureittien scopea kirjoittavaksi
- Älä kirjoita omaa .xls-parseria
- Älä lue Gmailia — "Lisää Driveen" hoitaa siirron
- Älä luo uusia kuukausitiedostoja automaattisesti
- Älä koske muihin välilehtiin kuin Kassakatteeseen
- Älä laita palvelutilin avainta repoon
- Älä arvaa myymälää rivijärjestyksestä — tieto ei ole datassa

## 8. Avoimet kysymykset

1. **Onko Kassakate-välilehden nykyinen täyttötapa varmasti käsin kopiointi?**
   Jos siellä on kaavoja jotka viittaavat muualle, kirjoitus rikkoisi ne.
   Tarkista ennen toteutusta.
2. Otetaanko Winposin päiväerittely käyttöön? Ilman sitä myymälä- ja
   päiväkohtaista erittelyä ei voi tehdä. Parser tukee molempia jo nyt.
3. Cowork rakensi 13.8. erillisen `Winpos-elokuu-2026.xlsx` -taulukon ennen
   kuin Kassakate-välilehti löytyi. **Se on tarpeeton** — hylkää se, jotta
   samaa dataa ei ylläpidetä kahdessa paikassa.
