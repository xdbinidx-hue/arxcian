import { isStandi, shouldSkip, FSEC_TOTAL_SELLER, FSEC_INTERNET_SELLER, RJ_MOB_SELLERS } from './rjmob.ts'

/**
 * "Myyjät Myymälöittäin" -välilehden jäsennys **ilman Drive-yhteyttä**.
 *
 * Eriytetty omaksi moduulikseen samasta syystä kuin
 * [rjmobTavoiteTaulukko.ts](rjmobTavoiteTaulukko.ts): sarakehaku, myymälöiden
 * rajaus ja kassakatteen asteikko ovat juuri ne kohdat jotka menevät hiljaa
 * pieleen, ja ne on voitava testata ilman verkkoa. I/O on
 * [rjmobSheets.ts](rjmobSheets.ts):ssä.
 */

/**
 * Kuukausi josta alkaen liittymät, F-Secure ja kassakate luetaan **yhdestä
 * paikasta**: "Myyjät Myymälöittäin" -välilehdeltä (Albinin päätös 1.9.2026).
 *
 * **Raja on olemassa jottei historia muutu takautuvasti.** Elokuu 2026 ja sitä
 * vanhemmat kuukaudet lasketaan täsmälleen kuten ennen: myymälän luku luetaan
 * välilehden omalta yhteenvetoriviltä ja myyjän kassakate "Kassamyynti"
 * -välilehden `Kate(alv0)`-sarakkeesta. Kumpikin polku elää yhä
 * `rjmobSheets.ts`:ssä, eikä uusi lukutapa saa vuotaa niiden yli.
 */
export const UUSI_LUKULAHDE_ALKAEN = 202609

/**
 * Kassakatteen asteikko: lähteen sarake × 10.
 *
 * Välilehden `Kassakate`-sarake on **myyjän asteikolla** eli sama luku kuin
 * "Kassamyynti"-välilehden sivupaneelin `Kate myyjä` (= `Kate(alv0)` ÷ 10).
 * Elokuussa 2026 Malmin sarake lukee `303,00`, kun saman työkirjan
 * Tavoitteet-välilehti antaa Malmille tavoitteeksi `4 000,00 €` ja
 * `Kate(alv0)` yhteensä on `15 104,95 €`. Näytettävä kassakate on siis
 * `303,00 × 10 = 3 030,00 €` — ilman kerrointa "% tavoitteesta" olisi
 * kymmenesosa todellisesta.
 *
 * Kerroin on tässä yhtenä nimettynä lukuna eikä hajallaan kutsujissa, ja
 * `rjmobMyymalaTaulukko.test.mts` kiinnittää sen elokuun 2026 Malmin lukuun.
 * Vahvistettu Albinilta 1.9.2026.
 */
export const KASSAKATE_KERROIN = 10

/** RJ-Mobin viisi myymälää. Tunnistus osajonolla, koska kustannuspaikan
 *  kirjoitusasu vaihtelee ("Lahti, Prisma Holma", "Prisma Holma"). */
const RJ_MYYMALAT: { avain: string; osumat: string[] }[] = [
  { avain: 'Helsinki, Malmi', osumat: ['malmi'] },
  { avain: 'Helsinki, Easton', osumat: ['easton'] },
  { avain: 'Vantaa, Kivistö', osumat: ['kivistö', 'kivisto'] },
  { avain: 'Lahti, Holma', osumat: ['holma'] },
  { avain: 'Lahti, Syke', osumat: ['syke'] },
]

/**
 * Kustannuspaikan normalisoitu nimi, tai `null` kun se ei ole RJ-Mobin
 * myymälä. `null` on tässä tulos eikä puute: välilehti kattaa koko
 * organisaation, ja muut myymälät kuuluvat omaan eräänsä.
 */
export function myymalaAvain(kustannuspaikka: string): string | null {
  const k = kustannuspaikka.toLowerCase()
  return RJ_MYYMALAT.find(m => m.osumat.some(o => k.includes(o)))?.avain ?? null
}

export type MyymalaSarakkeet = {
  liittKpl: number
  liittEur: number
  kassakate: number
  fsecTotal: number
  fsecInternet: number
  fsecKpl: number
  tunnit: number
  /** DNA-uusmyynti. Ei kuulu odotettuihin sarakkeisiin — puuttuminen ei ole puute. */
  dnaUusmyynti: number
}

export type Era = {
  liittKpl: number
  liittEur: number
  fsecKpl: number
  /**
   * F-Securen lajijakauma säilyy erikseen kappalemäärän rinnalla, koska
   * `laskeMyyja` johtaa RJ-Mobin oman kertaprovision siitä. Ilman jakaumaa se
   * putoaisi likiarvoon (myyjän provisio × 10/7), joka on tarkka vain kun
   * kaikki lisenssit ovat samaa lajia.
   */
  fsecTotalKpl: number
  fsecInternetKpl: number
  fsecEur: number
  /** Kassakate euroina, eli lähteen sarake × `KASSAKATE_KERROIN`. */
  kassa: number
  /** Sama kassakate myyjän asteikolla (×1) — myymälän teho `myymalanTehot`ille. */
  kassaRjmob: number
  tunnit: number
}

/**
 * Rivit joita myymälätaulukko ei näytä, sekä se osa jonka se näyttää mutta
 * myyjätaulukko ei.
 *
 * **Nämä eivät saa kadota hiljaa.** Jos suodatin joskus menee rikki, tyhjä erä
 * on näkyvä oire; ilman erää rivit vain katoaisivat eikä mikään kertoisi että
 * myyntiä oli enemmän kuin taulukko näyttää.
 *
 * Erät ovat myös taulukoiden **täsmäytys**. Elokuu 2026, liittymät:
 *
 * ```
 * myymälät yhteensä 1430 = RJ-Mobin myyjät myymälöissä 1314 + vieraatMyymaloissa 116
 * myyjät yhteensä   1567 = RJ-Mobin myyjät myymälöissä 1314 + omatMuualla      253
 * koko välilehti    6457 = 1430 + standi 467 + muut 4560
 * ```
 */
export type Ulkopuoliset = {
  /**
   * Ständimyyjät (Jussi Kanerva, Esa Peltola) missä tahansa kustannuspaikassa.
   * Myyntiseuranta_ohje: ständi poistetaan aina myymälän tuloksista.
   */
  standi: Era
  /**
   * RJ-Mobin omien myyjien myynti viiden myymälän ulkopuolella — käytännössä
   * tapahtumat (Ylöjärvi, Jyväskylä). Tämä on myyjä- ja myymälätaulukon ero.
   */
  omatMuualla: Era
  /** Muiden myyjien myynti muissa kustannuspaikoissa. Ei kuulu RJ-Mobille. */
  muut: Era
  /**
   * Muiden kuin RJ-Mobin myyjien myynti **RJ-Mobin myymälöissä**.
   *
   * Tämä **sisältyy** myymälärivien lukuihin eikä ole vähennys: myymälän tulos
   * on myymälän tulos riippumatta siitä kenen tunnuksella se myytiin. Erä on
   * mukana vain jotta myymälä- ja myyjätaulukon ero on selitettävissä.
   */
  vieraatMyymaloissa: Era
  /** Mistä `omatMuualla` kertyi, suurin ensin. */
  paikat: { nimi: string; liittKpl: number; kassa: number; tunnit: number }[]
}

export type MyymalaSummat = {
  myymalat: Record<string, Era>
  ulkopuoliset: Ulkopuoliset
  /** Myymälän avain -> myyjän nimi -> tunnit. Ständimyyjät eivät ole mukana. */
  storeHours: Record<string, Record<string, number>>
}

export function tyhjaEra(): Era {
  return {
    liittKpl: 0, liittEur: 0, fsecKpl: 0, fsecTotalKpl: 0, fsecInternetKpl: 0,
    fsecEur: 0, kassa: 0, kassaRjmob: 0, tunnit: 0,
  }
}

function parseNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  // Lähdevälilehdellä miinusmerkkinä on toisinaan U+2212 (−) eikä ASCII-viivaa,
  // jolloin se riisuutuisi numeroksi kelpaamattomana ja negatiivinen kate
  // kääntyisi positiiviseksi.
  const n = parseFloat(String(v).replace(/−/g, '-').replace(',', '.').replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

function findCol(headers: string[], ...patterns: string[]): number {
  for (const p of patterns) {
    const idx = headers.findIndex(h => h.toLowerCase().includes(p.toLowerCase()))
    if (idx >= 0) return idx
  }
  return -1
}

// Kanoninen "Etunimi Sukunimi" -muoto RJ_MOB_SELLERS-parien perusteella.
const CANONICAL_NAME: Record<string, string> = {}
for (let i = 0; i + 1 < RJ_MOB_SELLERS.length; i += 2) {
  CANONICAL_NAME[RJ_MOB_SELLERS[i].toLowerCase()] = RJ_MOB_SELLERS[i]
  CANONICAL_NAME[RJ_MOB_SELLERS[i + 1].toLowerCase()] = RJ_MOB_SELLERS[i]
}

/**
 * Lähdesheetin oma hakukaava jättää joskus solun muotoon "Kadiri Ramin?Myyjän
 * tietoja ei löytynyt." — puretaan virheteksti pois ja katsotaan tunnistammeko
 * oikean nimen sen sijaan että hylkäisimme rivin ständinä.
 */
export function cleanUnmatchedName(raw: string): string {
  if (!raw.includes('?')) return raw
  const cleaned = raw.split('?')[0].trim()
  return CANONICAL_NAME[cleaned.toLowerCase()] ?? cleaned
}

/** Otsikkorivin indeksi, tai -1. Otsikko ei ole rivillä 0 kaikissa kopioissa. */
export function etsiOtsikkorivi(rows: string[][]): number {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some(c => {
      const s = c.toLowerCase()
      return s.includes('kassaprovisio') || s.includes('liittymäprovisio')
    })) return i
  }
  return -1
}

/**
 * Sarakkeet otsikon **nimen** perusteella, ei kiinteällä kirjaimella:
 * taulukkoa muokataan käsin ja kiinteä indeksi hajoaa hiljaa.
 *
 * Puuttuva sarake palautuu `puutteet`-listassa eikä nollana. Nolla näyttää
 * mitatulta tulokselta, puute ei — ja juuri kassakatteen nollautuminen olisi
 * se vika jonka huomaisi vasta kuukauden lopussa.
 */
export function lueSarakkeet(headerRow: string[]): { sarakkeet: MyymalaSarakkeet; puutteet: string[] } {
  const h = headerRow.map(s => s.toLowerCase().trim())
  const sarakkeet: MyymalaSarakkeet = {
    liittKpl: findCol(h, 'liittymä kpl', 'liittymäkpl', 'liittymät kpl'),
    liittEur: findCol(h, 'liittymäprovisio', 'liittymäprov'),
    // Vain "Kassakate" kelpaa: samalla välilehdellä on myös "Kassaprovisio",
    // joka on eri suure (maksettu provisio) eikä kate.
    kassakate: findCol(h, 'kassakate'),
    fsecTotal: findCol(h, 'f-secure total', 'fsecure total'),
    fsecInternet: findCol(h, 'f-secure internet', 'fsecure internet'),
    fsecKpl: findCol(h, 'f-secure kpl', 'fsecure kpl', 'fsec kpl'),
    tunnit: findCol(h, 'tunnit'),
    // Ei varakuviota pelkälle "uusmyynti"-osumalle: samalla välilehdellä on
    // myös "TELIA uusmyynti", joka osuisi siihen jos DNA-sarake puuttuisi.
    dnaUusmyynti: findCol(h, 'dna uusmyynti', 'dna-uusmyynti'),
  }

  const pakolliset: Partial<Record<keyof MyymalaSarakkeet, string>> = {
    liittKpl: 'Liittymä kpl',
    liittEur: 'Liittymäprovisio',
    kassakate: 'Kassakate',
    tunnit: 'Tunnit',
  }

  const puutteet: string[] = []
  for (const [avain, nimi] of Object.entries(pakolliset) as [keyof MyymalaSarakkeet, string][]) {
    if (sarakkeet[avain] < 0) puutteet.push(`Myyjät Myymälöittäin: sarake "${nimi}" puuttuu`)
  }
  // F-Securen kappaleet saa joko lajeittain tai yhteissarakkeesta, joten
  // yksittäinen puuttuva ei ole puute — vasta kaikkien kolmen puuttuminen.
  if (sarakkeet.fsecTotal < 0 && sarakkeet.fsecInternet < 0 && sarakkeet.fsecKpl < 0) {
    puutteet.push('Myyjät Myymälöittäin: yksikään F-Secure-sarake ei löytynyt')
  }

  return { sarakkeet, puutteet }
}

function lisaa(era: Era, rivi: Era): void {
  era.liittKpl += rivi.liittKpl
  era.liittEur += rivi.liittEur
  era.fsecKpl += rivi.fsecKpl
  era.fsecTotalKpl += rivi.fsecTotalKpl
  era.fsecInternetKpl += rivi.fsecInternetKpl
  era.fsecEur += rivi.fsecEur
  era.kassa += rivi.kassa
  era.kassaRjmob += rivi.kassaRjmob
  era.tunnit += rivi.tunnit
}

function riviEra(row: string[], s: MyymalaSarakkeet): Era {
  const fsecTotalKpl = s.fsecTotal >= 0 ? parseNum(row[s.fsecTotal]) : 0
  const fsecInternetKpl = s.fsecInternet >= 0 ? parseNum(row[s.fsecInternet]) : 0
  const lajeittain = fsecTotalKpl + fsecInternetKpl
  const kassakate = s.kassakate >= 0 ? parseNum(row[s.kassakate]) : 0
  return {
    liittKpl: s.liittKpl >= 0 ? parseNum(row[s.liittKpl]) : 0,
    liittEur: s.liittEur >= 0 ? parseNum(row[s.liittEur]) : 0,
    fsecKpl: lajeittain > 0 ? lajeittain : (s.fsecKpl >= 0 ? parseNum(row[s.fsecKpl]) : 0),
    fsecTotalKpl, fsecInternetKpl,
    fsecEur: (fsecTotalKpl * FSEC_TOTAL_SELLER) + (fsecInternetKpl * FSEC_INTERNET_SELLER),
    kassa: kassakate * KASSAKATE_KERROIN,
    kassaRjmob: kassakate,
    tunnit: s.tunnit >= 0 ? parseNum(row[s.tunnit]) : 0,
  }
}

/**
 * Myymäläsummat **myyjärivien summana**, ei välilehden omalta
 * yhteenvetoriviltä (Albinin päätös 1.9.2026).
 *
 * Yhteenvetorivi on käsin ylläpidetyissä kopioissa toisinaan puuttunut
 * kokonaan, jolloin koko myymälä katosi hiljaa; myyjärivit ovat aina.
 * Elokuussa 2026 molemmat tavat antavat saman luvun rivi riviltä, mikä on
 * juuri se mitä siirrolta halutaan.
 *
 * Rivi menee tasan yhteen kolmesta erästä, joten
 * `Σ myymälät + standi + muu` = koko välilehti:
 *
 * | Erä | Ehto |
 * |---|---|
 * | `standi` | ständimyyjä missä tahansa kustannuspaikassa |
 * | myymälä | kustannuspaikka on yksi RJ-Mobin viidestä |
 * | `omatMuualla` | RJ-Mobin myyjä muualla — tapahtumat |
 * | `muut` | kaikki loput |
 *
 * **Ständi ratkaistaan ensin.** Myyntiseuranta_ohje sanoo että ständimyyjät
 * poistetaan aina myymälän tuloksista — kaikista, ei vain liittymistä — ja he
 * esiintyvät myös RJ-Mobin myymälöiden riveillä.
 */
export function summaaMyymalat(
  rows: string[][],
  headerIdx: number,
  sarakkeet: MyymalaSarakkeet,
  kuuluuMyyjiin: (nimi: string) => boolean,
): MyymalaSummat {
  const myymalat: Record<string, Era> = {}
  const standi = tyhjaEra()
  const omatMuualla = tyhjaEra()
  const muut = tyhjaEra()
  const vieraatMyymaloissa = tyhjaEra()
  const omatPaikat: Record<string, { liittKpl: number; kassa: number; tunnit: number }> = {}
  const storeHours: Record<string, Record<string, number>> = {}

  let kustannuspaikka = ''
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const kusta = row[0]?.trim() ?? ''
    if (kusta) kustannuspaikka = kusta

    // Myymälän oma yhteenvetorivi on kustannuspaikka ilman myyjää — se
    // ohitetaan tarkoituksella, muuten myymälä laskettaisiin kahteen kertaan.
    const myyjaRaw = row[1]?.trim() ?? ''
    if (!myyjaRaw || shouldSkip(myyjaRaw) || myyjaRaw === 'Kaikki myymälät') continue

    const nimi = cleanUnmatchedName(myyjaRaw)
    const era = riviEra(row, sarakkeet)

    if (isStandi(nimi)) {
      lisaa(standi, era)
      continue
    }

    const oma = kuuluuMyyjiin(nimi)
    const avain = myymalaAvain(kustannuspaikka)

    if (!avain) {
      lisaa(oma ? omatMuualla : muut, era)
      if (oma) {
        const p = omatPaikat[kustannuspaikka] ?? { liittKpl: 0, kassa: 0, tunnit: 0 }
        p.liittKpl += era.liittKpl
        p.kassa += era.kassa
        p.tunnit += era.tunnit
        omatPaikat[kustannuspaikka] = p
      }
      continue
    }

    myymalat[avain] = myymalat[avain] ?? tyhjaEra()
    lisaa(myymalat[avain], era)
    if (!oma) lisaa(vieraatMyymaloissa, era)

    if (era.tunnit > 0) {
      storeHours[avain] = storeHours[avain] ?? {}
      storeHours[avain][nimi] = (storeHours[avain][nimi] ?? 0) + era.tunnit
    }
  }

  const paikat = Object.entries(omatPaikat)
    .map(([nimi, v]) => ({ nimi, ...v }))
    .sort((a, b) => b.liittKpl - a.liittKpl)

  return { myymalat, ulkopuoliset: { standi, omatMuualla, muut, vieraatMyymaloissa, paikat }, storeHours }
}

export type MyyjaSumma = Era & { nimi: string; dnaUusmyyntiKpl: number }

/**
 * Myyjäkohtaiset summat samalta välilehdeltä.
 *
 * **Myyjärivi on myyjän koko tulos, ei myymäläkohtainen** (Albinin päätös
 * 1.9.2026): sama myyjä esiintyy välilehdellä kerran jokaisesta
 * kustannuspaikasta jossa hän on myynyt, ja rivit summataan yhdeksi luvuksi
 * kustannuspaikkaa katsomatta. Tapahtumamyynti (Ylöjärvi, Jyväskylä) on siis
 * myyjän luvussa mukana, kun taas myymälän luku kattaa vain siinä myymälässä
 * tehdyn — `summaaMyymalat`in rajaus. Kaksi eri rajausta on tässä tarkoitus,
 * ja `Ulkopuoliset` kertoo erotuksen.
 *
 * Rajaus tehdään myyjälistalla (`kuuluuMyyjiin`) eikä kustannuspaikalla, koska
 * välilehti kattaa koko organisaation myyjät.
 */
export function summaaMyyjat(
  rows: string[][],
  headerIdx: number,
  sarakkeet: MyymalaSarakkeet,
  kuuluuMyyjiin: (nimi: string) => boolean,
): { myyjat: MyyjaSumma[]; standit: MyyjaSumma[] } {
  const myyjat = new Map<string, MyyjaSumma>()
  const standit = new Map<string, MyyjaSumma>()

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    // Myymälän yhteenvetorivillä on kustannuspaikka mutta ei myyjää.
    const myyjaRaw = row[1]?.trim() ?? ''
    if (!myyjaRaw || shouldSkip(myyjaRaw) || myyjaRaw === 'Kaikki myymälät') continue

    const nimi = cleanUnmatchedName(myyjaRaw)
    const standi = isStandi(nimi)
    if (!standi && !kuuluuMyyjiin(nimi)) continue

    const kohde = standi ? standit : myyjat
    const avain = nimi.toLowerCase()
    const summa = kohde.get(avain) ?? { nimi, ...tyhjaEra(), dnaUusmyyntiKpl: 0 }
    lisaa(summa, riviEra(row, sarakkeet))
    if (sarakkeet.dnaUusmyynti >= 0) summa.dnaUusmyyntiKpl += parseNum(row[sarakkeet.dnaUusmyynti])
    kohde.set(avain, summa)
  }

  return { myyjat: Array.from(myyjat.values()), standit: Array.from(standit.values()) }
}
