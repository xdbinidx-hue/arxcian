'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HUB_HREF, SECTIONS } from '@/lib/arxcian/nav'
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
  isListening,
  micAvailable,
  micAllowed,
  directMode,
  heard,
  onAsk,
}: {
  isListening: boolean
  micAvailable: boolean
  micAllowed: boolean
  directMode: boolean
  heard: Heard | null
  onAsk: () => void
}) {
  if (!micAvailable) return null

  const label = directMode
    ? 'puhu nyt'
    : !micAllowed
      ? 'salli mikrofoni'
      : isListening
        ? 'kuuntelee'
        : 'mikrofoni'

  return (
    <button
      type="button"
      onClick={onAsk}
      aria-label={directMode ? 'Peruuta puhekysymys' : 'Kysy puheella'}
      className={`fixed bottom-16 right-3 z-40 flex max-w-[70vw] items-center gap-1.5 rounded-full ax-glass px-2.5 py-1 transition-colors hover:bg-ax-panel-hi lg:bottom-3 ${
        directMode ? 'ring-1 ring-ax-accent' : ''
      }`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          directMode
            ? 'ax-pulse bg-ax-accent'
            : !micAllowed
              ? 'bg-ax-warn'
              : isListening
                ? 'ax-pulse bg-ax-up'
                : 'bg-ax-faint'
        }`}
      />
      <span
        className={`shrink-0 font-mono text-[9px] uppercase tracking-wider ${
          directMode ? 'text-ax-accent' : 'text-ax-faint'
        }`}
      >
        {label}
      </span>
      {heard && !directMode && (
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
  /** Suora kysymystila: seuraava kuultu lause menee assistentille ilman
   *  herätesanaa. Käynnistyy vain napista, ei koskaan itsestään. */
  const [directMode, setDirectMode] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const router = useRouter()

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

  // Suora tila ei jää päälle jos käyttäjä painoi nappia vahingossa.
  useEffect(() => {
    if (!directMode) return
    const timer = setTimeout(() => {
      directModeRef.current = false
      setDirectMode(false)
    }, 15000)
    return () => clearTimeout(timer)
  }, [directMode])

  // Kuultu lause katoaa itsestään, jottei merkki jää roikkumaan vanhaan.
  // Ohi mennyt komento näkyy pidempään: siinä on käyttäjälle luettavaa,
  // läpi menneessä ei — paletti avautuu joka tapauksessa sen päälle.
  useEffect(() => {
    if (!heard) return
    const timer = setTimeout(() => setHeard(null), heard.status === 'ok' ? 6000 : 10000)
    return () => clearTimeout(timer)
  }, [heard])

  /**
   * Lukee assistentin vastauksen ääneen (Google Cloud TTS, brittienglantia
   * — ks. src/lib/arxcian/tts.ts). Käyttäjän oma puhe tunnistetaan yhä
   * suomeksi (recognition.lang alempana), vain assistentin vastaus on
   * tarkoituksella englanniksi sekä tekstinä että äänenä.
   */
  const speakAnswer = useCallback(async (text: string) => {
    try {
      const res = await fetch('/api/arxcian/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) {
        setSpeechBlocked(true)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.addEventListener('ended', () => URL.revokeObjectURL(url))
      audio.addEventListener('error', () => URL.revokeObjectURL(url))
      await audio.play()
      setSpeechBlocked(false)
    } catch {
      // Yleisin syy ei ole verkko vaan selaimen automaattisen toiston esto:
      // puheella kysyttäessä sivulla ei ole käyttäjän elettä, jolloin play()
      // hylätään. Ääni on lisäarvo, joten käyttöliittymä ei saa rikkoutua —
      // mutta epäonnistuminen ei myöskään saa jäädä näkymättömäksi, joten
      // tarjotaan nappi jolla vastauksen saa kuuluviin.
      setSpeechBlocked(true)
    }
  }, [])

  const askAssistant = useCallback(async (prompt: string) => {
    setMode('asking')
    setQuery('')
    setAnswer(null)
    setSpeechBlocked(false)
    audioRef.current?.pause()
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

      // NDJSON: yksi tapahtuma per rivi. Verkkopala voi katketa keskeltä riviä,
      // joten vajaa loppu jää puskuriin seuraavaa lukukierrosta varten.
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as { type: 'text' | 'error'; value: string }
          if (event.type === 'error') {
            setErrorMessage(event.value)
            setMode('error')
            return
          }
          full += event.value
          setAnswer(full)
          // Ensimmäinen pala vaihtaa näkymän, jotta käyttäjä näkee vastauksen
          // syntyvän sen sijaan että tuijottaisi "Kysytään assistentilta…" -
          // tekstiä koko generoinnin ajan.
          setMode('answered')
        }
      }

      if (!full) {
        setErrorMessage('Jokin meni pieleen.')
        setMode('error')
        return
      }

      // Ääni vasta kun teksti on valmis: puhesynteesi tarvitsee koko vastauksen.
      void speakAnswer(full)
    } catch {
      // Verkkovirhe tms. — ilman tätä käyttäjä jäisi 'asking'-tilaan
      // loputtomiin, koska Escape ei tee siinä mitään.
      setErrorMessage('Jokin meni pieleen.')
      setMode('error')
    }
    // speakAnswer on itsekin riippumaton renderöinnistä ([]-riippuvuus), joten
    // sen lisääminen tähän ei riko "vain vakaita referenssejä" -periaatetta.
  }, [speakAnswer])

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
      audioRef.current?.pause()
    }
  }, [open])

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
      // Muut virheet (esim. 'no-speech'): ei erikoiskäsittelyä, onend hoitaa
      // uudelleenkäynnistyksen normaalisti.
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
   * Kysy puheella ilman herätesanaa: seuraava kuultu lause menee suoraan
   * assistentille.
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

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (mode === 'asking') return // odotetaan vastausta
      if (mode === 'answered' || mode === 'error') {
        setMode('search')
        setAnswer(null)
        setErrorMessage(null)
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

  return (
    <>
      <MicStatus
        isListening={isListening}
        micAvailable={micAvailable}
        micAllowed={micAllowed}
        directMode={directMode}
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
                <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-ax-text">{answer}</div>
                {speechBlocked && answer && (
                  <button
                    type="button"
                    onClick={() => void speakAnswer(answer)}
                    className="mt-3 rounded-md border border-ax-line px-2.5 py-1 text-[11px] text-ax-accent transition-colors hover:bg-ax-accent/10"
                  >
                    Toista ääneen
                  </button>
                )}
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
