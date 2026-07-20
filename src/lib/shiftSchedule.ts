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
export const FORCED_ONLY_SELLER = 'Albin Rashica'

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
    { label: 'aamu', start: '10:00', end: '17:00' },
    { label: 'väli', start: '11:00', end: '17:30' },
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
function isAbsent(seller: string, dateStr: string): boolean {
  const d = new Date(dateStr)
  const inRange = (from: string, to: string) => d >= new Date(from) && d <= new Date(to)
  if (seller === 'Krenar Bajqinovci' && inRange('2026-08-01', '2026-08-10')) return true
  if (seller === 'Hamza Hanif' && (inRange('2026-08-01', '2026-08-02') || inRange('2026-08-07', '2026-08-08'))) return true
  if (seller === 'Kasperi Kemppainen' && inRange('2026-08-06', '2026-08-08')) return true
  return false
}

// Onnenpäivät: annetun tehtävän päivämäärät ovat oikein, viikonpäivämerkinnät korjattu
// vastaamaan todellista elokuuta 2026. 30.8 oli alun perin merkitty "la" mutta on
// oikeasti su (suljettu) — yhdistetty 29.8 (oikea la) Kivistö+Easton OP:n kanssa.
const LUCKY_DAYS: Record<string, { store: StoreName, seller: string }[]> = {
  '2026-08-13': [{ store: 'Malmi', seller: STORE_MANAGERS.Malmi }],
  '2026-08-14': [{ store: 'Kivistö', seller: STORE_MANAGERS.Kivistö }, { store: 'Easton', seller: STORE_MANAGERS.Easton }],
  '2026-08-29': [{ store: 'Kivistö', seller: STORE_MANAGERS.Kivistö }, { store: 'Easton', seller: STORE_MANAGERS.Easton }, { store: 'Malmi', seller: STORE_MANAGERS.Malmi }],
}

const KESAJUHLA_DATE = '2026-08-15'
const STANTI_DATES = ['2026-08-05', '2026-08-06', '2026-08-19', '2026-08-20', '2026-08-27']
const CAMPAIGNS: { from: string, to: string, note: string }[] = [
  { from: '2026-08-10', to: '2026-08-16', note: 'DNA-kampanja' },
  { from: '2026-08-24', to: '2026-08-30', note: 'DNA Lahjikset -kampanja' },
]

function getNote(dateStr: string): string | undefined {
  const notes: string[] = []
  if (STANTI_DATES.includes(dateStr)) notes.push('Stänti (Easton/Kivistö)')
  const d = new Date(dateStr)
  for (const c of CAMPAIGNS) {
    if (d >= new Date(c.from) && d <= new Date(c.to)) notes.push(c.note)
  }
  if (dateStr === KESAJUHLA_DATE) notes.push('Kesäjuhlat')
  if (LUCKY_DAYS[dateStr]) notes.push('Onnenpäivä: ' + LUCKY_DAYS[dateStr].map(l => `${l.store} (${l.seller.split(' ')[0]})`).join(', '))
  return notes.length ? notes.join(' · ') : undefined
}

// Kiertävä, tasapainottava vuoronjakaja koko kuukaudelle. Seuraa myös
// myymäläpäälliköiden viikkotunteja, jotta kukaan ei ylitä viikkokattoaan.
class Rotation {
  private pointer = 0
  private weekShifts: Record<string, number> = {}
  // Ennalta varattu kapasiteetti tällä viikolla (esim. tuleva pakollinen
  // Onnenpäivä-vuoro loppuviikosta) — estää normaalit prioriteettivuorot
  // syömästä koko viikkokiintiötä ennen pakollista vuoroa.
  private weekReserved: Record<string, number> = {}
  private roster: string[]

  constructor(roster: string[]) {
    this.roster = roster
  }

  resetWeek() {
    for (const k of Object.keys(this.weekShifts)) this.weekShifts[k] = 0
    for (const k of Object.keys(this.weekReserved)) this.weekReserved[k] = 0
  }

  reserve(seller: string, count: number) {
    this.weekReserved[seller] = (this.weekReserved[seller] ?? 0) + count
  }

  private capFor(seller: string): number {
    return seller === 'Antti Kiljala' ? ANTTI_MAX_SHIFTS_PER_WEEK : MAX_SHIFTS_PER_WEEK
  }

  isAvailable(seller: string, dateStr: string): boolean {
    if (isAbsent(seller, dateStr)) return false
    const used = (this.weekShifts[seller] ?? 0) + (this.weekReserved[seller] ?? 0)
    return used < this.capFor(seller)
  }

  assign(seller: string) {
    this.weekShifts[seller] = (this.weekShifts[seller] ?? 0) + 1
  }

  // Yrittää antaa vuoron tietylle henkilölle (esim. myymäläpäällikkö omaan
  // myymäläänsä) — palauttaa false jos poissa tai viikkokatto täynnä.
  tryAssign(seller: string, dateStr: string, alreadyAssignedToday: Set<string>): boolean {
    if (alreadyAssignedToday.has(seller)) return false
    if (!this.isAvailable(seller, dateStr)) return false
    this.assign(seller)
    return true
  }

  // Pakollinen vuoro (esim. Onnenpäivä) — toteutuu aina, mutta kuluttaa
  // ensin viikon alussa tehdyn varauksen ettei viikkokatto ylity.
  forceAssign(seller: string) {
    if ((this.weekReserved[seller] ?? 0) > 0) this.weekReserved[seller]--
    else this.assign(seller)
  }

  next(dateStr: string, alreadyAssignedToday: Set<string>): string {
    for (let tries = 0; tries < this.roster.length; tries++) {
      const candidate = this.roster[this.pointer % this.roster.length]
      this.pointer++
      if (alreadyAssignedToday.has(candidate)) continue
      if (!this.isAvailable(candidate, dateStr)) continue
      this.assign(candidate)
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
  const rotation = new Rotation([...FULL_TIME_SELLERS, ...PART_TIME_SELLERS])

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

    // Myyntipäällikön prioriteettipaikka omassa myymälässään: yritetään aina
    // ensin, mutta jos poissa tai viikkokatto (5 vuoroa/vko) täynnä, paikka
    // täytetään kierrätyksestä — näin kukaan ei tee 6 vuoron viikkoa.
    const fillManagerSlot = (store: StoreName, template: ShiftTemplate) => {
      const manager = STORE_MANAGERS[store]
      if (rotation.tryAssign(manager, dateStr, assignedToday)) {
        shifts.push(shiftFrom(store, manager, template))
        assignedToday.add(manager)
      } else {
        const seller = rotation.next(dateStr, assignedToday)
        shifts.push(shiftFrom(store, seller, template))
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
        rotation.forceAssign(luckyForStore.seller)
        shifts.push(shiftFrom(store, luckyForStore.seller, tmpl))
        assignedToday.add(luckyForStore.seller)
        continue
      }

      if (dateStr === KESAJUHLA_DATE) {
        const headcount = STORE_NORMAL_HEADCOUNT[store]
        fillManagerSlot(store, KESAJUHLA_SHIFT)
        for (let i = 1; i < headcount; i++) {
          const seller = rotation.next(dateStr, assignedToday)
          shifts.push(shiftFrom(store, seller, KESAJUHLA_SHIFT))
          assignedToday.add(seller)
        }
        continue
      }

      if (weekday === 6) {
        // Lauantai: yksi 10-16 vuoro per henkilö.
        const headcount = STORE_NORMAL_HEADCOUNT[store]
        fillManagerSlot(store, SATURDAY_SHIFT)
        for (let i = 1; i < headcount; i++) {
          const seller = rotation.next(dateStr, assignedToday)
          shifts.push(shiftFrom(store, seller, SATURDAY_SHIFT))
          assignedToday.add(seller)
        }
        continue
      }

      // Normaali arkipäivä: päällikön prioriteettipaikka aamuvuoroon, loput kierrätyksestä.
      const templates = WEEKDAY_SHIFTS[store]
      fillManagerSlot(store, templates[0])
      for (let i = 1; i < templates.length; i++) {
        const seller = rotation.next(dateStr, assignedToday)
        shifts.push(shiftFrom(store, seller, templates[i]))
        assignedToday.add(seller)
      }
    }

    days.push({ date: dateStr, weekday, closed: false, note, shifts })
  }

  return days
}
