// PK-seudun (Malmi, Easton, Kivistö) työvuorolistan tietomallit ja
// kuukausigeneraattori.
//
// Kuukauden tapahtumat, onnenpäivät ja poissaolot EIVÄT ole enää täällä
// vakioina vaan tulevat sisään `KuukaudenSyote`na Drive-taulukosta
// ([shifts/tyovuoroExcel.ts](src/lib/shifts/tyovuoroExcel.ts)). Uusi kuukausi
// ei siis enää vaadi koodimuutosta — Albin täyttää taulukon.
//
// ⚠️ Tässä tiedostossa EI SAA OLLA ajonaikaisia importteja (`import type` on
// ok, se katoaa käännöksessä). Syy: golden-testi ajetaan `node --test`illä
// suoraan TypeScriptiä vastaan, ja Noden ESM-resolveri ei osaa
// extensiotonta `./polku`-muotoa jota Next taas vaatii. Ilman importteja
// molemmat toimivat. Ks. src/lib/shifts/tyovuoroExcel.ts.

export type StoreName = 'Malmi' | 'Easton' | 'Kivistö'
export const STORES: StoreName[] = ['Malmi', 'Easton', 'Kivistö']

/** Taulukon myymäläsarakkeen taustaväri normaalipäivänä. */
export const STORE_COLORS: Record<StoreName, string> = {
  Malmi: '#fecaca',
  Easton: '#fed7aa',
  Kivistö: '#fef08a',
}

/** Onnenpäivän / oman myymälän tapahtuman kirkas väri. */
export const STORE_SOLO_COLORS: Record<StoreName, string> = {
  Malmi: '#e06666',
  Easton: '#f6b26b',
  Kivistö: '#ffff00',
}

export const STORE_MANAGERS: Record<StoreName, string> = {
  Malmi: 'Arbnor Rashica',
  Easton: 'Alec Fambro',
  Kivistö: 'Joona Huttunen',
}

export const MANAGER_NAMES = [STORE_MANAGERS.Malmi, STORE_MANAGERS.Easton, STORE_MANAGERS.Kivistö]

/**
 * Vladimirilla on kova aikarajoite, ks. `sopiiVuoro`. Nimi on omana vakionaan
 * koska siihen viitataan neljästä kohdasta.
 */
export const VLADIMIR = 'Vladimir Kogan'

export const FULL_TIME_SELLERS = [
  'Krenar Bajqinovci', 'Kasperi Kemppainen', VLADIMIR, 'Hamza Hanif', 'Lauri Ukkonen',
]

export const ANTTI = 'Antti Kiljala'
export const RAMIN = 'Ramin Kadiri'
export const ALBIN = 'Albin Rashica'
export const PART_TIME_SELLERS = [ANTTI, RAMIN]

/** Kalenterinäkymän sarakejärjestys: päälliköt, kokoaikaiset, osa-aikaiset, viimeinen keino. */
export const ROSTER_COLUMNS = [
  ...MANAGER_NAMES,
  ...FULL_TIME_SELLERS,
  ANTTI,
  RAMIN,
  ALBIN,
]

// ===================== Kiintiöt =====================
//
// Kukaan ei tee täyttä kuuden vuoron viikkoa — vähintään yksi vapaapäivä.
export const MAX_SHIFTS_PER_WEEK = 5
/**
 * Antin viikkokatto — ja samalla se määrä jonka hän saa Kivistössä **ennen
 * kokoaikaisia**.
 *
 * Antti ei ole hätävara vaan osa-aikainen jolle kuuluu vuoroja; **Albin on
 * hätävara**. Ilman etuoikeutta kokoaikaiset ehtivät täyttää Kivistön kaikki
 * 48 kuukausivuoroa ennen häntä, jolloin hän jää nollaan ja Albin tekee
 * tunteja samaan aikaan kun Antti ei tee yhtään — juuri väärin päin.
 *
 * Etuoikeus ja katto ovat tarkoituksella sama luku: erillinen pienempi
 * etuoikeus jätti syyskuuhun vajeita (18.9. ja 25.9. Malmi 3/4) ja nosti
 * Albinin tunnit kolminkertaisiksi.
 */
export const ANTTI_MAX_SHIFTS_PER_WEEK = 3
/**
 * Raminin viikkokatto. Neljä (ei kolme) on tahallinen: se pitää hänet
 * 60–80 h/kk tuntumassa. Syyskuun 2026 referenssillä tulos on 82 h eli
 * kaksi tuntia yli tavoitehaarukan — tämä on tiedossa ja hyväksytty, koska
 * haarukka on tavoite eikä kova raja ja referenssin tulos on se lista joka
 * oikeasti toimi. Jos tätä lasketaan, syyskuun golden-testi ei enää täsmää.
 */
export const RAMIN_MAX_SHIFTS_PER_WEEK = 4
/**
 * Vladimirin viikkokatto. Neljä on hänen oma rajoitteensa eikä tuntitasausta:
 * hänen mahdollisia päiviään on viikossa tasan neljä (ti, to, pe, la), joten
 * katto ja käytettävissä olevat päivät osuvat yksiin. Ks. `sopiiVuoro`.
 */
export const VLADIMIR_MAX_SHIFTS_PER_WEEK = 4
/** Montako toisen myymälän paikkausvuoroa päällikkö voi ottaa viikossa. */
export const MANAGER_CROSS_CAP = 2

export interface Shift {
  store: StoreName
  seller: string
  start: string // HH:MM
  end: string // HH:MM
  hours: number
  label: string // 'aamu' | 'väli' | 'ilta' | 'lyhyt' | 'la' | 'OP'
  /** Onnenpäivän / oman myymälän tapahtuman soolovuoro — värjätään kirkkaasti. */
  solo?: boolean
}

export interface DayInfo {
  date: string // YYYY-MM-DD
  weekday: number // 0=su ... 6=la
  closed: boolean
  /** Tapahtumat-sarakkeen teksti sellaisenaan (myös muiden myymälöiden). */
  note?: string
  /** Myymälät joissa on onnenpäivä/oma tapahtuma → vain päällikkö töissä. */
  soloStores: StoreName[]
  /** Poissaolot: myyjä → taulukkoon kirjoitettu selite ("Nizza", "loma"). */
  absences: Record<string, string>
  shifts: Shift[]
}

// ===================== Lukijan syöte =====================

export interface PaivanSyote {
  date: string // YYYY-MM-DD
  /** Tapahtumat-sarakkeen (AR) merkinnät, myös muiden myymälöiden. */
  tapahtumat: string[]
  /** Myymälät joissa on onnenpäivä tai oman myymälän tapahtuma. */
  soloMyymalat: StoreName[]
  poissaolot: { seller: string; label: string }[]
}

export interface KuukaudenSyote {
  vuosi: number
  kuukausi: number // 1-12
  paivat: PaivanSyote[]
}

export interface Vaje {
  date: string
  weekday: number
  store: StoreName
  saatu: number
  tarve: number
}

export interface GenerointiTulos {
  days: DayInfo[]
  /** Täyttämättä jääneet paikat. Tyhjä solu jonka voi ohittaa on
   *  vaarallisempi kuin näkyvä varoitus, joten tämä kuuluu käyttöliittymään. */
  vajeet: Vaje[]
  /** Myyjä → kuukauden tunnit. */
  tunnit: Record<string, number>
  /** Myyjä → kuukauden vuorojen määrä. */
  vuorot: Record<string, number>
}

// ===================== Vuoropohjat =====================

interface ShiftTemplate { label: string; start: string; end: string }

/** Tiistai, keskiviikko, torstai. */
const BASE_SHIFTS: Record<StoreName, ShiftTemplate[]> = {
  Malmi: [
    { label: 'aamu', start: '10:00', end: '16:00' },
    { label: 'väli', start: '11:00', end: '18:00' },
    { label: 'ilta', start: '13:00', end: '19:00' },
  ],
  Easton: [
    { label: 'aamu', start: '10:00', end: '17:00' },
    { label: 'ilta', start: '12:00', end: '19:00' },
  ],
  Kivistö: [
    { label: 'aamu', start: '10:00', end: '17:00' },
    { label: 'ilta', start: '12:00', end: '19:00' },
  ],
}

/**
 * Maanantai ja perjantai: viikon kiireisimmät päivät, Malmilla neljä ja
 * Eastonilla kolme henkeä. Kivistö pysyy kahdessa, joten sillä ei ole omaa
 * riviä täällä — `templatesFor` putoaa sen kohdalla `BASE_SHIFTS`iin.
 */
const MAPE_SHIFTS: Partial<Record<StoreName, ShiftTemplate[]>> = {
  Malmi: [
    { label: 'aamu', start: '10:00', end: '16:00' },
    { label: 'väli', start: '12:00', end: '18:00' },
    { label: 'ilta', start: '14:00', end: '19:00' },
    { label: 'lyhyt', start: '10:00', end: '14:00' },
  ],
  Easton: [
    { label: 'aamu', start: '10:00', end: '17:00' },
    { label: 'ilta', start: '12:00', end: '19:00' },
    { label: 'lyhyt', start: '10:00', end: '14:00' },
  ],
}

/**
 * Lauantai: Malmilla kaksi limittäistä vuoroa, Eastonilla ja Kivistöllä yksi
 * koko päivän vuoro.
 *
 * Malmin 10–14 ja 12–16 menevät päällekkäin klo 12–14, eli kaksi myyjää on
 * yhtä aikaa paikalla juuri lauantain vilkkaimpaan aikaan. Easton ja Kivistö
 * pärjäävät yhdellä, joten lauantain kokonaistarve on neljä vuoroa aiemman
 * seitsemän sijaan — se vapauttaa kapasiteettia arkeen, jossa miehitys on
 * tiukempi.
 */
const SATURDAY_SHIFTS: Record<StoreName, ShiftTemplate[]> = {
  Malmi: [
    { label: 'la', start: '10:00', end: '14:00' },
    { label: 'la', start: '12:00', end: '16:00' },
  ],
  Easton: [{ label: 'la', start: '10:00', end: '16:00' }],
  Kivistö: [{ label: 'la', start: '10:00', end: '16:00' }],
}

const OP_WEEKDAY_SHIFT: ShiftTemplate = { label: 'OP', start: '10:00', end: '19:00' }
const OP_SATURDAY_SHIFT: ShiftTemplate = { label: 'OP', start: '10:00', end: '17:00' }

/**
 * Antti tekee vain Kivistöä.
 *
 * Hän on osa-aikainen paikkaaja, mutta paikkaus ei saa tarkoittaa mitä tahansa
 * myymälää: Malmi ja Easton eivät ole hänelle vaihtoehtoja. Rajaus on siksi
 * varajärjestyksessä (`fallbackFor`) eikä pelkkänä toiveena — muuten hän
 * päätyisi Malmille aina kun vaje sattuu sinne.
 */
const ANTTI_STORE: StoreName = 'Kivistö'

// ===================== Myyjäkohtaiset aikarajoitteet =====================
//
// Vahvistettu Albinilta 26.8.2026. Nämä ovat sääntöjä, eivät toiveita:
// generaattori EI saa sijoittaa Vladimiria aamuvuoroon edes silloin kun päivä
// jäisi muuten vajaaksi. **Vaje on hyväksyttävämpi kuin sääntörikko** — vaje
// näkyy käyttöliittymässä varoituksena, sääntörikko ei näy kenellekään ennen
// kuin Vladimir soittaa.

/** Vladimirin päivät: 2=ti, 4=to, 5=pe, 6=la. Ma ja ke eivät ole hänen. */
const VLADIMIR_DAYS = [2, 4, 5, 6]
/** Arkena vain klo 12 tai myöhemmin alkavat vuorot. Lauantaina 10–16 käy. */
const VLADIMIR_EARLIEST_WEEKDAY_START = '12:00'

/**
 * Kelpaako tämä vuoro tälle myyjälle.
 *
 * Tarkistus tarvitsee **vuoron alkuajan**, ei pelkkää päivää ja myyjää —
 * siksi `fallbackFor` saa vuoropohjan parametrina eikä valitse myyjää ennen
 * kuin kellonaika on tiedossa.
 *
 * Vertailu tehdään merkkijonona: nollatäytetty 'HH:MM' on merkkijonoina
 * samassa järjestyksessä kuin ajallisesti (sama päättely kuin
 * [time.ts](src/lib/arxcian/time.ts):n ISO-paikallisajoilla).
 */
export function sopiiVuoro(seller: string, weekday: number, start: string): boolean {
  if (seller !== VLADIMIR) return true
  if (!VLADIMIR_DAYS.includes(weekday)) return false
  if (weekday === 6) return true
  return start >= VLADIMIR_EARLIEST_WEEKDAY_START
}

// ===================== Viikkoankkurit =====================
//
// Jokainen ankkuroitava kokoaikainen saa yhden myymälän ja yhden vuorotyypin
// koko viikoksi, jottei sama henkilö vaihda paikkaa ja aikaa päivittäin.
// Ylimääräiset jäävät viikon "swingiksi" eli joustavaksi paikkaajaksi.
// Kuka saa minkäkin ankkurin, ratkeaa Malmi-kertymästä (ks. WeekPlan).
//
// ⚠️ **Jokainen ankkuripaikka on aamuvuoro** (aikaisin alku 10:00, myöhäisin
// Malmi idx 1 ma/pe klo 12:00). Vladimir ei siis voi olla ankkuri: hänen
// ankkuripaikkansa jäisi tyhjäksi joka viikko ja hän itse jäisi melkein
// kokonaan listalta. Siksi `WeekPlan` jakaa ankkurit vain `ANCHORABLE`-
// listalle. Tämä ei ole ilmeinen koodia lukemalla ja rikkoutuu ensimmäisenä
// kun ankkurilogiikkaa "yksinkertaistetaan".
type AnchorSlot = { store: StoreName; templateIndex: number }
const ANCHOR_SLOTS: AnchorSlot[] = [
  { store: 'Malmi', templateIndex: 0 },
  { store: 'Malmi', templateIndex: 1 },
  { store: 'Easton', templateIndex: 0 },
  { store: 'Kivistö', templateIndex: 0 },
]

/**
 * Ketkä voivat saada viikkoankkurin. Vladimir on rajattu ulos yllä kuvatusta
 * syystä — hän toimii vapaana täydentäjänä `sopiiVuoro`-tarkistuksen kautta.
 *
 * Neljä ankkuroitavaa ja neljä ankkuripaikkaa tarkoittaa ettei erillistä
 * swing-myyjää synny. Mekanismia ei silti poisteta: se herää itsestään jos
 * kokoaikaisia joskus on kuusi.
 */
const ANCHORABLE = FULL_TIME_SELLERS.filter(s => s !== VLADIMIR)

// ===================== Apurit =====================

export function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 30) / 2
}

function templatesFor(store: StoreName, weekday: number): ShiftTemplate[] {
  if (weekday === 1 || weekday === 5) {
    const mape = MAPE_SHIFTS[store]
    if (mape) return mape
  }
  return BASE_SHIFTS[store]
}

/** Montako henkeä myymälään tarvitaan tänä päivänä. */
export function headcountFor(store: StoreName, weekday: number, soloStores: StoreName[]): number {
  if (soloStores.includes(store)) return 1
  if (weekday === 6) return SATURDAY_SHIFTS[store].length
  return templatesFor(store, weekday).length
}

/**
 * Täyttämättä jääneet paikat.
 *
 * Johdetaan valmiista `DayInfo[]`:stä eikä generoinnin sisäisestä tilasta,
 * jotta **käsin muokattu luonnos laskee vajeet samalla säännöllä** kuin
 * generaattori. Kaksi eri laskentaa ajautuisi erilleen juuri silloin kun
 * ero on vaarallisin: käyttäjä on itse poistanut vuoron eikä varoitus
 * päivity.
 */
export function laskeVajeet(days: DayInfo[]): Vaje[] {
  const vajeet: Vaje[] = []
  for (const day of days) {
    if (day.closed) continue
    for (const store of STORES) {
      const saatu = day.shifts.filter(s => s.store === store).length
      const tarve = headcountFor(store, day.weekday, day.soloStores)
      if (saatu < tarve) vajeet.push({ date: day.date, weekday: day.weekday, store, saatu, tarve })
    }
  }
  return vajeet
}

/** Myyjä → kuukauden tunnit ja vuorojen määrä. */
export function laskeTunnit(days: DayInfo[]): { tunnit: Record<string, number>; vuorot: Record<string, number> } {
  const tunnit: Record<string, number> = {}
  const vuorot: Record<string, number> = {}
  for (const day of days) {
    for (const s of day.shifts) {
      tunnit[s.seller] = (tunnit[s.seller] ?? 0) + s.hours
      vuorot[s.seller] = (vuorot[s.seller] ?? 0) + 1
    }
  }
  return { tunnit, vuorot }
}

function dateStr(vuosi: number, kuukausi: number, paiva: number): string {
  return `${vuosi}-${String(kuukausi).padStart(2, '0')}-${String(paiva).padStart(2, '0')}`
}

/**
 * Yhden viikon tila: ankkurit, swing, käytetyt vuorot ja kertyneet tunnit.
 *
 * Tuntikirjanpito on koko kuukauden mittainen (`ledger`) mutta vuorolaskurit
 * viikkokohtaisia, siksi ledger annetaan konstruktorille eikä luoda tässä.
 */
class WeekPlan {
  private shiftCount: Record<string, number> = {}
  private crossCount: Record<string, number> = {}
  anchors: Record<string, AnchorSlot> = {}
  swing: string | null = null
  // Huom. kentät kirjoitetaan auki eikä konstruktorin parametriominaisuuksina
  // (`constructor(private ledger: …)`): parametriominaisuus ei ole pelkkä
  // tyyppimerkintä vaan generoi koodia, jolloin Noden type stripping
  // hylkäisi tiedoston eikä golden-testiä voisi ajaa ilman käännösvaihetta.
  private ledger: Record<string, number>
  private absences: Map<string, Set<string>>
  private malmi: Record<string, number>

  constructor(
    ledger: Record<string, number>,
    absences: Map<string, Set<string>>, malmi: Record<string, number>,
  ) {
    this.ledger = ledger
    this.absences = absences
    this.malmi = malmi

    // Ankkuripaikat jaetaan **Malmi-kertymän mukaan**, ei kiinteällä
    // kiertopointterilla. Malmi on paras myyntipaikka, joten sen kaksi
    // ankkuripaikkaa menevät niille kokoaikaisille joilla on vähiten Malmia
    // takanaan. Kiinteä +2-kierto jakoi Malmin tasan vasta viidessä viikossa
    // eikä lainkaan tasan yhden kuukauden sisällä.
    //
    // Viikkoankkuri itsessään säilyy: sama henkilö pysyy samassa myymälässä ja
    // vuorossa koko viikon, eikä pompi paikasta toiseen päivittäin.
    const jarjestys = [...ANCHORABLE].sort((a, b) =>
      (this.malmi[a] ?? 0) - (this.malmi[b] ?? 0)
      || (this.ledger[a] ?? 0) - (this.ledger[b] ?? 0)
      || ANCHORABLE.indexOf(a) - ANCHORABLE.indexOf(b))

    jarjestys.forEach((seller, i) => {
      if (i < ANCHOR_SLOTS.length) this.anchors[seller] = ANCHOR_SLOTS[i]
      else this.swing = seller
    })
  }

  used(seller: string): number {
    return this.shiftCount[seller] ?? 0
  }

  private capFor(seller: string): number {
    if (seller === ANTTI) return ANTTI_MAX_SHIFTS_PER_WEEK
    if (seller === RAMIN) return RAMIN_MAX_SHIFTS_PER_WEEK
    if (seller === VLADIMIR) return VLADIMIR_MAX_SHIFTS_PER_WEEK
    return MAX_SHIFTS_PER_WEEK
  }

  isAbsent(seller: string, date: string): boolean {
    return this.absences.get(date)?.has(seller) ?? false
  }

  canWork(seller: string, date: string): boolean {
    return !this.isAbsent(seller, date) && this.used(seller) < this.capFor(seller)
  }

  record(seller: string, cross: boolean) {
    this.shiftCount[seller] = this.used(seller) + 1
    if (cross) this.crossCount[seller] = this.crossUsed(seller) + 1
  }

  crossUsed(manager: string): number {
    return this.crossCount[manager] ?? 0
  }

  anchorFor(store: StoreName, templateIndex: number): string | undefined {
    return Object.entries(this.anchors)
      .find(([, slot]) => slot.store === store && slot.templateIndex === templateIndex)?.[0]
  }

  /** Vähiten tunteja tehnyt ensin — ilman tätä ero kokoaikaisten välillä
   *  kasvoi syyskuun kokeilussa 44 tuntiin kuukaudessa. */
  byHours(sellers: string[]): string[] {
    return [...sellers].sort((a, b) => (this.ledger[a] ?? 0) - (this.ledger[b] ?? 0))
  }

  /**
   * Vähiten Malmia tehnyt ensin, tasapelissä vähiten tunteja tehnyt.
   *
   * Malmi on paras myyntipaikka, joten sen jako on oma tavoitteensa: pelkkä
   * tuntitasaus jakaisi tunnit tasan mutta voisi jättää saman henkilön
   * kuukaudeksi Kivistöön. Tunnit ovat tässä toissijainen peruste, jotta
   * kahden yhtä monta Malmia tehneen välillä valinta ei ole mielivaltainen.
   */
  /**
   * Onko tällä myyjällä vähiten Malmi-vuoroja kaikista kokoaikaisista.
   *
   * Käytetään Vladimirin etuoikeuden rajaamiseen: kerroksittainen täyttö käy
   * myymälät indeksijärjestyksessä, jolloin Eastonin ilta (idx 1) tarjotaan
   * aina ennen Malmin iltaa (idx 2). Ilman tätä Vladimir tarttuu joka päivä
   * Eastoniin eikä koskaan ehdi Malmille — mitattu: 3 Malmi-vuoroa muiden
   * yhdentoista rinnalla, eli Malmin tasajako hajoaa.
   */
  malmiVahiten(seller: string): boolean {
    const oma = this.malmi[seller] ?? 0
    return FULL_TIME_SELLERS.every(s => s === seller || (this.malmi[s] ?? 0) > oma)
  }

  byMalmi(sellers: string[]): string[] {
    return [...sellers].sort((a, b) =>
      (this.malmi[a] ?? 0) - (this.malmi[b] ?? 0)
      || (this.ledger[a] ?? 0) - (this.ledger[b] ?? 0))
  }
}

// ===================== Generaattori =====================

export function generateMonth(
  vuosi: number, kuukausi: number, syote: KuukaudenSyote,
): GenerointiTulos {
  const daysInMonth = new Date(vuosi, kuukausi, 0).getDate()

  // Syöte päivittäin haettavaksi.
  const syotePerDate = new Map<string, PaivanSyote>()
  for (const p of syote.paivat) syotePerDate.set(p.date, p)

  const absences = new Map<string, Set<string>>()
  for (const p of syote.paivat) {
    absences.set(p.date, new Set(p.poissaolot.map(a => a.seller)))
  }

  const ledger: Record<string, number> = {}
  const vuorot: Record<string, number> = {}
  // Myyjä → montako Malmin vuoroa kertynyt. Malmi on paras myyntipaikka,
  // joten sen jakautuminen on oma tavoitteensa eikä johdu tunneista.
  const malmiCount: Record<string, number> = {}
  const byDate = new Map<string, DayInfo>()

  // Päivät viikoittain (maanantai-avain), jotta viikkokiintiöt ja ankkurit
  // pysyvät viikon sisällä. Avaimet kerätään omaan taulukkoonsa: päivät
  // käydään läpi nousevassa järjestyksessä, joten lisäysjärjestys on jo
  // aikajärjestys eikä erillistä lajittelua tarvita.
  const weeks = new Map<string, number[]>()
  const weekKeys: string[] = []
  for (let paiva = 1; paiva <= daysInMonth; paiva++) {
    const d = new Date(vuosi, kuukausi - 1, paiva)
    const iso = d.getDay() === 0 ? 7 : d.getDay()
    const monday = new Date(vuosi, kuukausi - 1, paiva - (iso - 1))
    const key = `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`
    if (!weeks.has(key)) {
      weeks.set(key, [])
      weekKeys.push(key)
    }
    weeks.get(key)!.push(paiva)
  }

  // Lauantai käsitellään viikon sisällä ENSIN. Muuten kokoaikaisten viisi
  // viikkovuoroa kuluvat arkeen eikä lauantaille jää ketään.
  const WEEK_ORDER = [6, 1, 2, 3, 4, 5, 0]

  weekKeys.forEach(wk => {
    const plan = new WeekPlan(ledger, absences, malmiCount)
    const paivat = weeks.get(wk)!
    for (const wd of WEEK_ORDER) {
      for (const paiva of paivat) {
        const d = new Date(vuosi, kuukausi - 1, paiva)
        if (d.getDay() !== wd) continue
        const date = dateStr(vuosi, kuukausi, paiva)
        byDate.set(date, buildDay(date, wd, plan, syotePerDate.get(date), ledger, vuorot, malmiCount))
      }
    }
  })

  const days: DayInfo[] = []
  for (let paiva = 1; paiva <= daysInMonth; paiva++) {
    days.push(byDate.get(dateStr(vuosi, kuukausi, paiva))!)
  }

  // Vajeet ja tunnit johdetaan valmiista listasta samoilla apureilla joita
  // käyttöliittymä käyttää muokkauksen jälkeen — näin luvut eivät voi
  // erota toisistaan.
  const { tunnit, vuorot: vuoroLkm } = laskeTunnit(days)
  return { days, vajeet: laskeVajeet(days), tunnit, vuorot: vuoroLkm }
}

function buildDay(
  date: string, weekday: number, plan: WeekPlan, syote: PaivanSyote | undefined,
  ledger: Record<string, number>, vuorot: Record<string, number>,
  malmiCount: Record<string, number>,
): DayInfo {
  const soloStores = syote?.soloMyymalat ?? []
  const absences: Record<string, string> = {}
  for (const a of syote?.poissaolot ?? []) absences[a.seller] = a.label
  const note = (syote?.tapahtumat ?? []).join(' · ') || undefined

  if (weekday === 0) {
    return { date, weekday, closed: true, note: note ?? 'Suljettu', soloStores, absences, shifts: [] }
  }

  const shifts: Shift[] = []
  const today = new Set<string>()

  const assign = (store: StoreName, seller: string, t: ShiftTemplate, solo = false, cross = false) => {
    const hours = hoursBetween(t.start, t.end)
    shifts.push({ store, seller, start: t.start, end: t.end, hours, label: t.label, ...(solo ? { solo: true } : {}) })
    today.add(seller)
    plan.record(seller, cross)
    ledger[seller] = (ledger[seller] ?? 0) + hours
    vuorot[seller] = (vuorot[seller] ?? 0) + 1
    if (store === 'Malmi') malmiCount[seller] = (malmiCount[seller] ?? 0) + 1
  }

  // 1. Onnenpäivä / oman myymälän tapahtuma: siihen myymälään VAIN päällikkö,
  //    muut sarakkeet jäävät tyhjiksi ja Albin täydentää tekijät itse.
  //    Soolovuoro on pakollinen — päällikkö merkitään vaikka viikkokiintiö
  //    olisi täynnä, siksi tässä ei kysytä `canWork`ilta kuin poissaoloa.
  for (const store of soloStores) {
    const mgr = STORE_MANAGERS[store]
    if (plan.isAbsent(mgr, date)) continue
    assign(store, mgr, weekday === 6 ? OP_SATURDAY_SHIFT : OP_WEEKDAY_SHIFT, true)
  }

  // ⚠️ Muut myymälät toimivat normaalisti samana päivänä. Aiempi toteutus
  //    palasi tässä kohti ja jätti KAIKKI muut myymälät miehittämättä
  //    (esim. 8.8. Kivistön onnenpäivä → Malmi ja Easton tyhjinä).
  const openStores = STORES.filter(s => !soloStores.includes(s))

  // 2. Lauantai: päälliköt vapaalla, myymälät täytetään kerroksittain kuten
  //    arkenakin — kaikkien myymälöiden ensimmäiset vuorot ennen Malmin toista.
  if (weekday === 6) {
    const maxLen = openStores.length
      ? Math.max(...openStores.map(s => SATURDAY_SHIFTS[s].length))
      : 0
    for (let idx = 0; idx < maxLen; idx++) {
      for (const store of openStores) {
        const templates = SATURDAY_SHIFTS[store]
        if (idx >= templates.length) continue
        const tmpl = templates[idx]
        const pool = store === 'Malmi'
          ? plan.byMalmi(FULL_TIME_SELLERS)
          : plan.byHours(FULL_TIME_SELLERS)
        // Vladimir on töissä JOKAISENA lauantaina — se on sääntö, ei
        // tuntitasauksen sivutuote, joten etuoikeus kirjoitetaan auki.
        // Lauantai käsitellään viikon sisällä ensin (WEEK_ORDER), joten hänen
        // viikkokiintiönsä on tässä aina vapaa ja ainoa este on poissaolo.
        //
        // Etuoikeus annetaan muualla kuin Malmilla: Malmin lauantaipaikat
        // jaetaan `byMalmi`lla omana tavoitteenaan, ja Easton/Kivistö 10–16 on
        // 6 h siinä missä Malmin lauantaivuorot ovat 4 h.
        const jono = store !== 'Malmi' && !today.has(VLADIMIR)
          ? [VLADIMIR, ...pool.filter(s => s !== VLADIMIR)]
          : pool
        const direct = jono.find(s =>
          !today.has(s) && plan.canWork(s, date) && sopiiVuoro(s, weekday, tmpl.start))
        const pick = direct ?? fallbackFor(date, weekday, today, plan, store, tmpl)?.seller
        if (!pick) continue
        assign(store, pick, tmpl)
      }
    }
    return { date, weekday, closed: false, note, soloStores, absences, shifts }
  }

  // 3. Arkipäivä: päälliköiden kiinteät paikat ensin.
  const taken = new Map<string, string>() // `${store}:${idx}` -> myyjä
  for (const { store, manager } of managerPlacements(weekday, soloStores)) {
    if (today.has(manager) || !plan.canWork(manager, date)) continue
    const templates = templatesFor(store, weekday)
    // Pisin VAPAA vuoro: keskiviikkoisin kolme päällikköä jakaa Malmin kolme
    // paikkaa, joten pelkkä "pisin" jättäisi kolmannen kokonaan pois.
    const order = templates
      .map((t, i) => ({ i, h: hoursBetween(t.start, t.end) }))
      .sort((a, b) => b.h - a.h || a.i - b.i)
    const slot = order.find(({ i }) => !taken.has(`${store}:${i}`))
    if (!slot) continue
    taken.set(`${store}:${slot.i}`, manager)
    today.add(manager)
    plan.record(manager, false)
    const t = templates[slot.i]
    ledger[manager] = (ledger[manager] ?? 0) + hoursBetween(t.start, t.end)
    vuorot[manager] = (vuorot[manager] ?? 0) + 1
    if (store === 'Malmi') malmiCount[manager] = (malmiCount[manager] ?? 0) + 1
  }

  // 4. Loput paikat KERROKSITTAIN: kaikkien myymälöiden ensimmäiset vuorot,
  //    sitten toiset, sitten kolmannet. Myymälä kerrallaan täyttäminen
  //    kaataisi koko vajeen viimeisen myymälän niskaan ja jättäisi sen
  //    miehittämättä — näin jokainen ehtii saada ainakin avaajan.
  const maxLen = openStores.length
    ? Math.max(...openStores.map(s => templatesFor(s, weekday).length))
    : 0
  for (let idx = 0; idx < maxLen; idx++) {
    for (const store of openStores) {
      const templates = templatesFor(store, weekday)
      if (idx >= templates.length) continue
      const tmpl = templates[idx]

      const mgr = taken.get(`${store}:${idx}`)
      if (mgr) {
        // Päällikkö on jo kirjattu vaiheessa 3 — tässä vain lisätään vuoro.
        shifts.push({ store, seller: mgr, start: tmpl.start, end: tmpl.end, hours: hoursBetween(tmpl.start, tmpl.end), label: tmpl.label })
        continue
      }

      const anchor = plan.anchorFor(store, idx)
      // Kelpoisuus tarkistetaan myös ankkurilta. Vladimir ei voi olla ankkuri
      // (ks. ANCHORABLE), joten ehto ei nykyisellään koskaan hylkää mitään —
      // se on tässä siltä varalta että ankkuripaikkoja joskus muutetaan.
      if (anchor && !today.has(anchor) && plan.canWork(anchor, date)
          && sopiiVuoro(anchor, weekday, tmpl.start)) {
        assign(store, anchor, tmpl)
        continue
      }

      const fb = fallbackFor(date, weekday, today, plan, store, tmpl)
      if (fb) assign(store, fb.seller, tmpl, false, fb.cross)
    }
  }

  return { date, weekday, closed: false, note, soloStores, absences, shifts }
}

/**
 * Päälliköiden kiinteät paikat. Päälliköt ovat töissä ma–pe, eivät
 * lauantaisin (ellei lauantaina ole onnenpäivää/tapahtumaa, jolloin
 * soolovuoro hoitui jo vaiheessa 1).
 *
 * ma, ti, to, pe omassa myymälässä — **keskiviikkona kaikki kolme Malmilla**,
 * jotta Arbnor näkee Joonan ja Alecin joka viikko. Tämä on ehdoton sääntö,
 * ei toive. Soolomyymälän päällikkö on kuitenkin aina omassa myymälässään,
 * joten keskiviikon kolmikko täydentyy vain niistä jotka ovat vapaana.
 */
function managerPlacements(
  weekday: number, soloStores: StoreName[],
): { store: StoreName; manager: string }[] {
  const out: { store: StoreName; manager: string }[] = []
  const used = new Set<string>()

  for (const store of soloStores) {
    used.add(STORE_MANAGERS[store])
  }
  if (weekday === 6 || weekday === 0) return out

  if (weekday === 3) {
    if (!soloStores.includes('Malmi')) {
      for (const store of STORES) {
        const mgr = STORE_MANAGERS[store]
        if (!used.has(mgr)) out.push({ store: 'Malmi', manager: mgr })
      }
    }
    return out
  }

  for (const store of STORES) {
    const mgr = STORE_MANAGERS[store]
    if (used.has(mgr) || soloStores.includes(store)) continue
    out.push({ store, manager: mgr })
  }
  return out
}

/**
 * Varajärjestys tyhjälle paikalle. Vajeen paikkausjärjestys on
 * **Ramin → Antti → Albin**, ja kokoaikaiset ennen niitä:
 *
 *  1. Viikon swing — hän on jo se joustava rooli. Nykyisellä myyjälistalla
 *     tätä ei synny: ankkuroitavia on neljä ja ankkuripaikkoja neljä.
 *
 * Jokainen haara suodatetaan `sopiiVuoro`lla, joten Vladimir tulee valituksi
 * vain vuoroihin jotka kelpaavat hänelle — hän kulkee kohdan 3 kautta, jossa
 * matalat tunnit nostavat hänet luonnostaan kärkeen.
 *  2. Ramin, jos hänellä on alle kaksi vuoroa viikossa. Hän on osa-aikainen
 *     eikä hätävara: ilman tätä hän jää 60–80 h tavoitteen alle.
 *  3. Muu kokoaikainen, vähiten tunteja tehnyt ensin.
 *  4. Ramin (loput vuorot kattoon asti).
 *  5. Toisen myymälän päällikkö, enintään MANAGER_CROSS_CAP/vko.
 *  6. Antti (max 3/vko).
 *  7. Albin viimeisenä keinona — häntä ei rajoita viikkokiintiö, vain poissaolo.
 */
function fallbackFor(
  date: string, weekday: number, today: Set<string>, plan: WeekPlan,
  store: StoreName, tmpl: ShiftTemplate,
): { seller: string; cross: boolean } | null {
  // Kelpaako ehdokas tähän nimenomaiseen vuoroon. Vuoropohja on parametrina
  // juuri tämän takia: myyjää ei voi valita ennen kuin alkuaika on tiedossa.
  const kelpaa = (seller: string) => sopiiVuoro(seller, weekday, tmpl.start)

  if (plan.swing && !today.has(plan.swing) && plan.canWork(plan.swing, date)
      && kelpaa(plan.swing)) {
    return { seller: plan.swing, cross: false }
  }

  // Rajoitetuin ensin: Vladimir kelpaa vain neljänä päivänä ja vain klo 12
  // jälkeen alkaviin vuoroihin, kun taas Ramin ja Antti käyvät mihin tahansa
  // aikaan. Jos joustavat ehtivät ensin, Vladimirin kelvolliset vuorot on jo
  // jaettu eikä hänelle jää mitään — mitattu: ilman tätä hän jää 86 tuntiin ja
  // Antti nousee 105:een, eli osa-aikainen tekee enemmän kuin kokoaikainen.
  //
  // Hän myös peri viikon swing-roolin: ankkurit menevät neljälle muulle, joten
  // hän ON se joustava paikkaaja — omalla aikaikkunallaan.
  //
  // Etuoikeutta ei kuitenkaan käytetä muualla kuin Malmilla silloin kun hän on
  // Malmi-kertymässä viimeisenä: Malmin tasajako on oma tavoitteensa, ja
  // ilman tätä rajausta hän jää Eastonin illaksi koko kuukaudeksi. Väistäessään
  // hän ei jää tyhjäksi vaan tulee valituksi alempaa kokoaikaisten joukosta —
  // tyypillisesti juuri saman päivän Malmin iltavuoroon.
  if (!today.has(VLADIMIR) && plan.canWork(VLADIMIR, date) && kelpaa(VLADIMIR)
      && (store === 'Malmi' || !plan.malmiVahiten(VLADIMIR))) {
    return { seller: VLADIMIR, cross: false }
  }

  if (!today.has(RAMIN) && plan.used(RAMIN) < 2 && plan.canWork(RAMIN, date)
      && kelpaa(RAMIN)) {
    return { seller: RAMIN, cross: false }
  }

  // Antti Kivistöön ennen kokoaikaisia, samalla periaatteella kuin Ramin.
  // Ilman tätä hän jää nollaan: Kivistössä on 48 vuoroa kuukaudessa, mutta
  // kokoaikaiset ehtivät täyttää ne kaikki ennen kuin varajärjestys pääsee
  // hänen kohdalleen — varsinkin sen jälkeen kun lauantai kevennettiin
  // neljään vuoroon eikä kapasiteetti enää lopu kesken.
  if (store === ANTTI_STORE && !today.has(ANTTI)
      && plan.canWork(ANTTI, date) && kelpaa(ANTTI)) {
    return { seller: ANTTI, cross: false }
  }

  // Malmin paikkaan valitaan vähiten Malmia tehnyt, muualle vähiten tunteja
  // tehnyt. Ilman tätä Malmi kasautuisi sille jolla sattuu olemaan tunteja
  // vähiten, eikä paras myyntipaikka jakautuisi tasan.
  const jarjestys = store === 'Malmi'
    ? plan.byMalmi(FULL_TIME_SELLERS)
    : plan.byHours(FULL_TIME_SELLERS)
  const fullTimer = jarjestys.find(s =>
    !today.has(s) && plan.canWork(s, date) && kelpaa(s))
  if (fullTimer) return { seller: fullTimer, cross: false }

  if (!today.has(RAMIN) && plan.canWork(RAMIN, date) && kelpaa(RAMIN)) {
    return { seller: RAMIN, cross: false }
  }

  for (const home of STORES) {
    const mgr = STORE_MANAGERS[home]
    if (home === store || today.has(mgr)) continue
    if (!plan.canWork(mgr, date) || !kelpaa(mgr)) continue
    if (plan.crossUsed(mgr) >= MANAGER_CROSS_CAP) continue
    return { seller: mgr, cross: true }
  }

  for (const cand of [ANTTI, ALBIN]) {
    if (today.has(cand) || plan.isAbsent(cand, date)) continue
    if (!kelpaa(cand)) continue
    // Antti tekee vain Kivistöä — Malmin tai Eastonin vaje ei ole hänen
    // paikattavissaan, vaikka hänellä olisi viikkokiintiötä jäljellä.
    if (cand === ANTTI && store !== ANTTI_STORE) continue
    if (cand !== ALBIN && !plan.canWork(cand, date)) continue
    return { seller: cand, cross: false }
  }
  return null
}
