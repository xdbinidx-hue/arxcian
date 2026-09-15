# Oracle ja RJ-Mobin myyntiseuranta

Toteutuksen rajaus: `/arxcian/rj-mob/etela`, valittu kuukausitiedosto ja kolme nykyistä näkymää (tavoitteet, uusmyynti, kassamyynti). Ei lisätty myyjävalitsinta. Molemmat nykyiset käyttäjät näkevät jaetun RJ-Mob-datan. Yksityisiä muistioita tai keskusteluhistoriaa ei liitetä lukutilanteeseen.

Selain välittää valinnan ja näkyvän laskentatuloksen tarkisteen. Palvelin rajaa tiedoston nykyiseen kuukausilistaan ja lukee saman tiedoston nykyisillä `loadDashData`, `loadRunRate` ja `loadTargets`-lukijoilla. Yhteinen `rjMobComparisons` laskee näkymän ja Oraclen tavoitevertailut. Kassaprovisio kerrotaan myyntiseurannan myyjäriveillä kymmenellä; valmiiseen kassakatteeseen kerrointa ei sovelleta. Prosentti on olemassa olevan ennusteen osuus tavoitteesta, ei uusi toteumaprosentti. Puuttuvat arvot säilyvät null-arvoina, myös puutteellisessa tai tyhjässä yhteissummassa.

Jos näkyvä laskentatulos on muuttunut palvelimen lukujen perusteella, viestiä ei jonoteta; näkymä tulee päivittää. Tarkiste on tuoreustarkistus, ei käyttöoikeuden todiste. Lukutilanne tallennetaan omistajakohtaiseen Oracle-viestiin, ja bridge välittää sen Hermes-ajon syötteeseen. Uusinta käyttää samaa tallennettua tilannetta. Selaimen keskeytyneen lähetyksen luonnokseen tallennetaan vain valinta ja tarkiste, ei myyntilukuja.

## Vielä vaadittava käyttäjätesti esikatselussa

1. Avaa syyskuu 2026. Pyydä Oraclea vertaamaan yhden myyjän liittymien, F-Securen ja kassakatteen tavoitteita, toteumia, ennusteita ja prosentteja. Vertaa jokaista lukua saman näkymän taulukkoon ja Drive-lähteeseen. Älä tee tallennuksia.
2. Vaihda Uusmyyntiin ja Kassamyyntiin. Tarkista saman kuukauden myyjä- ja yhteissummat. Puuttuva luku on puuttuva, mitattu nolla on 0. Tavoite ilman toteumaa ei saa muuttua nollamyynniksi.
3. Toista lokakuulle 2026 ja myöhemmälle saatavilla olevalle kuukaudelle, myös eri vuodelle. Vaihda kuukautta nopeasti: Oraclen valinta ei saa jäädä vanhaan kuukauteen. Latautuva näkymä estää lähetyksen.
4. Muuttuneiden lähdelukujen tilanteessa päivitä näkymä, kun lähetys sitä pyytää. Jo jonotetun viestin vastaus kuuluu sen tallennettuun lukutilanteeseen, ei myöhemmin valittuun kuukauteen.
5. Tarkista toisella käyttäjällä, ettei ensimmäisen käyttäjän Oracle-viestiä voi lukea. RJ-Mobin luvut ovat nykyisen sovelluksen mukaan jaettuja molemmille käyttäjille.

Kolmen parhaan myyjän mittari odottaa käyttäjän päätöstä. Sitä ei ole valittu eikä uutta ranking-laskentaa toteutettu. Muiden RJ-Mob-sivujen (tuotto, trendit jne.) näkymäkonteksti ei sisälly tähän muutokseen. Oracle/Hermes-mallin varsinaisen vastauksen oikeellisuus tulee vielä testata esikatselussa; synteettiset laskenta- ja kuljetustestit eivät todista sitä.

Ei julkaisulupaa tähän muutokseen. Arxcian-koodi ja VPS:n bridge-skripti on otettava myöhemmin käyttöön yhteensopivina versioina hyväksytyssä julkaisussa.
