// PK-seudun (Malmi, Easton, Kivistö) työvuorolistan tietomallit ja
// yleiskäyttöinen kuukausigeneraattori.
//
// Viikko-ankkuri-periaate (kts. alempana WeekPlan): jokainen kokoaikainen saa
// kiertävän osoittimen mukaan YHDEN myymälän ja YHDEN vuorotyypin koko viikoksi,
// jottei sama henkilö vaihda paikkaa/aikaa päivittäin. Ankkurit vaihtuvat
// viikko viikolta, joten pidemmällä aikavälillä kaikki kiertävät kaikki
// myymälät ja näkevät eri työkavereita.

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

// Normaalipäivän (ei tapahtumia/onnenpäiviä) henkilömäärä lauantaisin ja
// kesäjuhlassa — arkipäivän oma, Malmin maanantaita korottava sääntö on
// getWeekdayHeadcount()issa.
export const STORE_NORMAL_HEADCOUNT: Record<StoreName, number> = {
  Malmi: 3, Easton: 2, Kivistö: 2,
}

export const FULL_TIME_SELLERS = ['Krenar Bajqinovci', 'Kasperi Kemppainen', 'Vladimir Kogan', 'Hamza Hanif', 'Lauri Ukkonen']
export const PART_TIME_SELLERS = ['Antti Kiljala', 'Ramin Kadiri']
const [ANTTI, RAMIN] = PART_TIME_SELLERS
export const ANTTI_MAX_SHIFTS_PER_WEEK = 3
// Kukaan (päälliköt mukaan lukien) ei tee täyttä 6 vuoron viikkoa — vähintään yksi vapaapäivä/vko.
export const MAX_SHIFTS_PER_WEEK = 5
// Myymäläpäällikön oman myymälän vuorokiintiö: enintään 3/viikko, keskittyen
// alkuviikkoon (ma-ke) — ei enää erillistä ristikkäismyymälä-kiintiötä, päällikön
// viikko on vain nämä kotivuorot.
export const MANAGER_HOME_SHIFTS_PER_WEEK = 3

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

// Malmin maanantain neljäs vuoro (normaalipäivä tarvitsee siellä 4 henkeä,
// muut arkipäivät 3). Kellonaikaa EI ole vahvistettu — placeholder, vaihda
// tämä jos oikea aika on toinen.
const MALMI_MONDAY_EXTRA: ShiftTemplate = { label: 'aamu²', start: '10:00', end: '16:00' }

const SATURDAY_SHIFT: ShiftTemplate = { label: 'la', start: '10:00', end: '16:00' }
const OP_WEEKDAY_SHIFT: ShiftTemplate = { label: 'OP', start: '10:00', end: '19:00' } // 9h
const OP_SATURDAY_SHIFT: ShiftTemplate = { label: 'OP', start: '10:00', end: '17:00' } // 7h
const KESAJUHLA_SHIFT: ShiftTemplate = { label: 'Kesäjuhla', start: '10:00', end: '14:00' } // 4h

function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 30) / 2
}

/** Arkipäivän (ma-pe) henkilömäärä: Malmi ma=4, muuten 3; Easton/Kivistö aina 2. */
function getWeekdayHeadcount(store: StoreName, weekday: number): number {
  if (store === 'Malmi') return weekday === 1 ? 4 : 3
  return STORE_NORMAL_HEADCOUNT[store]
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
//
// TODO: nämä (ja Kesäjuhla/Stänti/kampanjat/poissaolot) siirretään myöhemmin
// luettavaksi TYOVUOROLISTA-Drive-kansion Excel-tiedoston Tapahtumat-sarakkeesta,
// jotta uusia kuukausia ei tarvitse koodata käsin. Elokuu 2026 pysyy toistaiseksi
// kovakoodattuna oletuksena.
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

function shiftFrom(store: StoreName, seller: string, t: ShiftTemplate): Shift {
  return { store, seller, start: t.start, end: t.end, hours: hoursBetween(t.start, t.end), label: t.label }
}

// ===================== Viikko-ankkuri-kierto =====================
//
// "Ankkuripaikat" täytetään tässä järjestyksessä 5 kokoaikaisesta: Malmi
// aamu, Malmi väli, Easton aamu, Kivistö aamu. Viides henkilö jää sen viikon
// "swingiksi" — pysyy Malmissa, täyttää sen jäljelle jäävät aukot
// (ma-ekstra + to/pe-ilta). Kiertopointteri siirtyy +2 joka viikko (5 hengen
// lista, syt(2,5)=1 → koko lista kiertää läpi 5 viikossa).
const ANCHOR_ROSTER = FULL_TIME_SELLERS
const ANCHOR_STEP = 2

type AnchorSlot = { store: StoreName; templateIndex: number }

const ANCHOR_SLOTS: AnchorSlot[] = [
  { store: 'Malmi', templateIndex: 0 },
  { store: 'Malmi', templateIndex: 1 },
  { store: 'Easton', templateIndex: 0 },
  { store: 'Kivistö', templateIndex: 0 },
]

// Raminin vakiorooli: Eastonin to/pe-illat joka viikko (2 vuoroa) — liian
// pieni/hajanainen pala kenellekään kokoaikaiselle omaksi koko viikon
// paikaksi, joten Ramin kokoaa sen. Yksi ihminen ei voi kattaa sekä Eastonia
// että Kivistöä samana iltana, joten Kivistön vastaava aukko menee
// päällikön ristikkäisvuorona (kts. fallbackFor) — Ramin täyttää vain yhden.
const RAMIN_SLOTS: { store: StoreName; weekday: number }[] = [
  { store: 'Easton', weekday: 4 }, { store: 'Easton', weekday: 5 },
]

// Kuinka monta ristikkäisvuoroa (toisen myymälän to/pe-ilta-aukko) päällikkö
// voi ottaa viikossa oman 3 kotivuoron lisäksi — turvaverkko ennen Anttia,
// ei pakollinen tavoite.
const MANAGER_CROSS_CAP = 2

/** Myymäläpäällikön kotivuoron slot-indeksi — aina myymälän viimeinen vuorotyyppi. */
function managerTemplateIndex(store: StoreName): number {
  return WEEKDAY_SHIFTS[store].length - 1
}

/** Yhden viikon (ma-su) tila: ankkurit, swing ja jokaisen käytetyt vuorot. */
class WeekPlan {
  private shiftCount: Record<string, number> = {}
  private managerHomeCount: Record<string, number> = {}
  private managerCrossCount: Record<string, number> = {}
  anchors: Record<string, AnchorSlot> = {}
  swing: string | null = null

  constructor(weekIndex: number) {
    const n = ANCHOR_ROSTER.length
    const offset = ((weekIndex * ANCHOR_STEP) % n + n) % n
    const ordered = [...ANCHOR_ROSTER.slice(offset), ...ANCHOR_ROSTER.slice(0, offset)]
    ordered.forEach((seller, i) => {
      if (i < ANCHOR_SLOTS.length) this.anchors[seller] = ANCHOR_SLOTS[i]
      else this.swing = seller
    })
  }

  used(seller: string): number {
    return this.shiftCount[seller] ?? 0
  }

  private capFor(seller: string): number {
    return seller === ANTTI ? ANTTI_MAX_SHIFTS_PER_WEEK : MAX_SHIFTS_PER_WEEK
  }

  canWork(seller: string, dateStr: string): boolean {
    if (isAbsent(seller, dateStr)) return false
    return this.used(seller) < this.capFor(seller)
  }

  record(seller: string, isManagerHome: boolean, isManagerCross = false) {
    this.shiftCount[seller] = this.used(seller) + 1
    if (isManagerHome) this.managerHomeCount[seller] = (this.managerHomeCount[seller] ?? 0) + 1
    if (isManagerCross) this.managerCrossCount[seller] = (this.managerCrossCount[seller] ?? 0) + 1
  }

  managerHomeUsed(manager: string): number {
    return this.managerHomeCount[manager] ?? 0
  }

  managerCrossUsed(manager: string): number {
    return this.managerCrossCount[manager] ?? 0
  }

  anchorFor(store: StoreName, templateIndex: number): string | undefined {
    return Object.entries(this.anchors).find(([, slot]) => slot.store === store && slot.templateIndex === templateIndex)?.[0]
  }
}

/**
 * Varajärjestys tyhjälle paikalle kun suunniteltu henkilö (ankkuri/päällikkö/
 * Ramin) on poissa, tai kun Kivistön to/pe-ilta tarvitsee täyttäjän (Ramin
 * kattaa vain Eastonin, ei kahta myymälää samana iltana). Järjestys:
 *  1. Tämän viikon swing — hän on jo se joustava rooli, kokeillaan ensin.
 *  2. Joku muu kokoaikainen jolla on vielä tilaa viikkokiintiössään — pitää
 *     poikkeukselliset poissaolopiikit (esim. kolme poissa samalla viikolla)
 *     tasaisesti jaettuna sen sijaan että ne kaatuisivat suoraan Antin/Albinin
 *     niskaan.
 *  3. Ramin.
 *  4. Toisen myymälän päällikkö (ei tämän myymälän oma), enintään
 *     MANAGER_CROSS_CAP/vko — hyödyntää sen että päälliköt ovat vapaita
 *     to-pe kotivuoronsa (ma-ke) jälkeen.
 *  5. Antti.
 *  6. Albin — toteutuu aina paitsi jos hän itse on poissa. Antti ja Albin
 *     eivät koskaan esiinny viikkosuunnitelmassa suoraan, vain tätä kautta.
 */
function fallbackFor(
  dateStr: string, assignedToday: Set<string>, plan: WeekPlan, store: StoreName,
): { seller: string; managerCross: boolean } | null {
  if (plan.swing && !assignedToday.has(plan.swing) && plan.canWork(plan.swing, dateStr)) {
    return { seller: plan.swing, managerCross: false }
  }

  const otherFullTimer = ANCHOR_ROSTER.find(s => !assignedToday.has(s) && plan.canWork(s, dateStr))
  if (otherFullTimer) return { seller: otherFullTimer, managerCross: false }

  if (!assignedToday.has(RAMIN) && plan.canWork(RAMIN, dateStr)) return { seller: RAMIN, managerCross: false }

  const crossManager = Object.entries(STORE_MANAGERS)
    .find(([homeStore, manager]) =>
      homeStore !== store && !assignedToday.has(manager) && plan.canWork(manager, dateStr)
      && plan.managerCrossUsed(manager) < MANAGER_CROSS_CAP)?.[1]
  if (crossManager) return { seller: crossManager, managerCross: true }

  for (const candidate of [ANTTI, FORCED_ONLY_SELLER]) {
    if (assignedToday.has(candidate)) continue
    if (isAbsent(candidate, dateStr)) continue
    if (candidate !== FORCED_ONLY_SELLER && !plan.canWork(candidate, dateStr)) continue
    return { seller: candidate, managerCross: false }
  }
  return null
}

/** Yksinkertainen pooltäyttö lauantaille ja kesäjuhlalle — ei viikkoankkureita,
 *  kaikki (myös päälliköt) kilpailevat samasta kierrosta tasavertaisesti. */
function fillFromPool(
  shifts: Shift[], assignedToday: Set<string>, plan: WeekPlan, dateStr: string,
  store: StoreName, template: ShiftTemplate, headcount: number,
) {
  const pool = [...ANCHOR_ROSTER, ...Object.values(STORE_MANAGERS)]
  for (let i = 0; i < headcount; i++) {
    const direct = pool.find(s => !assignedToday.has(s) && plan.canWork(s, dateStr))
    const seller = direct ?? fallbackFor(dateStr, assignedToday, plan, store)?.seller
    if (!seller) continue
    shifts.push(shiftFrom(store, seller, template))
    assignedToday.add(seller)
    plan.record(seller, false)
  }
}

export function generateMonth(year: number, month: number): DayInfo[] {
  const days: DayInfo[] = []
  const daysInMonth = new Date(year, month, 0).getDate()
  let plan = new WeekPlan(0)
  let weekIndex = 0
  let weekStarted = false

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day)
    const weekday = date.getDay()
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    // Viikko vaihtuu maanantaisin (viikko on ma-su, ei ma-la kuten myymälän aukiolo).
    if (weekday === 1) {
      plan = new WeekPlan(weekStarted ? ++weekIndex : weekIndex)
      weekStarted = true
    }

    if (weekday === 0) {
      days.push({ date: dateStr, weekday, closed: true, note: 'Suljettu', shifts: [] })
      continue
    }

    const note = getNote(dateStr)
    const lucky = LUCKY_DAYS[dateStr]
    const shifts: Shift[] = []
    const assignedToday = new Set<string>()

    // Onnenpäivä: myymäläpäällikkö saa automaattisen vuoron, kaikki muut
    // myymälät (ja tämän myymälän muut myyjät) tyhjinä.
    if (lucky) {
      for (const store of STORES) {
        const luckyForStore = lucky.find(l => l.store === store)
        if (!luckyForStore) continue
        const tmpl = weekday === 6 ? OP_SATURDAY_SHIFT : OP_WEEKDAY_SHIFT
        shifts.push(shiftFrom(store, luckyForStore.seller, tmpl))
        assignedToday.add(luckyForStore.seller)
        plan.record(luckyForStore.seller, false)
      }
      days.push({ date: dateStr, weekday, closed: false, note, shifts })
      continue
    }

    if (dateStr === KESAJUHLA_DATE) {
      for (const store of STORES) fillFromPool(shifts, assignedToday, plan, dateStr, store, KESAJUHLA_SHIFT, STORE_NORMAL_HEADCOUNT[store])
      days.push({ date: dateStr, weekday, closed: false, note, shifts })
      continue
    }

    if (weekday === 6) {
      for (const store of STORES) fillFromPool(shifts, assignedToday, plan, dateStr, store, SATURDAY_SHIFT, STORE_NORMAL_HEADCOUNT[store])
      days.push({ date: dateStr, weekday, closed: false, note, shifts })
      continue
    }

    // Normaali arkipäivä (ma-pe): päällikkö kotivuoroon ma-ke, viikkoankkurit
    // täyttävät saman paikan/ajan joka päivä, Raminin vakioaukot to/pe, loput
    // (Malmin ma-ekstra + to/pe-ilta) swingille, ja poissaolojen aiheuttamat
    // aukot varajärjestykselle (Ramin → Antti → Albin).
    for (const store of STORES) {
      const templates = [...WEEKDAY_SHIFTS[store]]
      if (store === 'Malmi' && weekday === 1) templates.push(MALMI_MONDAY_EXTRA)

      const manager = STORE_MANAGERS[store]
      const mgrIdx = managerTemplateIndex(store)

      templates.forEach((tmpl, idx) => {
        let seller: string | undefined | null

        if (idx === mgrIdx && weekday <= 3 && plan.managerHomeUsed(manager) < MANAGER_HOME_SHIFTS_PER_WEEK
            && !assignedToday.has(manager) && plan.canWork(manager, dateStr)) {
          shifts.push(shiftFrom(store, manager, tmpl))
          assignedToday.add(manager)
          plan.record(manager, true)
          return
        }

        seller = plan.anchorFor(store, idx)
        if (seller && !assignedToday.has(seller) && plan.canWork(seller, dateStr)) {
          shifts.push(shiftFrom(store, seller, tmpl))
          assignedToday.add(seller)
          plan.record(seller, false)
          return
        }

        const isRaminSlot = idx === templates.length - 1 && RAMIN_SLOTS.some(r => r.store === store && r.weekday === weekday)
        if (isRaminSlot && !assignedToday.has(RAMIN) && plan.canWork(RAMIN, dateStr)) {
          shifts.push(shiftFrom(store, RAMIN, tmpl))
          assignedToday.add(RAMIN)
          plan.record(RAMIN, false)
          return
        }

        if (store === 'Malmi' && idx === templates.length - 1 && plan.swing
            && !assignedToday.has(plan.swing) && plan.canWork(plan.swing, dateStr)) {
          shifts.push(shiftFrom(store, plan.swing, tmpl))
          assignedToday.add(plan.swing)
          plan.record(plan.swing, false)
          return
        }

        const fallback = fallbackFor(dateStr, assignedToday, plan, store)
        if (fallback) {
          shifts.push(shiftFrom(store, fallback.seller, tmpl))
          assignedToday.add(fallback.seller)
          plan.record(fallback.seller, false, fallback.managerCross)
        }
      })
    }

    days.push({ date: dateStr, weekday, closed: false, note, shifts })
  }

  return days
}

export function generateAugust2026(): DayInfo[] {
  return generateMonth(2026, 8)
}
