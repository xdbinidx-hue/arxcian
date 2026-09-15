/**
 * Myyjien nimikartta
 * ------------------
 * Winposissa myyjät on merkitty lyhyillä nimillä ("Kasperi K.", "Joni V").
 * Tämä tiedosto kääntää ne kokonimiksi, jotta Arxcian ja raportit näyttävät
 * oikeat nimet.
 *
 * ⚠️ TÄTÄ TIEDOSTOA MUOKATAAN kun uusi myyjä aloittaa — ei mitään muuta.
 * Lisää rivi listaan, siinä kaikki.
 *
 * Tunnistus tapahtuu ensisijaisesti KOODILLA, koska koodi ei muutu vaikka
 * nimen kirjoitusasu Winposissa muuttuisi. Jos koodia ei tiedetä, käytetään
 * Winpos-nimeä varalla.
 */

export interface MyyjaTieto {
  /** Myyjän koodi Winposissa. Jätä tyhjäksi jos et vielä tiedä sitä. */
  koodi?: string;
  /** Nimi täsmälleen niin kuin se on Winposissa. */
  winposNimi: string;
  /** Koko nimi, jota halutaan näyttää. */
  kokoNimi: string;
}

export const MYYJAT: MyyjaTieto[] = [
  { koodi: '12', winposNimi: 'Albin Rashica',  kokoNimi: 'Albin Rashica' },
  { koodi: '13', winposNimi: 'Arbnor Rashica', kokoNimi: 'Arbnor Rashica' },
  { koodi: '14', winposNimi: 'Steven',         kokoNimi: 'Steven Sainio' },
  { koodi: '15', winposNimi: 'Jami',           kokoNimi: 'Jami Tonteri' },
  { koodi: '17', winposNimi: 'Joni V',         kokoNimi: 'Joni Viljamaa' },
  { koodi: '20', winposNimi: 'Alec',           kokoNimi: 'Alec Fambro' },
  { koodi: '24', winposNimi: 'Joona',          kokoNimi: 'Joona Huttunen' },
  { koodi: '26', winposNimi: 'Basri',          kokoNimi: 'Basri Salihi' },
  { koodi: '27', winposNimi: 'Atte',           kokoNimi: 'Atte Kröger' },
  { koodi: '31', winposNimi: 'Leo',            kokoNimi: 'Leo Rossi' },
  { koodi: '35', winposNimi: 'Krenar',         kokoNimi: 'Krenar Bajqinovci' },
  { koodi: '36', winposNimi: 'Kasperi K.',     kokoNimi: 'Kasperi Kemppainen' },
  { koodi: '37', winposNimi: 'Vladimir K.',    kokoNimi: 'Vladimir Kogan' },
  { koodi: '38', winposNimi: 'Hamza H.',       kokoNimi: 'Hamza Hanif' },
  { koodi: '39', winposNimi: 'Lauri U.',       kokoNimi: 'Lauri Ukkonen' },
  { koodi: '49', winposNimi: 'Antti',          kokoNimi: 'Antti Kiljala' },
  { koodi: '85', winposNimi: 'Ramin',          kokoNimi: 'Ramin Kadiri' },
  // Koodi ei vielä tiedossa — täydennä kun se näkyy raportissa:
  {              winposNimi: 'Daniel',         kokoNimi: 'Daniel Miettinen' },
];

/** Normalisoi nimen vertailua varten: pienet kirjaimet, ylimääräiset välit pois. */
const avain = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

const KOODILLA = new Map(MYYJAT.filter((m) => m.koodi).map((m) => [m.koodi!, m]));
const NIMELLA = new Map(MYYJAT.map((m) => [avain(m.winposNimi), m]));

/**
 * Palauttaa myyjän koko nimen. Jos myyjää ei löydy kartasta, palauttaa
 * Winposin oman nimen sellaisenaan — data ei koskaan katoa, vaikka nimi
 * puuttuisi kartasta.
 */
export function kokoNimi(koodi: string, winposNimi: string): string {
  const osuma = (koodi && KOODILLA.get(koodi.trim())) || NIMELLA.get(avain(winposNimi));
  return osuma?.kokoNimi ?? winposNimi;
}

/** Kertoo puuttuuko myyjä kartasta — käytetään varoituksen antamiseen. */
export function onTuntematon(koodi: string, winposNimi: string): boolean {
  return !((koodi && KOODILLA.get(koodi.trim())) || NIMELLA.get(avain(winposNimi)));
}
