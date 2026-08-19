# Trading-osion backlog

Ei toteutettuja asioita, järjestyksessä. Toteutetut asiat kuvataan
`CLAUDE.md`:ssä, eivät täällä — tämä tiedosto tyhjenee sitä mukaa kun
kohdat siirtyvät koodiin.

---

## 1. Trading-robotit

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

## 2. YouTube-kanavien uudet videot ja automaattinen tiivistys

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
