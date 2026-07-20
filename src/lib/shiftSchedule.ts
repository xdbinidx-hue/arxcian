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

// Kiertävä, tasapainottava vuoronjakaja koko kuukaudelle.
class Rotation {
  private pointer = 0
  private totalShifts: Record<string, number> = {}
  private weekShifts: Record<string, number> = {}
  private roster: string[]

  constructor(roster: string[]) {
    this.roster = roster
    for (const r of roster) { this.totalShifts[r] = 0; this.weekShifts[r] = 0 }
  }

  resetWeek() {
    for (const r of this.roster) this.weekShifts[r] = 0
  }

  private isAvailable(seller: string, dateStr: string): boolean {
    if (isAbsent(seller, dateStr)) return false
    if (seller === 'Antti Kiljala' && this.weekShifts[seller] >= ANTTI_MAX_SHIFTS_PER_WEEK) return false
    return true
  }

  next(dateStr: string, alreadyAssignedToday: Set<string>): string {
    for (let tries = 0; tries < this.roster.length; tries++) {
      const candidate = this.roster[this.pointer % this.roster.length]
      this.pointer++
      if (alreadyAssignedToday.has(candidate)) continue
      if (!this.isAvailable(candidate, dateStr)) continue
      this.totalShifts[candidate]++
      this.weekShifts[candidate] = (this.weekShifts[candidate] ?? 0) + 1
      return candidate
    }
    // Kukaan ei ole vapaana — pakkotapaus.
    return FORCED_ONLY_SELLER
  }
}

function shiftFrom(store: StoreName, seller: string, t: ShiftTemplate): Shift {
  return { store, seller, start: t.start, end: t.end, hours: hoursBetween(t.start, t.end), label: t.label }
}

export function generateAugust2026(): DayInfo[] {
  const days: DayInfo[] = []
  const rotation = new Rotation([...FULL_TIME_SELLERS, ...PART_TIME_SELLERS])
  let lastWeek = -1

  for (let day = 1; day <= 31; day++) {
    const date = new Date(2026, 7, day)
    const weekday = date.getDay()
    const dateStr = `2026-08-${String(day).padStart(2, '0')}`

    const isoWeek = Math.floor((day + 5) / 7) // karkea viikkoraja ma-alkuisesti riittää viikkosykliin
    if (isoWeek !== lastWeek) { rotation.resetWeek(); lastWeek = isoWeek }

    if (weekday === 0) {
      days.push({ date: dateStr, weekday, closed: true, note: 'Suljettu', shifts: [] })
      continue
    }

    const note = getNote(dateStr)
    const lucky = LUCKY_DAYS[dateStr]
    const shifts: Shift[] = []
    const assignedToday = new Set<string>()

    for (const store of STORES) {
      const luckyForStore = lucky?.find(l => l.store === store)

      if (luckyForStore) {
        // Onnenpäivä: myymäläpäällikkö saa automaattisen vuoron, muut tyhjäksi.
        const tmpl = weekday === 6 ? OP_SATURDAY_SHIFT : OP_WEEKDAY_SHIFT
        shifts.push(shiftFrom(store, luckyForStore.seller, tmpl))
        assignedToday.add(luckyForStore.seller)
        continue
      }

      if (dateStr === KESAJUHLA_DATE) {
        const headcount = STORE_NORMAL_HEADCOUNT[store]
        const manager = STORE_MANAGERS[store]
        shifts.push(shiftFrom(store, manager, KESAJUHLA_SHIFT))
        assignedToday.add(manager)
        for (let i = 1; i < headcount; i++) {
          const seller = rotation.next(dateStr, assignedToday)
          shifts.push(shiftFrom(store, seller, KESAJUHLA_SHIFT))
          assignedToday.add(seller)
        }
        continue
      }

      if (weekday === 6) {
        // Lauantai: yksi 10-16 vuoro per henkilö, päällikkö mukana.
        const headcount = STORE_NORMAL_HEADCOUNT[store]
        const manager = STORE_MANAGERS[store]
        shifts.push(shiftFrom(store, manager, SATURDAY_SHIFT))
        assignedToday.add(manager)
        for (let i = 1; i < headcount; i++) {
          const seller = rotation.next(dateStr, assignedToday)
          shifts.push(shiftFrom(store, seller, SATURDAY_SHIFT))
          assignedToday.add(seller)
        }
        continue
      }

      // Normaali arkipäivä: päällikkö aamuvuoroon, loput kierrätyksestä.
      const manager = STORE_MANAGERS[store]
      const templates = WEEKDAY_SHIFTS[store]
      shifts.push(shiftFrom(store, manager, templates[0]))
      assignedToday.add(manager)
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
