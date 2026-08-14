# Trading-osion backlog

Ei toteutettuja asioita, järjestyksessä. Toteutetut asiat kuvataan
`CLAUDE.md`:ssä, eivät täällä — tämä tiedosto tyhjenee sitä mukaa kun
kohdat siirtyvät koodiin.

---

## 1. Push-ilmoitukset punaisista uutisista ja istuntojen avauksista

**Tila:** käyttäjä haluaa tämän. Toteutus **odottaa arkkitehtia** —
päätös 14.8.2026, ei aloiteta Trading-osiosta käsin.

Nykyiset paneelit ([EconomicCalendar](../src/components/arxcian/trading/EconomicCalendar.tsx),
[MarketSessions](../src/components/arxcian/trading/MarketSessions.tsx)) näyttävät
tiedon vasta kun sivu avataan. Tavoite on ilmoitus joka tavoittaa puhelimen
ilman että sovellus on auki: esimerkiksi 15 min ennen korkean vaikutuksen
julkaisua ja istunnon avautuessa.

**Lähtötilanne kartoitettu 14.8.2026 — push-tukea ei ole lainkaan:**

| Osa | Tila |
|---|---|
| `push`- ja `notificationclick`-käsittelijä [sw.js](../public/sw.js):ssä | puuttuu |
| VAPID-avaimet | puuttuu |
| `web-push`-kirjasto | puuttuu |
| Tilausten tallennus | puuttuu |
| PWA (`display: standalone`, ikonit) | **kunnossa** |

Kolme osaa, joista vain kolmas on Trading-osion omaa:

1. **Tilaus ja service worker.** Lupapyyntö, `pushManager.subscribe`,
   tilaukset käyttäjäkohtaisesti Redisiin, `push`-käsittelijä. Koskee PWA:ta
   ja jaettua tallennusta.
2. **Ajastin — tämä on pullonkaula.** Ajastus on nyt GitHub Actionsissa
   neljästi vuorokaudessa ja `vercel.json`issa yksi päivittäinen cron, koska
   Hobby-taso ei salli enempää. "15 min ennen" vaatii ~5 minuutin tarkkuuden,
   eikä kumpikaan nykyinen reitti anna sitä.
3. **Mistä ilmoitetaan.** Trading-osion logiikkaa: mitkä tapahtumat ylittävät
   ilmoituskynnyksen ja millä ennakkoajalla. Tämä on valmis toteutettavaksi
   heti kun kuljetus ja ajastin ovat olemassa.

**Ajastinvaihtoehdot, kun asia otetaan käsittelyyn:**

- **QStash** (suositus tästä kartoituksesta): ajastaa yksittäisen HTTP-kutsun
  tarkkaan hetkeen, joten kalenterin päivittyessä jonoon laitetaan viesti per
  tuleva tapahtuma — ei pollausta lainkaan. Sama toimittaja kuin Redis.
  Volyymi ~10 tapahtumaa + 15 istunnon avausta viikossa. Ilmaistason rajat on
  tarkistettava ennen sitoutumista.
- **Vercel Pro** (~20 $/kk): poistaa Hobby-rajan, cronit minuutin tarkkuudella,
  ei uutta palvelua. Hyödyttäisi myös uutishakuja, jotka voisi siirtää pois
  GitHub Actionsista.
- **GitHub Actions 5 min välein**: ilmainen, mutta ajastus viivästyy
  käytännössä usein kymmeniä minuutteja, jolloin "15 min ennen" voi tulla
  tapahtuman jälkeen. Lisäksi 288 ajoa/vrk syö Actions-minuutit.

**Tiedettävä rajoite:** iOS:llä push toimii vain kotiruudulle asennetusta
PWA:sta, ei Safarin välilehdeltä. Ilmoitus ei siis tule jos sovellusta ei ole
asennettu.

**Kannattaa suunnitella yhdessä kohdan 3 kanssa:** molemmat tarvitsevat
saman "herää oikeaan aikaan ja kerro käyttäjälle" -mekanismin, ja kaksi
erillistä ratkaisua samaan ongelmaan olisi juuri se mitä ei haluta.

---

## 2. Trading-robotit

**Tila:** ei aloitettu. Kirjattu 12.8.2026, ei toteutuslupaa.

Tämä on `CLAUDE.md`:n mallinvalinnan mukaan **Opus 5 -kokoluokan
arkkitehtuuripäätös**, ei rutiinitoteutusta: se tuo sovellukseen
ensimmäisen komponentin joka toimii itsenäisesti ilman käyttäjän
läsnäoloa, ja liikuttaa oikeaa rahaa.

Ennen ensimmäistäkään riviä on päätettävä ainakin nämä. Yksikään ei ole
toteutusyksityiskohta, joka voitaisiin ratkaista matkan varrella:

- **Mihin se ajetaan.** Nykyinen ajastus on GitHub Actionsissa neljästi
  vuorokaudessa (Vercelin Hobby-taso sallii kaksi cronia kerran
  päivässä). Kumpikaan ei riitä robotille joka reagoi markkinaan.
  Vaihtoehdot ovat oma pitkäikäinen prosessi jossain muualla, tason nosto
  Prohon, tai robotti joka toimii tarkoituksella harvalla rytmillä.
- **Kuka vahvistaa toimeksiannon.** AI-avustajan kirjoitustoimet kulkevat
  jo `ProposalPanel`in kautta eikä mikään tapahdu ilman käyttäjän
  painallusta (`CommandPalette.tsx`). Robotti on määritelmällisesti sen
  vastakohta. Onko sama vahvistusmalli käytössä, vai onko robotilla
  valtuus toimia itse — ja jos on, minkä kokoisilla positioilla.
- **Hätäpysäytys.** Yksi kytkin joka pysäyttää kaiken, ja joka toimii myös
  silloin kun sovellus itse on rikki tai käyttäjä on puhelimella.
- **Paperikauppa ensin.** Sama koodi, ei oikeaa rahaa, tarpeeksi pitkään
  että strategian tuotto on mitattu eikä arvattu.
- **Datalähde.** Nykyinen watchlist on Yahoo Financen dokumentoimaton
  chart-API neljästi vuorokaudessa — se riittää seurantaan, muttei
  päätöksentekoon. Robotti tarvitsee lähteen jolla on SLA.

**Huom:** en suorita kauppoja enkä anna sijoitusneuvoja. Toteutusapu
koskee ohjelmistoa — strategian valinta ja riskitaso ovat käyttäjän.

---

## 3. YouTube-kanavien uudet videot ja automaattinen tiivistys

**Tila:** odottaa jaettua mekanismia. Ei saa toteuttaa erikseen.

Tavoite: ilmoitus kun seurattu kanava julkaisee videon, ja automaattinen
yhteenveto (NotebookLM tai vastaava).

Puolet tästä on jo olemassa eri paikoissa, ja juuri siksi tätä ei pidä
rakentaa vielä: [channels.ts](../src/lib/arxcian/channels.ts) hakee
seurattujen kanavien tuoreimmat, [ict.ts](../src/lib/arxcian/trading/ict.ts)
tekee saman ICT-kanavalle, ja uutisten AI-tiivistys on omansa. Kolmas
rinnakkainen "seuraa lähdettä ja tiivistä" -toteutus olisi se joka
jouduttaisiin purkamaan.

Arkkitehti suunnittelee jaettua mekanismia. **Tarkista `CLAUDE.md`
ennen aloitusta** — kun merkintä on siellä, tämä kohta toteutetaan sen
päälle eikä sen viereen.

Avoin kysymys jonka mekanismi ei ratkaise: NotebookLM:llä ei ole
julkista API:a. Tiivistys tehdään joko olemassa olevalla
`ANTHROPIC_API_KEY`:llä videon tekstityksestä, tai NotebookLM jää
käsityöksi johon sovellus vain linkittää. Tämä on päätettävä ennen kuin
"automaattinen yhteenveto" tarkoittaa mitään.
