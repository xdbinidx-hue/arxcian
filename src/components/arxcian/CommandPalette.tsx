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

/** Herätesana joka avaa paletin ja lähettää loppuosan kysymyksenä avustajalle. */
const WAKE_WORD = 'arxcian'

/**
 * Kuinka monta muokkausta (lisäys/poisto/korvaus) sallitaan ehdokkaan ja
 * "arxcian":n välillä. 3 kattaa havaitut suomenkieliset väärinkuulemat
 * ("arksian" 2, "arction" 3, "arksi" 3) ilman että kynnys on niin löysä
 * että se alkaisi osua täysin muihin lyhyisiin sanoihin.
 */
const WAKE_WORD_MAX_DISTANCE = 3

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
 * Etsii herätesanan sanalistan alusta sumealla vertailulla — suomen
 * puheentunnistus ei kirjoita "arxcian":ia koskaan täysin oikein. Kokeillaan
 * 1–3 ensimmäisen sanan yhdistelmiä yhteenliitettynä, koska väärinkuultu
 * sana voi jakautua kahdeksi ("arksi on"). Palauttaa parhaiten (pienin
 * etäisyys) täsmäävän ehdokkaan sanamäärän, jotta kutsuja tietää tarkalleen
 * kuinka monta sanaa jää herätesanan alle — tai null jos mikään ei täsmää.
 */
function matchWakeWord(words: string[]): number | null {
  let bestWindow: number | null = null
  let bestDistance = Infinity

  for (let windowSize = 1; windowSize <= 3 && windowSize <= words.length; windowSize++) {
    const candidate = words
      .slice(0, windowSize)
      .join('')
      .toLowerCase()
      .replace(/ä/g, 'a')
    const distance = levenshtein(candidate, WAKE_WORD)
    if (distance <= WAKE_WORD_MAX_DISTANCE && distance < bestDistance) {
      bestDistance = distance
      bestWindow = windowSize
    }
  }
  return bestWindow
}

/** Kuuntelun tila pienenä pisteenä. Näkyy myös kun paletti on kiinni — juuri silloin kuuntelu on merkityksellistä. */
function MicStatus({ isListening, micSupported }: { isListening: boolean; micSupported: boolean }) {
  if (!micSupported) return null
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-16 right-3 z-40 flex items-center gap-1.5 rounded-full ax-glass px-2.5 py-1 lg:bottom-3"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isListening ? 'ax-pulse bg-ax-up' : 'bg-ax-faint'}`} />
      <span className="font-mono text-[9px] uppercase tracking-wider text-ax-faint">
        {isListening ? 'kuuntelee' : 'mikrofoni'}
      </span>
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
  const [micSupported, setMicSupported] = useState(false)
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

  const micSupportedRef = useRef(false)

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
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.addEventListener('ended', () => URL.revokeObjectURL(url))
      audio.addEventListener('error', () => URL.revokeObjectURL(url))
      await audio.play()
    } catch {
      // Ääni on lisäarvo, ei kriittinen — tekstivastaus on jo näkyvissä.
      // Epäonnistunut puhesynteesi ei saa rikkoa käyttöliittymää.
    }
  }, [])

  const askAssistant = useCallback(async (prompt: string) => {
    setMode('asking')
    setQuery('')
    audioRef.current?.pause()
    try {
      const res = await fetch('/api/arxcian/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const data = await res.json()
      if (res.ok) {
        setAnswer(data.text)
        setMode('answered')
        void speakAnswer(data.text)
      } else {
        setErrorMessage(data.error ?? 'Jokin meni pieleen.')
        setMode('error')
      }
    } catch {
      // Verkkovirhe tms. ennen kuin vastaus edes saapui — ilman tätä käyttäjä
      // jäisi 'asking'-tilaan loputtomiin, koska Escape ei tee siinä mitään.
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
      if (document.visibilityState === 'visible' && modeRef.current === 'search' && micSupportedRef.current) {
        setTimeout(() => {
          if (document.visibilityState === 'visible' && modeRef.current === 'search' && micSupportedRef.current) {
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
        // Käyttäjä kielsi mikrofonin — ei yritetä enää. Asetetaan myös ref
        // suoraan tässä, ettei onend ehdi käynnistää uudelleen ennen kuin
        // Reactin tila on ehtinyt päivittyä.
        micSupportedRef.current = false
        setMicSupported(false)
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

      // Sumea vertailu tarkan indexOf:n sijaan: suomen puheentunnistus ei
      // kirjoita "arxcian":ia koskaan täysin oikein (havaittu mm. "arksian",
      // "arksi on", "arction"). Sanat pilkotaan alkuperäisestä transkriptista
      // — vain vertailua varten tehdään pienaakkosnormalisoitu kopio kustakin
      // ehdokkaasta, jottei käyttäjän oma ä/ö/å korruptoidu itse kysymyksessä.
      const words = finalTranscript.split(/[\s,]+/).filter(Boolean)
      const matchedWords = matchWakeWord(words)
      if (matchedWords === null) return

      const rest = words.slice(matchedWords).join(' ').trim()
      if (!rest || !/[a-zA-Z0-9äöåÄÖÅ]/.test(rest)) return

      setOpen(true)
      askAssistant(rest)
    }

    recognitionRef.current = recognition
    micSupportedRef.current = true
    setMicSupported(true)

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
    if (!recognition || !micSupported) return
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
  }, [mode, micSupported])

  // Välilehden näkyvyys: taustalla ei kuunnella, takaisin tullessa jatketaan
  // jos paletti on yhä haku-tilassa.
  useEffect(() => {
    const onVisibilityChange = () => {
      const recognition = recognitionRef.current
      if (!recognition || !micSupportedRef.current) return
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
      <MicStatus isListening={isListening} micSupported={micSupported} />

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
              <div className="max-h-72 overflow-y-auto whitespace-pre-wrap p-4 text-[13px] leading-relaxed text-ax-text">
                {answer}
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
