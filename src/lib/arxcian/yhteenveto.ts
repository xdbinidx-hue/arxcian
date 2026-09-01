import { listSeurantaFiles, monthOrder, SPREADSHEET_MIME } from '@/lib/rjmobDrive'
import { loadDashData, type DashData } from '@/lib/rjmobSheets'
import { loadTargets } from '@/lib/rjmobTargets'
import { loadRunRate } from '@/lib/rjmobRunRate'
import { myymalaRivit, myyjaRivit, yhteensaRivi, type RunRateTavoite, type RunRateToteuma } from '@/lib/rjmobRunRateRivit'
import { myymalanTehot, tehoaEiArvioida } from '@/lib/rjmob'
import { mittari, setti, nimiAvaimet, myymalaPerMyyja, type Mittari, type MittariSetti } from './yhteenvetoRivit'
import type { Ulkopuoliset } from '@/lib/rjmobMyymalaTaulukko'

/**
 * Ajastetun yhteenvedon luku-API:n ulostulo.
 *
 * **Tämä on kuori, ei laskenta.** Luvut tulevat samoista funktioista joita
 * Etelän Härät -sivu käyttää — `loadDashData` (toteumat), `loadRunRate`
 * (tavoitteet ja työpäivät) ja `rjmobRunRateRivit` (run rate -rivit) — eikä
 * täällä lasketa yhtään myyntilukua uudestaan. Jos API ja sivu näyttävät eri
 * lukua, vika on tässä tiedostossa eikä laskennassa.
 *
 * Run rate on 30.8.2026 sovitulla mallilla, koska `runRateMittari` on sama
 * funktio jota sivukin kutsuu: ennuste = toteuma / päättyneet työpäivät ×
 * kuukauden kaikki työpäivät, kuluva päivä pois. Nolla päättynyttä työpäivää
 * on `null` eikä nolla.
 *
 * Puhtaat apurit ovat [yhteenvetoRivit.ts](yhteenvetoRivit.ts):ssä, jotta ne
 * on testattavissa ilman Drivea.
 */

/** Myyjän kassaprovisio kassakatteeksi. Sama kerroin kuin Etelän Härät -sivulla. */
const KASSAKATE_KERROIN = 10

export type { Mittari, MittariSetti }

export type MyymalaRivi = MittariSetti & {
  nimi: string
  tunnit: number
  /** Liittymä + kassakate / tunnit — sama ratkaiseva keskimmäinen teho kuin sivulla. */
  tehoEurPerH: number | null
}

export type MyyjaRivi = MittariSetti & {
  nimi: string
  /** Myymälä jossa myyjä teki eniten tunteja, tai `null` jos kohdistusta ei ole. */
  myymala: string | null
  tunnit: number
  /**
   * `null` myös silloin kun tehoa ei arvioida (`tehoaEiArvioida`) — Albin ei
   * tee myyntivuoroja, joten hänen provisionsa jakautuisi lähes nollille
   * tunneille ja luku olisi mielivaltainen. Molemmat teholuvun näyttävät
   * sivut jättävät sen tyhjäksi, ja API on sama lähde samalle luvulle.
   */
  tehoEurPerH: number | null
  /** Myyjän omat vuorot: run raten nimittäjä. Eri luku kuin myymälän työpäivät. */
  tyopaivat: { paattyneet: number; kaikki: number }
}

export type UusmyyntiRivi = {
  operaattori: string
  /**
   * Kappaleet Tavoitteet-välilehden riveiltä summattuna. **Rajaus on sama
   * kuin tavoitesivulla**: mukana ovat ne myyjät joilla on tavoiterivi, ei
   * Albin. Se ei siis ole koko alueen uusmyynti.
   */
  kpl: number
  /** Operaattorikohtaista tavoitetta ei ole missään lähteessä — aina `null`. */
  tavoite: number | null
}

export type Yhteenveto = {
  meta: {
    haettu: string
    /** "2026-08". */
    kuukausi: string
    /** Myyntiseurantatiedoston nimi, eli mistä luvut on luettu. */
    lahde: string
    tyopaivat: { paattyneet: number; kaikki: number }
    kuukaudestaKulunut: number | null
    /**
     * Osa-alueet joiden kentät ovat `null`. Yhden palan puuttuminen ei kaada
     * koko vastausta — se kerrotaan täällä.
     */
    puutteet: string[]
    /**
     * Miksi jokin puuttuu, ja lähteiden omat varoitukset. Pelkkä puutteen
     * nimi kertoo että jokin on vialla mutta ei mitä korjata.
     */
    varoitukset: string[]
  }
  yhteensa: MittariSetti
  uusmyynti: UusmyyntiRivi[] | null
  /**
   * Tuoteryhmittäinen kassamyynti. **Aina `null`:** yhdessäkään lähteessä ei
   * ole tuoteryhmää eikä kappalemäärää — Kassamyynti-välilehden rivit ovat
   * myyjäkohtaisia (koodi, nimi, myynti, kate, palautus, alennus, kuitit) ja
   * maksukuitit myymäläkohtaisia katelajeja. Kenttä on mukana rakenteessa
   * jotta puute näkyy vastauksessa eikä vain siinä ettei kenttää ole.
   */
  kassamyynti: null
  myymalat: MyymalaRivi[]
  myyjat: MyyjaRivi[]
  /**
   * Rivit joita `myymalat` ei kata, ja se osa jonka `myymalat` kattaa mutta
   * `myyjat` ei. Näillä myymälä- ja myyjätaulukon ero on täsmäytettävissä
   * lukuna eikä arvauksena — ks.
   * [rjmobMyymalaTaulukko.ts](../rjmobMyymalaTaulukko.ts):n `Ulkopuoliset`.
   *
   * `null` vanhoilla kuukausilla (ennen 1.9.2026), joissa erittelyä ei ole.
   */
  ulkopuoliset: Ulkopuoliset | null
}

/** Teho vain kun tunteja on — nolla tuntia antaisi nollan joka näyttäisi mitatulta. */
function teho(arvo: number, tunnit: number): number | null {
  return tunnit > 0 ? arvo : null
}

function virhe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export async function buildYhteenveto(nyt: Date = new Date()): Promise<Yhteenveto> {
  // Uusin kuukausi `vuosi × 100 + kuukausi` -järjestyksellä, sama sääntö kuin
  // hubin yhteenvedossa. Pelkkä kuukausinumero valitsisi tammikuussa
  // edellisen vuoden joulukuun.
  const tiedostot = (await listSeurantaFiles())
    .filter(f => f.mimeType === SPREADSHEET_MIME && f.id && f.name)
    .sort((a, b) => monthOrder(b.name!) - monthOrder(a.name!))

  if (tiedostot.length === 0) throw new Error('Myyntiseurantataulukoita ei löytynyt')

  const tiedosto = tiedostot[0]
  const fileId = tiedosto.id!

  const puutteet: string[] = []
  const varoitukset: string[] = []

  // Tavoitteiden puuttuminen ei saa kaataa toteumia eikä päinvastoin, joten
  // uusmyynnin lähde niellään erikseen. Nielty tulos kerrotaan syineen:
  // pelkkä puutteen nimi ei erota väärää tiedostoa Driven katkoksesta.
  const [dash, runrate, targets] = await Promise.all([
    loadDashData(fileId),
    loadRunRate(fileId),
    loadTargets(fileId).catch(e => {
      varoitukset.push(`Tavoitteet-välilehteä ei voitu lukea: ${virhe(e)}`)
      return null
    }),
  ])

  varoitukset.push(...runrate.varoitukset)
  // Lähteen omat puutteet (esim. kadonnut sarake) kulkevat läpi asti:
  // puuttuvasta sarakkeesta ei palauteta nollaa, ja nolla ilman varoitusta
  // näyttäisi mitatulta tulokselta.
  varoitukset.push(...dash.puutteet)
  if (dash.puutteet.length > 0) puutteet.push('myyntiseurannan-sarakkeet')

  // --- Toteumat samassa muodossa kuin Etelän Härät -sivulla ---

  const myymalaToteumat: RunRateToteuma[] = Object.entries(dash.stores).map(([nimi, s]) => ({
    nimi, liittymat: s.liittKpl, fsecure: s.fsecKpl, kassakate: s.kassa,
  }))

  // Standi-rivit eivät ole RJ-Mobin myyjiä eivätkä ole sivullakaan mukana.
  const myyjat = dash.sellers.filter(s => s.tyyppi !== 'standi')
  const myyjaToteumat: RunRateToteuma[] = myyjat.map(s => ({
    nimi: s.nimi, liittymat: s.liittKpl, fsecure: s.fsecKpl,
    kassakate: s.kassa * KASSAKATE_KERROIN,
  }))

  // --- Tavoitteet ---

  const myymalaTavoitteet: Record<string, RunRateTavoite> =
    Object.fromEntries(runrate.tavoitteet.myymalat.map(m => [m.storeKey, m]))
  const myyjaTavoitteet: Record<string, RunRateTavoite> =
    Object.fromEntries(runrate.tavoitteet.myyjat.map(m => [m.nimi, m]))

  if (runrate.tavoitteet.myymalat.length === 0) puutteet.push('myymalatavoitteet')
  if (runrate.tavoitteet.myyjat.length === 0) puutteet.push('myyjatavoitteet')

  // --- Rivit ---
  //
  // Run rate -rivit haetaan nimellä eikä indeksillä: `myyjaRivit` on tänään
  // puhdas `.map`, mutta jos siihen joskus lisätään lajittelu, indeksipari
  // yhdistäisi hiljaa toisen myyjän luvut toisen nimeen.
  const myyjaLahde = new Map(myyjat.map(s => [s.nimi, s]))
  const myymalaKartta = myymalaPerMyyja(dash.storeHours)

  // Vanhassa tiedostoformaatissa myymäläerittelyä ei ole lainkaan, jolloin
  // jokainen myyjä jäisi ilman myymälää ilman että mikään kertoo miksi.
  if (Object.keys(dash.storeHours).length === 0) puutteet.push('myyjan-myymala')

  const myymalatUlos: MyymalaRivi[] = myymalaRivit(myymalaToteumat, myymalaTavoitteet, runrate.tyopaivat)
    .map(r => {
      const s = dash.stores[r.nimi]
      return { nimi: r.nimi, ...setti(r), tunnit: s.tunnit, tehoEurPerH: teho(myymalanTehot(s).kassa, s.tunnit) }
    })

  const myyjatUlos: MyyjaRivi[] = myyjaRivit(myyjaToteumat, myyjaTavoitteet, runrate.myyjaVuorot)
    .map(r => {
      const s = myyjaLahde.get(r.nimi)!
      return {
        nimi: r.nimi,
        myymala: myymalaKartta[nimiAvaimet(s.nimi)[0]] ?? null,
        ...setti(r),
        tunnit: s.tunnit,
        // Myyntiseurannan asteikko (`myyntiTeho`), sama kuin Etelän Härät
        // -sivulla: Krenarin nelinkertainen sopimusprovisio ei kuulu
        // myyntisuoritusten vertailuun.
        tehoEurPerH: tehoaEiArvioida(s.nimi) ? null : teho(s.myyntiTeho, s.tunnit),
        tyopaivat: runrate.myyjaVuorot[s.nimi] ?? { paattyneet: 0, kaikki: 0 },
      }
    })

  // --- Yhteensä ---
  //
  // Myymälärivien summa eikä myyjärivien: myymälätaulukko kattaa koko
  // alueen myynnin, myyjätaulukon rajaus on eri eikä niitä lasketa yhteen.
  const yhteensa = setti(yhteensaRivi(myymalaToteumat, runrate.tavoitteet.yhteensa, runrate.tyopaivat))

  // --- Uusmyynti operaattoreittain ---
  //
  // Toteumat tulevat `loadTargets`in myyjäriveiltä summattuna. Tavoite on
  // `null`, koska operaattorikohtaista tavoitetta ei ole missään lähteessä —
  // tavoitetaulukossa on vain liittymät, F-Secure ja kassakate.
  let uusmyynti: UusmyyntiRivi[] | null = null
  if (targets) {
    const rivit = targets.targets
    const summa = (valitse: (t: (typeof rivit)[number]) => number) =>
      rivit.reduce((s, t) => s + valitse(t), 0)
    uusmyynti = [
      { operaattori: 'DNA', kpl: summa(t => t.dnaUusmyynti), tavoite: null },
      { operaattori: 'Elisa', kpl: summa(t => t.elisaUusmyynti), tavoite: null },
      { operaattori: 'Telia', kpl: summa(t => t.teliaUusmyynti), tavoite: null },
    ]
  } else {
    puutteet.push('uusmyynti')
  }

  // Tuoteryhmittäistä kassamyyntiä ei ole olemassa missään lähteessä, joten
  // se on puute joka kestää — ks. `Yhteenveto.kassamyynti`.
  puutteet.push('kassamyynti')

  const kk = runrate.kuukausiOrder
  const { paattyneet, kaikki } = runrate.tyopaivat

  return {
    meta: {
      haettu: nyt.toISOString(),
      kuukausi: `${Math.floor(kk / 100)}-${String(kk % 100).padStart(2, '0')}`,
      // Tiedostonimen lisäksi välilehdet: 1.9.2026 alkaen luvut tulevat
      // yhdestä paikasta, ja se on juuri se mikä vastauksesta on voitava
      // lukea ilman että koodia avataan.
      lahde: `${tiedosto.name!} · ${dash.lahde}`,
      tyopaivat: { paattyneet, kaikki },
      kuukaudestaKulunut: kaikki > 0 ? paattyneet / kaikki : null,
      puutteet,
      varoitukset,
    },
    yhteensa,
    uusmyynti,
    kassamyynti: null,
    myymalat: myymalatUlos,
    myyjat: myyjatUlos,
    ulkopuoliset: dash.ulkopuoliset ?? null,
  }
}
