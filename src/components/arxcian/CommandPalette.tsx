'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HUB_HREF, SECTIONS } from '@/lib/arxcian/nav'
import { createSpeechSplitter } from '@/lib/arxcian/speakable'
import { SpeechQueue } from '@/lib/arxcian/speechQueue'
import { SectionIcon, IconHub, IconSearch } from './icons'

type Command = {
  id: string
  label: string
  hint: string
  href: string
  icon: 'hub' | (typeof SECTIONS)[number]['id']
}

const COMMANDS: Command[] = [
  { id: 'hub', label: 'Hub', hint: 'Etusivu', href: HUB_HREF, icon: 'hub' },
  ...SECTIONS.map(s => ({
    id: s.id,
    label: s.label,
    hint: s.description,
    href: s.href,
    icon: s.id,
  })),
]

/** Paletin näkymä: haku, kysymys lähdössä, vastaus odottaa, tai virhe. */
type Mode = 'search' | 'asking' | 'answered' | 'error'

/**
 * Yksi tapahtuma assistentin NDJSON-virrasta.
 *
 * `proposal` tulee enintään kerran pyyntöä kohti ja aina ennen mallin sanallista
 * selostusta. Argumentteja ei lähetetä: selain vahvistaa pelkällä tunnisteella,
 * jolloin niitä ei voi muokata ehdotuksen ja suorituksen välissä.
 */
type AssistantEvent =
  | { type: 'text'; value: string }
  | { type: 'error'; value: string }
  | { type: 'proposal'; value: { id: string; tool: string; summary: string } }

/** Vahvistusta odottava kirjoitustoimi ja sen tila selaimessa. */
type ProposalCard = {
  id: string
  tool: string
  summary: string
  /** pending = odottaa käyttäjää, confirming = pyyntö matkalla, done/failed = ohi. */
  status: 'pending' | 'confirming' | 'done' | 'failed'
  /** Lopputuloksen teksti: palvelimen summary tai virheilmoitus. */
  message?: string
}

/** Työkalun nimi käyttäjälle. Tuntematon nimi näytetään sellaisenaan. */
const TOOL_LABEL: Record<string, string> = {
  create_note: 'Muistiinpano',
  create_goal: 'Tavoite',
  complete_habit_today: 'Rutiini',
  create_alert: 'Hälytys',
}

/**
 * Ääniohjauksen tila. Jokainen näkyy käyttöliittymässä — hiljainen
 * epäonnistuminen on ääniohjauksen pahin vika, koska käyttäjä ei näe
 * kuunteleeko kone, ajatteleeko se vai onko se kaatunut.
 */
type VoiceState = 'idle' | 'ready' | 'listening' | 'processing' | 'speaking' | 'denied' | 'error'

/** Tilan selite merkissä. Virhetila näyttää virheen tekstin, ei tätä. */
const VOICE_LABEL: Record<Exclude<VoiceState, 'error'>, string> = {
  idle: 'mikrofoni',
  ready: 'valmiina',
  listening: 'kuuntelee',
  processing: 'käsittelee',
  speaking: 'puhuu',
  denied: 'salli mikrofoni',
}

/**
 * Puheentunnistuksen virheet käyttäjän kielellä.
 *
 * 'aborted' ja 'no-speech' puuttuvat tarkoituksella: edellinen tulee joka
 * kerta kun kuuntelu pysäytetään normaalisti, jälkimmäinen taustakuuntelun
 * hiljaisuudesta muutaman sekunnin välein. Kumpikaan ei ole vika.
 */
const RECOGNITION_ERROR: Partial<Record<SpeechRecognitionErrorCode, string>> = {
  'not-allowed': 'mikrofonilupa evätty',
  'service-not-allowed': 'selain esti puheentunnistuksen',
  'audio-capture': 'mikrofonia ei löytynyt',
  network: 'ei yhteyttä puheentunnistukseen',
  'bad-grammar': 'puheentunnistus epäonnistui',
  'language-not-supported': 'kieltä ei tueta',
}

/**
 * Viimeksi kuultu lause ja se, mitä sille tapahtui. Pelkkä teksti ei riitä:
 * kuultu mutta ohi mennyt komento näyttäisi täsmälleen samalta kuin läpi
 * mennyt, eikä käyttäjä näkisi kaatuiko herätesana vai puuttuiko kysymys.
 */
type Heard = {
  text: string
  status: 'ok' | 'no-wake' | 'no-question'
}

/** Merkin selite kullekin lopputulokselle. */
const HEARD_PREFIX: Record<Heard['status'], string> = {
  ok: 'kuulin',
  'no-wake': 'ei herätesanaa',
  'no-question': 'sano kysymys perään',
}

/* ---------------------------------------------------------------
   Web Speech API -tyypit. Ei standardi eikä TypeScriptin lib.dom:ssa
   (Chrome/Safari-vain, webkit-etuliitteinen versio yhä laajimmin tuettu),
   joten tyypit määritellään tässä minimissään sen sijaan että tuotaisiin
   koko riippuvuus jota tarvitaan vain yhdessä paikassa.
   --------------------------------------------------------------- */

type SpeechRecognitionErrorCode =
  | 'no-speech'
  | 'aborted'
  | 'audio-capture'
  | 'network'
  | 'not-allowed'
  | 'service-not-allowed'
  | 'bad-grammar'
  | 'language-not-supported'

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: { readonly transcript: string }
}

interface SpeechRecognitionResultListLike {
  readonly length: number
  [index: number]: SpeechRecognitionResultLike
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultListLike
}

interface SpeechRecognitionErrorEventLike {
  readonly error: SpeechRecognitionErrorCode
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

/**
 * Ikkunatapahtuma jolla mikä tahansa näkymä voi avata paletin ilman propseja.
 * Vienti tästä tiedostosta, jotta nimi ei ole kahdessa paikassa merkkijonona.
 */
export const OPEN_PALETTE_EVENT = 'arxcian:open-palette'

/** Herätesana joka avaa paletin ja lähettää loppuosan kysymyksenä avustajalle. */
const WAKE_WORD = 'arxcian'

/**
 * Kuinka monta muokkausta (lisäys/poisto/korvaus) sallitaan ehdokkaan ja
 * herätesanan **äänneasun** välillä. Vertailu tehdään taitettuun muotoon
 * (ks. foldPhonetic), joten kynnys ei kulu enää x:n ja c:n korjaamiseen:
 * havaitut väärinkuulemat ovat taitettuina "arksian" 0, "arksi" 2,
 * "arction" 3. Löysempi kynnys alkaisi osua tavallisiin lyhyisiin sanoihin.
 */
const WAKE_WORD_MAX_DISTANCE = 3

/**
 * Kuinka monta täytesanaa siedetään herätesanan edellä. Tunnistin liittää
 * lauseen alkuun usein oman kuulemansa aloituksen ("hei arxcian", "no
 * arxcian"), ja ilman tätä koko komento putoaisi pelkän täytesanan takia.
 */
const WAKE_WORD_MAX_LEAD = 2

/**
 * Taittaa sanan karkeaan suomalaiseen äänneasuun vertailua varten.
 *
 * Tämä on koko sumean tunnistuksen ydin: suomen puheentunnistin ei tuota
 * koskaan kirjaimia x, c, z, q tai w, joten kirjaimellista "arxcian":ia
 * vastaan verrattaessa pelkkä x:n ja c:n korjaaminen maksaa aina kaksi
 * muokkausta kolmesta — kynnykseen jää yhden kirjaimen pelivara ja komento
 * putoaa. Taitto vie molemmat puolet samaan asuun: sekä "arxcian" että
 * tunnistimen "Ark Sian" päätyvät muotoon "arksian".
 *
 * c → s (ei k) siksi, että "arxcian":n c on i:n edellä ja ääntyy s:nä.
 * Kaksoiskirjaimet typistetään, koska tunnistin arpoo niiden pituuden.
 */
function foldPhonetic(word: string): string {
  return (
    word
      .toLowerCase()
      .replace(/[äå]/g, 'a')
      .replace(/ö/g, 'o')
      // Välimerkit vasta ääkkösten jälkeen, muuten ä katoaisi kokonaan.
      .replace(/[^a-z0-9]/g, '')
      .replace(/x/g, 'ks')
      .replace(/c/g, 's')
      .replace(/z/g, 's')
      .replace(/q/g, 'k')
      .replace(/w/g, 'v')
      .replace(/(.)\1+/g, '$1')
  )
}

/** "arxcian" → "arksian". Lasketaan kerran, ei jokaisella tunnistuksella. */
const WAKE_FOLDED = foldPhonetic(WAKE_WORD)

/** Tavallinen Levenshtein-etäisyys, ei ulkoista riippuvuutta yhden käyttöpaikan vuoksi. */
function levenshtein(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const dp: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0))

  for (let i = 0; i < rows; i++) dp[i][0] = i
  for (let j = 0; j < cols; j++) dp[0][j] = j

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // poisto
        dp[i][j - 1] + 1, // lisäys
        dp[i - 1][j - 1] + cost, // korvaus
      )
    }
  }
  return dp[rows - 1][cols - 1]
}

/**
 * Etsii herätesanan lauseen alusta sumealla vertailulla — suomen
 * puheentunnistus ei kirjoita "arxcian":ia koskaan täysin oikein.
 *
 * Kaksi vapausastetta, koska ne eivät ole toisensa poissulkevia: väärin
 * kuultu herätesana voi jakautua useaksi sanaksi ("arksi on"), ja sen edellä
 * voi olla tunnistimen keksimä täytesana ("hei arxcian"). Siksi käydään läpi
 * aloituskohdat 0…WAKE_WORD_MAX_LEAD ja kunkin kohdalta 1–3 sanan ikkunat.
 *
 * Palauttaa indeksin josta kysymys alkaa — eli montako sanaa alusta kuluu
 * täytesanoihin ja herätesanaan yhteensä — tai null jos mikään ei täsmää.
 */
function matchWakeWord(words: string[]): number | null {
  let bestEnd: number | null = null
  let bestDistance = Infinity

  for (let start = 0; start <= WAKE_WORD_MAX_LEAD && start < words.length; start++) {
    for (let size = 1; size <= 3 && start + size <= words.length; size++) {
      const candidate = foldPhonetic(words.slice(start, start + size).join(''))

      // Herätesanan a on alussa tai heti yhden konsonantin jälkeen
      // ("marxian"), ja sanassa on r tai k. Ilman r/k-ehtoa kynnyksen sisään
      // mahtuisi tavallisia suomen sanoja — "asian" on taitettuna vain kahden
      // muokkauksen päässä — ja paletti avautuisi kesken tavallisen puheen.
      if (!/^.?a/.test(candidate) || !/[rk]/.test(candidate)) continue

      const distance = levenshtein(candidate, WAKE_FOLDED)
      if (distance <= WAKE_WORD_MAX_DISTANCE && distance < bestDistance) {
        bestDistance = distance
        bestEnd = start + size
      }
    }
  }
  return bestEnd
}

/**
 * Kuuntelun tila ja katkaisin. Näkyy myös kun paletti on kiinni — juuri
 * silloin kuuntelu on merkityksellistä.
 *
 * Tämä on nappi eikä koriste kahdesta syystä: Safari (sekä Macilla että
 * iOS:llä) käynnistää puheentunnistuksen vain käyttäjän eleestä, ja evätty
 * mikrofonilupa tarvitsee tavan yrittää uudelleen ilman sivun uudelleen-
 * latausta. Klikkaus antaa sivulle myös käyttäjäaktivoinnin, jota selain
 * vaatii vastauksen toistamiseen ääneen.
 *
 * Viimeksi kuultu lause näytetään muutaman sekunnin ajan selitteineen: ilman
 * sitä herätesanan ohi menevä tunnistus näyttää täsmälleen samalta kuin
 * rikki oleva mikrofoni.
 */
function MicStatus({
  state,
  micAvailable,
  error,
  heard,
  onAsk,
}: {
  state: VoiceState
  micAvailable: boolean
  error: string | null
  heard: Heard | null
  onAsk: () => void
}) {
  if (!micAvailable) return null

  const dot: Record<VoiceState, string> = {
    idle: 'bg-ax-faint',
    ready: 'bg-ax-up',
    listening: 'ax-pulse bg-ax-accent',
    processing: 'ax-pulse bg-ax-warn',
    speaking: 'ax-pulse bg-ax-up',
    denied: 'bg-ax-warn',
    error: 'bg-ax-down',
  }

  const text: Record<VoiceState, string> = {
    idle: 'text-ax-faint',
    ready: 'text-ax-faint',
    listening: 'text-ax-accent',
    processing: 'text-ax-warn',
    speaking: 'text-ax-up',
    denied: 'text-ax-warn',
    error: 'text-ax-down',
  }

  const label = state === 'error' ? (error ?? 'virhe') : VOICE_LABEL[state]

  // Kuultu lause näytetään vain lepotilassa: kuunnellessa, käsitellessä ja
  // puhuessa merkki kertoo tuoreempaa asiaa, eikä lappu mahdu kahdesti.
  const showHeard = heard && (state === 'idle' || state === 'ready')

  return (
    <button
      type="button"
      onClick={onAsk}
      aria-label={state === 'listening' ? 'Lopeta kuuntelu' : 'Kysy puheella'}
      aria-live="polite"
      className={`fixed bottom-16 right-3 z-40 flex max-w-[70vw] items-center gap-1.5 rounded-full ax-glass px-2.5 py-1 transition-colors hover:bg-ax-panel-hi lg:bottom-3 ${
        state === 'listening' ? 'ring-1 ring-ax-accent' : ''
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot[state]}`} />
      <span className={`shrink-0 font-mono text-[9px] uppercase tracking-wider ${text[state]}`}>
        {label}
      </span>
      {showHeard && (
        <span
          className={`truncate text-[9px] ${heard.status === 'ok' ? 'text-ax-dim' : 'text-ax-warn'}`}
          title={heard.text}
        >
          {HEARD_PREFIX[heard.status]}: {heard.text}
        </span>
      )}
    </button>
  )
}

/**
 * Vahvistuskortti avustajan ehdottamalle kirjoitustoimelle.
 *
 * **Mikään ei tapahdu ilman käyttäjän painallusta.** Ei oletusvalintaa, ei
 * Enter-oikopolkua, ei automaattista vahvistusta ajastimella: avustaja saa
 * ehdottaa, käyttäjä päättää. Suorituksen jälkeen kortti jää näkyviin
 * lopputuloksen kanssa, koska ehdotus on palvelimella kertakäyttöinen eikä
 * epäonnistunutta voi yrittää uudelleen — käyttäjän on nähtävä kumpi kävi.
 */
function ProposalPanel({
  card,
  onConfirm,
  onDismiss,
}: {
  card: ProposalCard
  onConfirm: () => void
  onDismiss: () => void
}) {
  const label = TOOL_LABEL[card.tool] ?? card.tool
  const open = card.status === 'pending' || card.status === 'confirming'

  return (
    <div
      className={`mt-3 rounded-lg border p-3 ${
        card.status === 'failed'
          ? 'border-ax-down/40 bg-ax-down/[0.06]'
          : card.status === 'done'
            ? 'border-ax-up/40 bg-ax-up/[0.06]'
            : 'border-ax-accent/40 bg-ax-accent/[0.06]'
      }`}
    >
      <div className="font-mono text-[9px] uppercase tracking-wider text-ax-faint">
        {open ? 'Vahvistus vaaditaan' : card.status === 'done' ? 'Tehty' : 'Ei tehty'} · {label}
      </div>

      <div className="mt-1.5 text-[13px] leading-relaxed text-ax-text">{card.summary}</div>

      {card.message && card.status !== 'done' && (
        <div className="mt-1.5 text-[11px] text-ax-down">{card.message}</div>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        {open ? (
          <>
            <button
              type="button"
              onClick={onConfirm}
              disabled={card.status === 'confirming'}
              className="rounded-md border border-ax-accent/60 bg-ax-accent/15 px-3 py-1 text-[12px] text-ax-accent transition-colors hover:bg-ax-accent/25 disabled:opacity-50"
            >
              {card.status === 'confirming' ? 'Vahvistetaan…' : 'Vahvista'}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              disabled={card.status === 'confirming'}
              className="rounded-md border border-ax-line px-3 py-1 text-[12px] text-ax-dim transition-colors hover:bg-ax-panel-hi disabled:opacity-50"
            >
              Peruuta
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md border border-ax-line px-3 py-1 text-[12px] text-ax-dim transition-colors hover:bg-ax-panel-hi"
          >
            Sulje
          </button>
        )}
      </div>
    </div>
  )
}

/** Komentopaletti nopeaan siirtymiseen — ja kun mikään komento ei osu, kysymys AI-avustajalle samassa ikkunassa. */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState<Mode>('search')
  const [answer, setAnswer] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  /** Selain tukee puheentunnistusta. */
  const [micAvailable, setMicAvailable] = useState(false)
  /** ...ja mikrofonilupa on voimassa. Erillään tuesta, jotta evätyn luvan
   *  jälkeen merkki jää näkyviin ja tarjoaa uuden yrityksen. */
  const [micAllowed, setMicAllowed] = useState(false)
  /** Viimeksi kuultu lause ja sen lopputulos, näytetään hetken merkissä. */
  const [heard, setHeard] = useState<Heard | null>(null)
  /** Selain esti äänen automaattisen toiston — tarjotaan nappi. */
  const [speechBlocked, setSpeechBlocked] = useState(false)
  /** Puhejono soittaa parhaillaan jotain palaa. */
  const [speaking, setSpeaking] = useState(false)
  /** Äänen haku epäonnistui (verkko, kiintiö, palvelin). */
  const [speechError, setSpeechError] = useState<string | null>(null)
  /** Mikrofonin tai puheentunnistuksen virhe, näkyy merkissä. */
  const [voiceError, setVoiceError] = useState<string | null>(null)
  /** Suora kysymystila: seuraava kuultu lause menee assistentille ilman
   *  herätesanaa. Käynnistyy vain napista, ei koskaan itsestään. */
  const [directMode, setDirectMode] = useState(false)
  /** Vahvistusta odottava kirjoitustoimi. */
  const [proposal, setProposal] = useState<ProposalCard | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const router = useRouter()

  /**
   * Puhejono. Elää renderöinnin ulkopuolella refissä, koska sen tila (mikä
   * pala soi, mitkä on haettu) ei kuulu näkymään — näkymä saa vain tiedon
   * puhuuko kone ja estikö selain toiston.
   */
  const speechRef = useRef<SpeechQueue | null>(null)
  const getSpeech = useCallback(() => {
    if (!speechRef.current) {
      speechRef.current = new SpeechQueue({
        onSpeakingChange: setSpeaking,
        onBlocked: () => setSpeechBlocked(true),
        onError: message => setSpeechError(message),
      })
    }
    return speechRef.current
  }, [])

  // Komponentin purku ei saa jättää ääntä soimaan.
  useEffect(() => () => speechRef.current?.cancel(), [])

  /**
   * Kesken oleva assistenttipyyntö. Ilman keskeytystä vanha virta jatkaisi
   * tekstin ja puhepalojen syöttämistä sen jälkeen kun käyttäjä on jo kysynyt
   * uutta tai sulkenut paletin.
   */
  const requestRef = useRef<AbortController | null>(null)

  /** Ehdotus myös refissä: käsittelijät ovat vakaita eivätkä näe tuoreinta tilaa. */
  const proposalRef = useRef<ProposalCard | null>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COMMANDS
    return COMMANDS.filter(c => `${c.label} ${c.hint}`.toLowerCase().includes(q))
  }, [query])

  // Kysymysrivi näkyy vain kun haku ei osunut mihinkään komentoon ja käyttäjä
  // on kirjoittanut jotain — tyhjällä haulla results on aina koko COMMANDS.
  const askVisible = mode === 'search' && results.length === 0 && query.trim() !== ''
  const selectableCount = results.length > 0 ? results.length : askVisible ? 1 : 0

  // mode-arvo tallennetaan refiin puheentunnistuksen onend/onerror-käsittelijöitä
  // varten: ne luodaan kerran mount-effectissä eivätkä siksi näkisi tuoreinta
  // Reactin tilaa suoraan sulkeumasta — sama kuvio kuin GlobeScenessä.
  const modeRef = useRef(mode)
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  const micAllowedRef = useRef(false)
  const directModeRef = useRef(false)

  // Kuuntelu ei jää päälle jos käyttäjä painoi nappia vahingossa. Syy
  // näytetään: hiljainen paluu lepotilaan näyttäisi samalta kuin rikki oleva
  // mikrofoni, ja juuri sitä ääniohjauksessa ei saa joutua arvaamaan.
  useEffect(() => {
    if (!directMode) return
    const timer = setTimeout(() => {
      directModeRef.current = false
      setDirectMode(false)
      setVoiceError('en kuullut mitään')
    }, 15000)
    return () => clearTimeout(timer)
  }, [directMode])

  // Virheilmoitus katoaa itsestään kuten kuultu lausekin. Evätty mikrofonilupa
  // näkyy tämän jälkeenkin 'salli mikrofoni' -tilana, joten tieto ei katoa.
  useEffect(() => {
    if (!voiceError) return
    const timer = setTimeout(() => setVoiceError(null), 8000)
    return () => clearTimeout(timer)
  }, [voiceError])

  // Kuultu lause katoaa itsestään, jottei merkki jää roikkumaan vanhaan.
  // Ohi mennyt komento näkyy pidempään: siinä on käyttäjälle luettavaa,
  // läpi menneessä ei — paletti avautuu joka tapauksessa sen päälle.
  useEffect(() => {
    if (!heard) return
    const timer = setTimeout(() => setHeard(null), heard.status === 'ok' ? 6000 : 10000)
    return () => clearTimeout(timer)
  }, [heard])

  /**
   * Sulkee vahvistusta odottavan ehdotuksen näkyvistä.
   *
   * Yhä odottava ehdotus **peruutetaan myös palvelimelta**: muuten se jäisi
   * roikkumaan kymmeneksi minuutiksi ja olisi vahvistettavissa senkin jälkeen
   * kun käyttäjä on jo sivuuttanut sen. Suoritettu tai epäonnistunut ehdotus
   * on palvelimella jo poistettu, joten sille ei lähetetä mitään.
   */
  const dropProposal = useCallback(() => {
    const current = proposalRef.current
    // Ref tyhjennetään heti, ettei kaksi peräkkäistä sulkemista lähetä kahta pyyntöä.
    proposalRef.current = null
    setProposal(null)
    if (!current || current.status !== 'pending') return
    void fetch(`/api/arxcian/assistant/confirm?id=${encodeURIComponent(current.id)}`, {
      method: 'DELETE',
      keepalive: true,
    }).catch(() => {
      // Peruutus on siivousta: epäonnistuessaan ehdotus vanhenee itsestään.
    })
  }, [])

  /**
   * Suorittaa ehdotuksen käyttäjän nimenomaisesta painalluksesta.
   *
   * Ehdotus on palvelimella kertakäyttöinen — se poistetaan ennen suoritusta —
   * joten epäonnistuneelle vahvistukselle ei tarjota uudelleenyritystä.
   * Uusi yritys kulkee mallin kautta, jotta käyttäjä näkee mitä hyväksyy.
   */
  const confirmProposal = useCallback(async () => {
    const current = proposalRef.current
    if (!current || current.status !== 'pending') return

    const busy: ProposalCard = { ...current, status: 'confirming' }
    proposalRef.current = busy
    setProposal(busy)

    const finish = (card: ProposalCard) => {
      proposalRef.current = card
      setProposal(card)
    }

    try {
      const res = await fetch('/api/arxcian/assistant/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: current.id }),
      })
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; summary?: string; error?: string }
        | null

      if (!res.ok || !data?.ok) {
        finish({ ...current, status: 'failed', message: data?.error ?? 'Toimen suoritus epäonnistui.' })
        return
      }
      finish({ ...current, status: 'done', message: data.summary ?? current.summary })
    } catch {
      // Verkko katkesi kesken vahvistuksen: emme tiedä ehtikö palvelin
      // suorittaa toimen. Sanotaan se suoraan sen sijaan että tarjottaisiin
      // uusi yritys, joka näyttäisi lupaavan ettei mitään tapahtunut.
      finish({
        ...current,
        status: 'failed',
        message: 'Yhteys katkesi kesken vahvistuksen — tarkista tuliko toimi tehdyksi.',
      })
    }
  }, [])

  const askAssistant = useCallback(async (prompt: string) => {
    // Edellinen kysymys vaikenee ja katkeaa ennen uuden aloittamista: sekä
    // puhejono että virta ovat renderöinnin ulkopuolista tilaa, joka jatkaisi
    // muuten uuden vastauksen päälle.
    requestRef.current?.abort()
    const speech = getSpeech()
    speech.cancel()
    // Edellinen ehdotus pois ennen uutta kysymystä: vanha kortti ei saa jäädä
    // roikkumaan uuden vastauksen viereen eikä ehdotus palvelimelle.
    dropProposal()

    const controller = new AbortController()
    requestRef.current = controller

    setMode('asking')
    setQuery('')
    setAnswer(null)
    setErrorMessage(null)
    setSpeechBlocked(false)
    setSpeechError(null)
    setVoiceError(null)

    // Pilkkoja on kysymyskohtainen: se pitää sisällään keskeneräisen lauseen
    // ja palojen järjestysnumeron, jotka eivät saa vuotaa seuraavaan vastaukseen.
    const splitter = createSpeechSplitter()
    const speakPieces = (pieces: string[]) => {
      if (controller.signal.aborted) return
      for (const piece of pieces) speech.push(piece)
    }

    try {
      const res = await fetch('/api/arxcian/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Pyytää suoratoiston. Ilman tätä palvelin palauttaa entisen
          // kertavastauksen, mikä pitää deployn jälkeen vielä auki olevan
          // vanhan asiakkaan toimintakuntoisena.
          Accept: 'application/x-ndjson',
        },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      })

      // Virheet ennen suoratoiston alkua (401, 429, virheellinen pyyntö) tulevat
      // yhä tavallisena JSON-vastauksena statuskoodin kera.
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null)
        setErrorMessage(data?.error ?? 'Jokin meni pieleen.')
        setMode('error')
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let full = ''
      let gotProposal = false

      // NDJSON: yksi tapahtuma per rivi. Verkkopala voi katketa keskeltä riviä,
      // joten vajaa loppu jää puskuriin seuraavaa lukukierrosta varten.
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (controller.signal.aborted) return

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as AssistantEvent

          if (event.type === 'error') {
            setErrorMessage(event.value)
            setMode('error')
            return
          }

          // Ehdotus omana haaranaan **ennen** tekstin kertymistä: value on
          // olio, joten yhteinen käsittely liimasi vastaukseen merkkijonon
          // "[object Object]" ja luki senkin ääneen. Summaryä ei lueta
          // erikseen — malli selostaa saman asian heti perään, ja kortti on
          // joka tapauksessa se mitä käyttäjä vahvistaa.
          if (event.type === 'proposal') {
            gotProposal = true
            const card: ProposalCard = { ...event.value, status: 'pending' }
            proposalRef.current = card
            setProposal(card)
            setMode('answered')
            continue
          }

          full += event.value
          setAnswer(full)
          // Ensimmäinen pala vaihtaa näkymän, jotta käyttäjä näkee vastauksen
          // syntyvän sen sijaan että tuijottaisi "Kysytään assistentilta…" -
          // tekstiä koko generoinnin ajan.
          setMode('answered')
          // Ääni lähtee liikkeelle heti ensimmäisestä valmiista lauseesta,
          // ei vasta generoinnin päätyttyä.
          speakPieces(splitter.push(event.value))
        }
      }

      if (controller.signal.aborted) return

      // Virran loppu: keskeneräinen viimeinen lause luetaan sellaisenaan.
      speakPieces(splitter.flush())

      // Pelkkä ehdotus ilman sanallista selostusta on kelvollinen vastaus.
      if (!full && !gotProposal) {
        setErrorMessage('Jokin meni pieleen.')
        setMode('error')
      }
    } catch {
      // Keskeytys on oma valinta eikä vika — käyttäjä kysyi uutta tai sulki paletin.
      if (controller.signal.aborted) return
      // Verkkovirhe tms. — ilman tätä käyttäjä jäisi 'asking'-tilaan
      // loputtomiin, koska Escape ei tee siinä mitään.
      setErrorMessage('Jokin meni pieleen.')
      setMode('error')
    }
    // Molemmat ovat []-riippuvuuksisia useCallbackeja, joten askAssistantin
    // identiteetti pysyy vakaana — puheentunnistuksen mount-effect riippuu siitä.
  }, [getSpeech, dropProposal])

  // ⌘K / Ctrl+K avaa ja sulkee
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Muut näkymät avaavat paletin tapahtumalla eivätkä propseilla: paletti
  // renderöidään Shellissä, joten esimerkiksi hubin alapalkki ei voi antaa
  // sille propsia joutumatta nostamaan tilaa koko sovelluksen läpi. Yksi
  // ikkunatapahtuma pitää ne toisistaan riippumattomina.
  useEffect(() => {
    const onOpenRequest = () => setOpen(true)
    window.addEventListener(OPEN_PALETTE_EVENT, onOpenRequest)
    return () => window.removeEventListener(OPEN_PALETTE_EVENT, onOpenRequest)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
      inputRef.current?.focus()
    } else {
      // Paletti voi sulkeutua monesta reitistä (go(), taustaklikkaus, Escape)
      // — nollataan kysymystila täällä yhdessä paikassa sen sijaan että
      // jokainen sulkukohta joutuisi muistamaan sen itse.
      setMode('search')
      setAnswer(null)
      setErrorMessage(null)
      setSpeechBlocked(false)
      setSpeechError(null)
      // Kesken oleva virta katkaistaan ja puhejono vaikenee: kumpikin jatkaisi
      // muuten näkymättömissä, ja ääni puhuisi suljetun paletin jälkeen.
      requestRef.current?.abort()
      speechRef.current?.cancel()
      // Vahvistamatta jäänyt ehdotus peruutetaan eikä jätetä odottamaan
      // vanhenemistaan — sulkeminen ei ole hyväksyntä, mutta se on päätös.
      dropProposal()
    }
  }, [open, dropProposal])

  useEffect(() => {
    setIndex(0)
  }, [query])

  /* --- Puheentunnistus: luodaan kerran, puretaan unmountissa --- */
  useEffect(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'fi-FI'

    recognition.onstart = () => setIsListening(true)

    recognition.onend = () => {
      setIsListening(false)
      // Selain katkaisee tunnistuksen ajoittain itsestään (esim. hiljaisuuden
      // jälkeen) vaikka continuous on true — käynnistetään uudelleen jos
      // mikään ei estä sitä. Pieni viive ettei uudelleenkäynnistys osu
      // täsmälleen samaan hetkeen kuin selaimen oma sulkeminen.
      if (document.visibilityState === 'visible' && modeRef.current === 'search' && micAllowedRef.current) {
        setTimeout(() => {
          if (document.visibilityState === 'visible' && modeRef.current === 'search' && micAllowedRef.current) {
            try {
              recognition.start()
            } catch {
              // jo käynnissä tms. — ei kriittistä, onend laukeaa taas jos tarpeen
            }
          }
        }, 300)
      }
    }

    recognition.onerror = event => {
      if (event.error === 'not-allowed') {
        // Käyttäjä kielsi mikrofonin — ei yritetä automaattisesti uudelleen.
        // Asetetaan myös ref suoraan tässä, ettei onend ehdi käynnistää
        // uudelleen ennen kuin Reactin tila on ehtinyt päivittyä. Merkki jää
        // näkyviin, jotta luvan voi antaa napista ilman sivun uudelleenlatausta.
        micAllowedRef.current = false
        setMicAllowed(false)
      }

      // 'aborted' seuraa jokaisesta tavallisesta pysäytyksestä ja 'no-speech'
      // taustakuuntelun hiljaisuudesta: kumpikaan ei ole käyttäjälle
      // kerrottava vika. Muut virheet näkyviin — mikrofonivika ei saa jäädä
      // pelkäksi hiljaisuudeksi. 'no-speech' kuitataan puhekysymyksen
      // aikakatkaisulla, ei täällä, koska kuuntelu jatkuu vielä sen jälkeen.
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setVoiceError(RECOGNITION_ERROR[event.error] ?? 'puheentunnistus epäonnistui')
        if (directModeRef.current) {
          directModeRef.current = false
          setDirectMode(false)
        }
      }
    }

    recognition.onresult = event => {
      let finalTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalTranscript = event.results[i][0].transcript
      }
      if (!finalTranscript) return

      // Suora tila: käyttäjä painoi nappia, joten koko lause on kysymys.
      // Tämä reitti ei riipu herätesanan tunnistuksesta lainkaan.
      if (directModeRef.current) {
        directModeRef.current = false
        setDirectMode(false)
        const question = finalTranscript.trim()
        if (!question) return
        setHeard({ text: finalTranscript, status: 'ok' })
        setOpen(true)
        askAssistant(question)
        return
      }

      // Sumea vertailu tarkan indexOf:n sijaan: suomen puheentunnistus ei
      // kirjoita "arxcian":ia koskaan täysin oikein (havaittu mm. "arksian",
      // "arksi on", "arction"). Sanat pilkotaan alkuperäisestä transkriptista
      // — vain vertailua varten tehdään taitettu kopio kustakin ehdokkaasta,
      // jottei käyttäjän oma ä/ö/å korruptoidu itse kysymyksessä.
      const words = finalTranscript.split(/[\s,]+/).filter(Boolean)
      const matchedWords = matchWakeWord(words)

      // Molemmissa hylkäyshaaroissa kerrotaan syy: hiljainen paluu jätti
      // käyttäjän arvaamaan, oliko vika herätesanassa, kysymyksessä vai
      // mikrofonissa.
      if (matchedWords === null) {
        setHeard({ text: finalTranscript, status: 'no-wake' })
        return
      }

      const rest = words.slice(matchedWords).join(' ').trim()
      if (!rest || !/[a-zA-Z0-9äöåÄÖÅ]/.test(rest)) {
        setHeard({ text: finalTranscript, status: 'no-question' })
        return
      }

      setHeard({ text: finalTranscript, status: 'ok' })
      setOpen(true)
      askAssistant(rest)
    }

    recognitionRef.current = recognition
    micAllowedRef.current = true
    setMicAvailable(true)
    setMicAllowed(true)

    try {
      recognition.start()
    } catch {
      // Harvinainen — esim. jos sivu on jo taustalla ensimmäisellä renderillä.
      // mode/visibility-effektit käynnistävät kuuntelun heti kun mahdollista.
    }

    return () => {
      recognition.onstart = null
      recognition.onend = null
      recognition.onerror = null
      recognition.onresult = null
      recognition.stop()
      recognition.abort()
      recognitionRef.current = null
    }
  }, [askAssistant])

  // Käynnistys/pysäytys mode-tilan mukaan: kuuntelu on päällä vain kun
  // paletti ei ole kysymys- tai vastausnäkymässä.
  useEffect(() => {
    const recognition = recognitionRef.current
    if (!recognition || !micAllowed) return
    if (mode === 'search') {
      if (document.visibilityState === 'visible') {
        try {
          recognition.start()
        } catch {
          // jo käynnissä
        }
      }
    } else {
      recognition.stop()
    }
  }, [mode, micAllowed])

  // Välilehden näkyvyys: taustalla ei kuunnella, takaisin tullessa jatketaan
  // jos paletti on yhä haku-tilassa.
  useEffect(() => {
    const onVisibilityChange = () => {
      const recognition = recognitionRef.current
      if (!recognition || !micAllowedRef.current) return
      if (document.visibilityState === 'hidden') {
        recognition.stop()
      } else if (modeRef.current === 'search') {
        try {
          recognition.start()
        } catch {
          // jo käynnissä
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  /**
   * Puhu-painike (push-to-talk): painallus aloittaa kuuntelun, seuraava kuultu
   * lause menee suoraan assistentille ilman herätesanaa. Uusi painallus
   * lopettaa kuuntelun, ja niin tekee myös lauseen päättyminen.
   *
   * Tämä on ääniohjauksen luotettava reitti. Herätesana "arxcian" on
   * suomenkieliselle puheentunnistukselle vaikea, ja jos se kuullaan väärin,
   * mikään ei tapahdu eikä käyttäjä saa mitään palautetta. Nappi ohittaa koko
   * ongelman. Klikkaus on samalla se käyttäjän ele jota Safari vaatii
   * tunnistuksen käynnistämiseen ja selain vastauksen toistamiseen ääneen.
   */
  const askByVoice = () => {
    const recognition = recognitionRef.current
    if (!recognition) return

    if (directModeRef.current) {
      directModeRef.current = false
      setDirectMode(false)
      recognition.stop()
      return
    }

    // Edellinen vastaus vaikenee heti kun käyttäjä alkaa puhua päälle:
    // avustajan puhe kuuluisi muuten mikrofoniin ja jatkuisi uuden kysymyksen
    // päälle. Sama syy kuin uuden kysymyksen kohdalla, eri laukaisin.
    speechRef.current?.cancel()
    setSpeechBlocked(false)
    setSpeechError(null)
    setVoiceError(null)

    micAllowedRef.current = true
    setMicAllowed(true)
    directModeRef.current = true
    setDirectMode(true)
    setHeard(null)
    try {
      recognition.start()
    } catch {
      // Jo käynnissä taustakuuntelussa — lippu poimii seuraavan lauseen.
    }
  }

  /**
   * Toistaa vastauksen uudelleen. Estetyssä tilassa jatketaan jonosta — nappi
   * on se käyttäjän ele jota selain vaati — muuten koko vastaus luetaan alusta.
   */
  const replayAnswer = () => {
    const speech = getSpeech()
    setSpeechBlocked(false)
    setSpeechError(null)

    // Selaimen esto: jono on tallella ja tämä painallus on juuri se ele jota
    // selain vaati, joten jatketaan siitä mihin jäätiin.
    if (speech.blocked) {
      speech.resume()
      return
    }

    // Muu vika (esim. yhden palan haku kaatui): luetaan koko vastaus alusta.
    // Jono tyhjennetään ensin, ettei loppuosa soi uuden alun päälle.
    if (!answer) return
    speech.cancel()
    const splitter = createSpeechSplitter()
    for (const piece of splitter.push(answer)) speech.push(piece)
    for (const piece of splitter.flush()) speech.push(piece)
  }

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Vahvistusta odottava ehdotus syö ensimmäisen Escapen: kortti ei katoa
      // vahingossa, vaan sulkeutuminen on samalla nimenomainen peruutus myös
      // palvelimelle. Kesken olevaa vahvistusta ei keskeytetä lainkaan.
      if (proposalRef.current) {
        e.preventDefault()
        if (proposalRef.current.status === 'confirming') return
        dropProposal()
        return
      }
      if (mode === 'asking') return // odotetaan vastausta
      if (mode === 'answered' || mode === 'error') {
        setMode('search')
        setAnswer(null)
        setErrorMessage(null)
        // Vastaus voi olla yhä kesken (teksti virtaa vielä): sekä virta että
        // puhejono katkaistaan, muuten ne kirjoittaisivat hakunäkymän päälle.
        requestRef.current?.abort()
        speechRef.current?.cancel()
        setSpeechBlocked(false)
        setSpeechError(null)
        inputRef.current?.focus()
        return
      }
      return setOpen(false)
    }

    // Nuolet ja Enter koskevat vain haku/tulos-listaa.
    if (mode !== 'search') return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      return setIndex(i => (i + 1) % Math.max(selectableCount, 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      return setIndex(i => (i - 1 + selectableCount) % Math.max(selectableCount, 1))
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (results[index]) return go(results[index].href)
      if (askVisible && index === 0) askAssistant(query.trim())
    }
  }

  /**
   * Yksi tila neljästä näkyvissä kerrallaan, tässä järjestyksessä: virhe menee
   * kaiken edelle (sitä ei saa piilottaa), sitten kuuntelu, käsittely ja puhe
   * — se mitä kone juuri nyt tekee käyttäjän puolesta.
   */
  const voiceState: VoiceState = voiceError
    ? 'error'
    : !micAllowed
      ? 'denied'
      : directMode
        ? 'listening'
        : mode === 'asking'
          ? 'processing'
          : speaking
            ? 'speaking'
            : isListening
              ? 'ready'
              : 'idle'

  return (
    <>
      <MicStatus
        state={voiceState}
        micAvailable={micAvailable}
        error={voiceError}
        heard={heard}
        onAsk={askByVoice}
      />

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-[14vh] backdrop-blur-sm"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Komentopaletti"
            className="w-full max-w-lg overflow-hidden ax-glass rounded-xl shadow-2xl"
          >
            <div className="flex items-center gap-3 ax-glass-divide border-b px-4">
              <IconSearch className="h-4 w-4 shrink-0 text-ax-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={mode === 'asking'}
                placeholder="Siirry osioon…"
                className="w-full bg-transparent py-3.5 text-sm text-ax-text outline-none placeholder:text-ax-faint disabled:opacity-50"
              />
              <kbd className="shrink-0 rounded border border-ax-line px-1.5 py-0.5 font-mono text-[10px] text-ax-faint">
                esc
              </kbd>
            </div>

            {mode === 'search' && (
              <ul className="max-h-72 overflow-y-auto p-1.5">
                {results.length === 0 && !askVisible && (
                  <li className="px-3 py-6 text-center text-[13px] text-ax-faint">Ei osumia.</li>
                )}
                {results.map((c, i) => (
                  <li key={c.id}>
                    <button
                      onClick={() => go(c.href)}
                      onMouseEnter={() => setIndex(i)}
                      className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${
                        i === index ? 'bg-ax-panel-hi text-ax-text' : 'text-ax-dim'
                      }`}
                    >
                      {c.icon === 'hub' ? (
                        <IconHub className="h-4 w-4 shrink-0 text-ax-accent" />
                      ) : (
                        <SectionIcon id={c.icon} className="h-4 w-4 shrink-0 text-ax-accent" />
                      )}
                      <span className="text-sm">{c.label}</span>
                      <span className="ml-auto truncate text-[11px] text-ax-faint">{c.hint}</span>
                    </button>
                  </li>
                ))}
                {askVisible && (
                  <li>
                    <button
                      onClick={() => askAssistant(query.trim())}
                      onMouseEnter={() => setIndex(0)}
                      className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${
                        index === 0 ? 'bg-ax-panel-hi text-ax-text' : 'text-ax-dim'
                      }`}
                    >
                      <IconSearch className="h-4 w-4 shrink-0 text-ax-accent" />
                      <span className="text-sm">Kysy assistentilta: {query}</span>
                    </button>
                  </li>
                )}
              </ul>
            )}

            {mode === 'asking' && (
              <div className="px-3 py-6 text-center text-[13px] text-ax-faint">Kysytään assistentilta…</div>
            )}

            {mode === 'answered' && (
              <div className="max-h-72 overflow-y-auto p-4">
                {/* Ehdotus voi tulla ennen ensimmäistä sanaa, joten vastaus
                    saa olla vielä tyhjä. */}
                {answer && (
                  <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-ax-text">{answer}</div>
                )}

                {proposal && (
                  <ProposalPanel
                    card={proposal}
                    onConfirm={() => void confirmProposal()}
                    onDismiss={dropProposal}
                  />
                )}

                <div
                  className={`mt-3 flex items-center gap-2 ${
                    speaking || speechBlocked || speechError ? '' : 'hidden'
                  }`}
                >
                  {speaking && (
                    <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-ax-up">
                      <span className="ax-pulse h-1.5 w-1.5 rounded-full bg-ax-up" />
                      puhuu
                    </span>
                  )}
                  {(speechBlocked || speechError) && answer && (
                    <button
                      type="button"
                      onClick={replayAnswer}
                      className="rounded-md border border-ax-line px-2.5 py-1 text-[11px] text-ax-accent transition-colors hover:bg-ax-accent/10"
                    >
                      Toista ääneen
                    </button>
                  )}
                  {speechError && <span className="text-[11px] text-ax-warn">{speechError}</span>}
                </div>
              </div>
            )}

            {mode === 'error' && (
              <div className="px-3 py-6 text-center text-[13px] text-ax-down">{errorMessage}</div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
