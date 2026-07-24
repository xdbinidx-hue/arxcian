// PK-seudun (Malmi, Easton, Kivistö) työvuorolistan tietomallit ja
// elokuun 2026 vuorolistan automaattinen generointi annettujen sääntöjen mukaan.

export type StoreName = 'Malmi' | 'Easton' | 'Kivistö'
export const STORES: StoreName[] = ['Malmi', 'Easton', 'Kivistö']

export const STORE_COLORS: Record<StoreName, string> = {
  Malmi: '#fecaca',
  Easton: '#fed7aa',
  Kivistö: '#fef08a',
}

export const STORE_MANAGERS: Record<StoreName, string> = {
  Malmi: 'Arbnor Rashica',
  Easton: 'Alec Fambro',
  Kivistö: 'Joona Huttunen',
}

export const STORE_NORMAL_HEADCOUNT: Record<StoreName, number> = {
  Malmi: 3, Easton: 2, Kivistö: 2,
}

export const FULL_TIME_SELLERS = ['Krenar Bajqinovci', 'Kasperi Kemppainen', 'Vladimir Kogan', 'Hamza Hanif', 'Lauri Ukkonen']
export const PART_TIME_SELLERS = ['Antti Kiljala', 'Ramin Kadiri']
export const ANTTI_MAX_SHIFTS_PER_WEEK = 3
// Kukaan (päälliköt mukaan lukien) ei tee täyttä 6 vuoron viikkoa — vähintään yksi vapaapäivä/vko.
export const MAX_SHIFTS_PER_WEEK = 5
// Myymäläpäällikön oman myymälän normaalivuorokiintiö: tasan 3/viikko (min=max),
// loput viikon vuoroista (enintään MAX_SHIFTS_PER_WEEK asti) tulevat kahdesta muusta PK-myymälästä.
export const MANAGER_HOME_SHIFTS_PER_WEEK = 3
// Päällikön muihin myymälöihin ("loput") tekemien vuorojen kattoa viikossa —
// pitää päälliköt yleisessä kierrätyksessä kohtuullisessa osuudessa niin että
// kokopäiväiset myyjät ehtivät omaan 4-5 vuoroa/viikko -tavoitteeseensa.
export const MANAGER_CROSS_STORE_SHIFTS_PER_WEEK = 2

const MANAGER_HOME_STORE: Record<string, StoreName> = {}
for (const [store, manager] of Object.entries(STORE_MANAGERS) as [StoreName, string][]) {
  MANAGER_HOME_STORE[manager] = store
}
export const FORCED_ONLY_SELLER = 'Albin Rashica'

// Kalenterinäkymän sarakejärjestys: päälliköt, kokopäiväiset, osa-aikaiset, pakkotapaus.
export const ROSTER_COLUMNS = [
  ...Object.values(STORE_MANAGERS),
  ...FULL_TIME_SELLERS,
  ...PART_TIME_SELLERS,
  FORCED_ONLY_SELLER,
]

export interface Shift {
  store: StoreName
  seller: string
  start: string // HH:MM
  end: string // HH:MM
  hours: number
  label: string // 'aamu' | 'väli' | 'ilta' | 'la' | 'OP' | 'Kesäjuhla'
}

export interface DayInfo {
  date: string // YYYY-MM-DD
  weekday: number // 0=su ... 6=la
  closed: boolean
  note?: string
  shifts: Shift[]
}

interface ShiftTemplate { label: string; start: string; end: string }

const WEEKDAY_SHIFTS: Record<StoreName, ShiftTemplate[]> = {
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

const SATURDAY_SHIFT: ShiftTemplate = { label: 'la', start: '10:00', end: '16:00' }
const OP_WEEKDAY_SHIFT: ShiftTemplate = { label: 'OP', start: '10:00', end: '19:00' } // 9h
const OP_SATURDAY_SHIFT: ShiftTemplate = { label: 'OP', start: '10:00', end: '17:00' } // 7h
const KESAJUHLA_SHIFT: ShiftTemplate = { label: 'Kesäjuhla', start: '10:00', end: '14:00' } // 4h

function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 30) / 2
}

// Poissaolot (annettu tehtävässä)
export const ABSENCES: { seller: string, from: string, to: string, label: string }[] = [
  { seller: 'Krenar Bajqinovci', from: '2026-08-01', to: '2026-08-10', label: 'vapaa' },
  { seller: 'Hamza Hanif', from: '2026-08-01', to: '2026-08-02', label: 'vapaa' },
  { seller: 'Hamza Hanif', from: '2026-08-07', to: '2026-08-08', label: 'loma' },
  { seller: 'Kasperi Kemppainen', from: '2026-08-06', to: '2026-08-08', label: 'vapaa/loma' },
]

export function getAbsenceLabel(seller: string, dateStr: string): string | undefined {
  const d = new Date(dateStr)
  return ABSENCES.find(a => a.seller === seller && d >= new Date(a.from) && d <= new Date(a.to))?.label
}

function isAbsent(seller: string, dateStr: string): boolean {
  return getAbsenceLabel(seller, dateStr) !== undefined
}

// Onnenpäivät: vahvistettu käyttäjän oman Sheets-vuorolistan ("TYÖVUOROT
// PK-SEUTU / ELOKUU 2026", Tapahtumat-sarake) perusteella — tämä on ehdoton
// totuus, ei alkuperäisen tehtävänannon vapaateksti.
const LUCKY_DAYS: Record<string, { store: StoreName, seller: string }[]> = {
  '2026-08-08': [{ store: 'Kivistö', seller: STORE_MANAGERS.Kivistö }],
  '2026-08-13': [{ store: 'Malmi', seller: STORE_MANAGERS.Malmi }],
  '2026-08-14': [{ store: 'Kivistö', seller: STORE_MANAGERS.Kivistö }, { store: 'Easton', seller: STORE_MANAGERS.Easton }],
  '2026-08-28': [{ store: 'Kivistö', seller: STORE_MANAGERS.Kivistö }, { store: 'Easton', seller: STORE_MANAGERS.Easton }],
  '2026-08-29': [{ store: 'Malmi', seller: STORE_MANAGERS.Malmi }],
}

const KESAJUHLA_DATE = '2026-08-15'
// Stänti Easton/Kivistössä: 5,6,19,20.8. 27.8 on vain Syke (Lahti) — ei vaikuta PK-myymälöihin.
const STANTI_DATES = ['2026-08-05', '2026-08-06', '2026-08-19', '2026-08-20']
const SYKE_ONLY_STANTI_DATES = ['2026-08-27']
const CAMPAIGNS: { from: string, to: string, note: string }[] = [
  { from: '2026-08-10', to: '2026-08-16', note: 'DNA-kampanja' },
  { from: '2026-08-24', to: '2026-08-30', note: 'DNA Lahjikset -kampanja' },
]

function getNote(dateStr: string): string | undefined {
  const notes: string[] = []
  if (STANTI_DATES.includes(dateStr)) notes.push('Stänti (Easton/Kivistö)')
  if (SYKE_ONLY_STANTI_DATES.includes(dateStr)) notes.push('Stänti (Syke, ei PK-vaikutusta)')
  const d = new Date(dateStr)
  for (const c of CAMPAIGNS) {
    if (d >= new Date(c.from) && d <= new Date(c.to)) notes.push(c.note)
  }
  if (dateStr === KESAJUHLA_DATE) notes.push('Kesäjuhlat')
  if (LUCKY_DAYS[dateStr]) notes.push('Onnenpäivä: ' + LUCKY_DAYS[dateStr].map(l => `${l.store} (${l.seller.split(' ')[0]})`).join(', '))
  return notes.length ? notes.join(' · ') : undefined
}

// Kiertävä, tasapainottava vuoronjakaja koko kuukaudelle. Seuraa myös
// myymäläpäälliköiden viikkotunteja (koti+muut myymälät) ja Malmi-käyntejä,
// jotta kukaan ei ylitä viikkokattoaan ja kaikki ehtivät Malmiin kuukaudessa.
class Rotation {
  private pointer = 0
  private weekShifts: Record<string, number> = {}
  // Ennalta varattu kapasiteetti tällä viikolla (esim. tuleva pakollinen
  // Onnenpäivä-vuoro loppuviikosta) — estää normaalit prioriteettivuorot
  // syömästä koko viikkokiintiötä ennen pakollista vuoroa.
  private weekReserved: Record<string, number> = {}
  // Myymäläpäällikön oman myymälän normaalivuorot tällä viikolla (kiintiö MANAGER_HOME_SHIFTS_PER_WEEK).
  private managerHome: Record<string, number> = {}
  // Myymäläpäällikön muissa PK-myymälöissä tällä viikolla tekemät vuorot (kiintiö MANAGER_CROSS_STORE_SHIFTS_PER_WEEK).
  private managerCross: Record<string, number> = {}
  // Kuukauden aikana Malmissa jo vuoron tehneet — käytetään Malmi-prioriteettiin.
  private malmiVisited = new Set<string>()
  private roster: string[]

  constructor(roster: string[]) {
    this.roster = roster
  }

  resetWeek() {
    for (const k of Object.keys(this.weekShifts)) this.weekShifts[k] = 0
    for (const k of Object.keys(this.weekReserved)) this.weekReserved[k] = 0
    for (const k of Object.keys(this.managerHome)) this.managerHome[k] = 0
    for (const k of Object.keys(this.managerCross)) this.managerCross[k] = 0
  }

  reserve(seller: string, count: number) {
    this.weekReserved[seller] = (this.weekReserved[seller] ?? 0) + count
  }

  private capFor(seller: string): number {
    return seller === 'Antti Kiljala' ? ANTTI_MAX_SHIFTS_PER_WEEK : MAX_SHIFTS_PER_WEEK
  }

  isAvailable(seller: string, dateStr: string, store?: StoreName): boolean {
    if (isAbsent(seller, dateStr)) return false
    const used = (this.weekShifts[seller] ?? 0) + (this.weekReserved[seller] ?? 0)
    if (used >= this.capFor(seller)) return false
    const homeStore = MANAGER_HOME_STORE[seller]
    if (homeStore && store && store !== homeStore && (this.managerCross[seller] ?? 0) >= MANAGER_CROSS_STORE_SHIFTS_PER_WEEK) return false
    return true
  }

  homeCountFor(manager: string): number {
    return this.managerHome[manager] ?? 0
  }

  incrementHome(manager: string) {
    this.managerHome[manager] = (this.managerHome[manager] ?? 0) + 1
  }

  private assign(seller: string, store: StoreName) {
    this.weekShifts[seller] = (this.weekShifts[seller] ?? 0) + 1
    if (store === 'Malmi') this.malmiVisited.add(seller)
    const homeStore = MANAGER_HOME_STORE[seller]
    if (homeStore && store !== homeStore) this.managerCross[seller] = (this.managerCross[seller] ?? 0) + 1
  }

  // Yrittää antaa vuoron tietylle henkilölle (esim. myymäläpäällikkö omaan
  // myymäläänsä) — palauttaa false jos poissa tai viikkokatto täynnä.
  tryAssign(seller: string, dateStr: string, alreadyAssignedToday: Set<string>, store: StoreName): boolean {
    if (alreadyAssignedToday.has(seller)) return false
    if (!this.isAvailable(seller, dateStr, store)) return false
    this.assign(seller, store)
    return true
  }

  // Pakollinen vuoro (esim. Onnenpäivä) — toteutuu aina, mutta kuluttaa
  // ensin viikon alussa tehdyn varauksen ettei viikkokatto ylity.
  forceAssign(seller: string, store: StoreName) {
    if ((this.weekReserved[seller] ?? 0) > 0) this.weekReserved[seller]--
    else this.weekShifts[seller] = (this.weekShifts[seller] ?? 0) + 1
    if (store === 'Malmi') this.malmiVisited.add(seller)
  }

  // excludeSeller: myymälän oma päällikkö jätetään pois yleisestä kierrätyksestä
  // hänen omassa myymälässään — hänen vuoronsa siellä tulevat vain kiintiön kautta.
  next(dateStr: string, assignedToday: Set<string>, store: StoreName, excludeSeller?: string): string {
    const eligible = (candidate: string) =>
      candidate !== excludeSeller && !assignedToday.has(candidate) && this.isAvailable(candidate, dateStr, store)

    // Malmi on prioriteetti: suositaan ensin jotakuta joka ei ole vielä tehnyt
    // yhtään vuoroa Malmissa tässä kuussa, jotta kaikki ehtivät sinne kuukauden aikana.
    if (store === 'Malmi') {
      for (let tries = 0; tries < this.roster.length; tries++) {
        const candidate = this.roster[(this.pointer + tries) % this.roster.length]
        if (!this.malmiVisited.has(candidate) && eligible(candidate)) {
          this.pointer = (this.pointer + tries + 1) % this.roster.length
          this.assign(candidate, store)
          return candidate
        }
      }
    }

    for (let tries = 0; tries < this.roster.length; tries++) {
      const candidate = this.roster[this.pointer % this.roster.length]
      this.pointer++
      if (!eligible(candidate)) continue
      this.assign(candidate, store)
      return candidate
    }

    // Poikkeuksellisen moni poissa yhtä aikaa eikä kukaan mahdu viikkokattoon:
    // parempi että joku tekee ylimääräisen vuoron kuin että FORCED_ONLY_SELLER
    // joutuu kahteen vuoroon samana päivänä. Viikkokatto/ristikkäiskiintiöt
    // jätetään huomiotta, poissaolo ja saman päivän tupla-varaus eivät.
    for (let tries = 0; tries < this.roster.length; tries++) {
      const candidate = this.roster[this.pointer % this.roster.length]
      this.pointer++
      if (candidate === excludeSeller || assignedToday.has(candidate) || isAbsent(candidate, dateStr)) continue
      this.assign(candidate, store)
      return candidate
    }

    // Kukaan ei ole vapaana — pakkotapaus.
    return FORCED_ONLY_SELLER
  }
}

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function shiftFrom(store: StoreName, seller: string, t: ShiftTemplate): Shift {
  return { store, seller, start: t.start, end: t.end, hours: hoursBetween(t.start, t.end), label: t.label }
}

export function generateAugust2026(): DayInfo[] {
  const days: DayInfo[] = []
  const rotation = new Rotation([...FULL_TIME_SELLERS, ...PART_TIME_SELLERS, ...Object.values(STORE_MANAGERS)])

  // Kerätään etukäteen, mitkä myymäläpäälliköt tarvitsevat pakollisen
  // Onnenpäivä-vuoron kullakin viikolla, jotta kapasiteetti voidaan varata
  // viikon alussa (muuten loppuviikon OP saattaisi ylittää viikkokaton).
  const reservedByWeek: Record<string, string[]> = {}
  for (const [dateStr, lucky] of Object.entries(LUCKY_DAYS)) {
    const wk = mondayOf(dateStr)
    reservedByWeek[wk] = (reservedByWeek[wk] ?? []).concat(lucky.map(l => l.seller))
  }

  for (let day = 1; day <= 31; day++) {
    const date = new Date(2026, 7, day)
    const weekday = date.getDay()
    const dateStr = `2026-08-${String(day).padStart(2, '0')}`

    // Viikko vaihtuu maanantaisin (viikko on ma-su, ei ma-la kuten myymälän aukiolo).
    if (weekday === 1) {
      rotation.resetWeek()
      for (const seller of reservedByWeek[dateStr] ?? []) rotation.reserve(seller, 1)
    }

    if (weekday === 0) {
      days.push({ date: dateStr, weekday, closed: true, note: 'Suljettu', shifts: [] })
      continue
    }

    const note = getNote(dateStr)
    const lucky = LUCKY_DAYS[dateStr]
    const shifts: Shift[] = []
    const assignedToday = new Set<string>()

    // Lauantai/Kesäjuhla: ei erillistä päällikköprioriteettia — nämä eivät ole
    // "normaalivuoroja", joten päällikön 3/viikko-kotikiintiö ei koske niitä.
    // Kaikki (myös päälliköt) kilpailevat samasta kierrätyksestä; Malmi-
    // ensikertalaisprioriteetti ohjaa luonnostaan vaihtelua myymälöiden välillä.
    const fillFromPool = (store: StoreName, template: ShiftTemplate, headcount: number) => {
      for (let i = 0; i < headcount; i++) {
        const seller = rotation.next(dateStr, assignedToday, store)
        shifts.push(shiftFrom(store, seller, template))
        assignedToday.add(seller)
      }
    }

    // Arkipäivän normaalivuorot: päällikölle oman myymälän kiintiö (tasan
    // MANAGER_HOME_SHIFTS_PER_WEEK/viikko, täyttyy kronologisessa ma→pe-järjestyksessä
    // eli painottuu luonnostaan alkuviikkoon = "erityisesti ma-ke"). Kiintiön
    // täytyttyä (tai päällikkö poissa) loput oman myymälän vuorot ja aina muut
    // paikat täytetään kierrätyksestä pois lukien tämän myymälän oma päällikkö —
    // hänen lisävuoronsa tulevat kahdesta muusta PK-myymälästä ("loput").
    const fillWeekdayNormal = (store: StoreName) => {
      const templates = WEEKDAY_SHIFTS[store]
      const manager = STORE_MANAGERS[store]
      let startIdx = 0
      if (rotation.homeCountFor(manager) < MANAGER_HOME_SHIFTS_PER_WEEK &&
          rotation.tryAssign(manager, dateStr, assignedToday, store)) {
        rotation.incrementHome(manager)
        shifts.push(shiftFrom(store, manager, templates[0]))
        assignedToday.add(manager)
        startIdx = 1
      }
      for (let i = startIdx; i < templates.length; i++) {
        const seller = rotation.next(dateStr, assignedToday, store, manager)
        shifts.push(shiftFrom(store, seller, templates[i]))
        assignedToday.add(seller)
      }
    }

    for (const store of STORES) {
      const luckyForStore = lucky?.find(l => l.store === store)

      if (lucky && !luckyForStore) {
        // Onnenpäivä on toisessa myymälässä tänään — tämä myymälä pidetään
        // kokonaan tyhjänä (ei vuoroja).
        continue
      }

      if (luckyForStore) {
        // Onnenpäivä: myymäläpäällikkö saa automaattisen vuoron, kaikki muut
        // myymälät (ja tämän myymälän muut myyjät) tyhjinä. Pakollinen vuoro
        // kuluttaa viikon alussa tehdyn varauksen, ei riko viikkokattoa.
        const tmpl = weekday === 6 ? OP_SATURDAY_SHIFT : OP_WEEKDAY_SHIFT
        rotation.forceAssign(luckyForStore.seller, store)
        shifts.push(shiftFrom(store, luckyForStore.seller, tmpl))
        assignedToday.add(luckyForStore.seller)
        continue
      }

      if (dateStr === KESAJUHLA_DATE) {
        fillFromPool(store, KESAJUHLA_SHIFT, STORE_NORMAL_HEADCOUNT[store])
        continue
      }

      if (weekday === 6) {
        // Lauantai: yksi 10-16 vuoro per henkilö.
        fillFromPool(store, SATURDAY_SHIFT, STORE_NORMAL_HEADCOUNT[store])
        continue
      }

      // Normaali arkipäivä (ma-pe).
      fillWeekdayNormal(store)
    }

    days.push({ date: dateStr, weekday, closed: false, note, shifts })
  }

  return days
}
