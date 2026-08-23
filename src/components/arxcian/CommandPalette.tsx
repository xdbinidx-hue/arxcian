'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { UserId } from '@/lib/session'
import { HUB_HREF, SECTIONS } from '@/lib/arxcian/nav'
import { GREETING_TEXT_HEADER, greetingText } from '@/lib/arxcian/assistant/greeting'
import { DEFAULT_LANGUAGE } from '@/lib/arxcian/assistant/types'
import { createSpeechSplitter } from '@/lib/arxcian/speakable'
import { SpeechQueue } from '@/lib/arxcian/speechQueue'
import { createUnlockedAudio, type UnlockedAudio } from '@/lib/arxcian/voice/audio'
import {
  createRecognition,
  isPermissionError,
  recognitionErrorMessage,
  type SpeechRecognitionLike,
} from '@/lib/arxcian/voice/speechRecognition'
import {
  createBrowserWakeWord,
  wakeWordSupported,
  type WakeWordDetector,
} from '@/lib/arxcian/voice/wakeWord'
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
  | { type: 'action'; value: AssistantAction }

/**
 * Avustajan pyytämä siirtymä. Osoite on tarkistettu palvelimella
 * (lib/arxcian/assistant/actions.ts) eikä tule mallilta sellaisenaan, joten
 * selain voi ohjata siihen kysymättä enempää.
 */
type AssistantAction = { action: 'navigate'; href: string; label: string }

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
type VoiceState =
  | 'idle'
  | 'ready'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'ended'
  | 'denied'
  | 'error'

/** Tilan selite merkissä. Virhetila näyttää virheen tekstin, ei tätä. */
const VOICE_LABEL: Record<Exclude<VoiceState, 'error'>, string> = {
  idle: 'mikrofoni',
  ready: 'valmiina',
  listening: 'kuuntelee',
  processing: 'käsittelee',
  speaking: 'puhuu',
  ended: 'keskustelu päättyi',
  denied: 'salli mikrofoni',
}

/**
 * Kenen vuoro mikrofoni on auki.
 *
 * 'push' on nappireitti (yksi lause kerrallaan), 'conversation' herätyssanan
 * jälkeinen keskustelu (vuoro kerrallaan, kunnes hiljaisuus tai lopetus).
 * 'off' tarkoittaa myös sitä hetkeä jolloin avustaja puhuu: **tunnistus on
 * silloin kiinni**, jottei avustajan oma ääni tule takaisin kysymyksenä.
 */
type Capture = 'off' | 'push' | 'conversation'

/**
 * Viimeksi kuultu lause ja se, mitä sille tapahtui. Pelkkä teksti ei riitä:
 * kuultu mutta ohi mennyt komento näyttäisi täsmälleen samalta kuin läpi
 * mennyt, eikä käyttäjä näkisi kaatuiko herätesana vai puuttuiko kysymys.
 */
type Heard = {
  text: string
  status: 'ok' | 'no-wake'
}

/** Merkin selite kummallekin lopputulokselle. */
const HEARD_PREFIX: Record<Heard['status'], string> = {
  ok: 'kuulin',
  'no-wake': 'ei herätesanaa',
}

/**
 * Ikkunatapahtuma jolla mikä tahansa näkymä voi avata paletin ilman propseja.
 * Vienti tästä tiedostosta, jotta nimi ei ole kahdessa paikassa merkkijonona.
 */
export const OPEN_PALETTE_EVENT = 'arxcian:open-palette'

/** Valmiiksi syntetisoitu tervehdys. Esiladataan kun kuuntelu käynnistyy. */
const GREETING_URL = '/api/arxcian/tts/greeting'

/**
 * Herätyssanan kytkin säilyy yli sivulatauksen. **Oletus on pois päältä**:
 * jatkuva mikrofonin kuuntelu on asia jonka käyttäjä ottaa käyttöön
 * tietoisesti, ei jotain joka on päällä ensimmäisellä käynnillä.
 */
const WAKE_STORAGE_KEY = 'arxcian:wake-word'

/**
 * Kuinka kauan käyttäjän vuoroa odotetaan ilman puhetta.
 *
 * Sama arvo molemmille reiteille: nappi palaa lepotilaan ("en kuullut mitään")
 * ja keskustelu päättyy. Ilman selkeää loppua mikrofoni jäisi auki
 * loputtomiin, mikä on juuri se asia jota jatkuvassa kuuntelussa pelätään.
 */
const SILENCE_TIMEOUT = 15000

/**
 * Kuuntelun tila ja katkaisimet. Näkyvät myös kun paletti on kiinni — juuri
 * silloin kuuntelu on merkityksellistä.
 *
 * Kolme erillistä hallintaa, koska ne vastaavat kolmeen eri kysymykseen:
 * kuunteleeko herätyssana taustalla (kytkin), otetaanko kysymys vastaan nyt
 * (mikrofoninappi), ja onko keskustelu yhä käynnissä (lopetus).
 *
 * Mikrofoninappi on nappi eikä koriste kahdesta syystä: Safari (sekä Macilla
 * että iOS:llä) käynnistää puheentunnistuksen vain käyttäjän eleestä, ja
 * evätty mikrofonilupa tarvitsee tavan yrittää uudelleen ilman sivun
 * uudelleenlatausta. Klikkaus antaa sivulle myös käyttäjäaktivoinnin, jota
 * selain vaatii vastauksen toistamiseen ääneen.
 */
function VoiceControls({
  state,
  micAvailable,
  error,
  heard,
  wakeSupported,
  wakeEnabled,
  wakeListening,
  conversation,
  onAsk,
  onToggleWake,
  onEndConversation,
}: {
  state: VoiceState
  micAvailable: boolean
  error: string | null
  heard: Heard | null
  wakeSupported: boolean
  wakeEnabled: boolean
  wakeListening: boolean
  conversation: boolean
  onAsk: () => void
  onToggleWake: () => void
  onEndConversation: () => void
}) {
  if (!micAvailable) return null

  const dot: Record<VoiceState, string> = {
    idle: 'bg-ax-faint',
    ready: 'bg-ax-up',
    listening: 'ax-pulse bg-ax-accent',
    processing: 'ax-pulse bg-ax-warn',
    speaking: 'ax-pulse bg-ax-up',
    ended: 'bg-ax-faint',
    denied: 'bg-ax-warn',
    error: 'bg-ax-down',
  }

  const text: Record<VoiceState, string> = {
    idle: 'text-ax-faint',
    ready: 'text-ax-faint',
    listening: 'text-ax-accent',
    processing: 'text-ax-warn',
    speaking: 'text-ax-up',
    ended: 'text-ax-dim',
    denied: 'text-ax-warn',
    error: 'text-ax-down',
  }

  const label = state === 'error' ? (error ?? 'virhe') : VOICE_LABEL[state]

  // Kuultu lause näytetään vain lepotilassa: kuunnellessa, käsitellessä ja
  // puhuessa merkki kertoo tuoreempaa asiaa, eikä lappu mahdu kahdesti.
  const showHeard = heard && (state === 'idle' || state === 'ready')

  // Merkkivalo kytkimessä kertoo eron kolmen tilan välillä: pois päältä,
  // päällä ja kuuntelee, päällä mutta tauolla (avustaja puhuu tai keskustelu
  // on käynnissä). Ilman keskimmäistä käyttäjä ei tietäisi kuuleeko kone.
  const wakeDot = !wakeEnabled ? 'bg-ax-faint' : wakeListening ? 'ax-pulse bg-ax-accent' : 'bg-ax-warn'

  return (
    <div className="fixed bottom-16 right-3 z-40 flex max-w-[80vw] flex-col items-end gap-1.5 lg:bottom-3">
      {conversation && (
        <button
          type="button"
          onClick={onEndConversation}
          className="flex items-center gap-1.5 rounded-full border border-ax-down/50 bg-ax-down/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-ax-down transition-colors hover:bg-ax-down/20"
        >
          Lopeta keskustelu
        </button>
      )}

      {wakeSupported && (
        <button
          type="button"
          onClick={onToggleWake}
          aria-pressed={wakeEnabled}
          aria-label={wakeEnabled ? 'Sammuta herätyssana' : 'Kytke herätyssana päälle'}
          title={'Herätyssana: sano "arxcian"'}
          className={`flex items-center gap-1.5 rounded-full ax-glass px-2.5 py-1 transition-colors hover:bg-ax-panel-hi ${
            wakeEnabled ? 'ring-1 ring-ax-accent/50' : ''
          }`}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${wakeDot}`} />
          <span
            className={`font-mono text-[9px] uppercase tracking-wider ${
              wakeEnabled ? 'text-ax-accent' : 'text-ax-faint'
            }`}
          >
            herätyssana {wakeEnabled ? 'päällä' : 'pois'}
          </span>
        </button>
      )}

      <button
        type="button"
        onClick={onAsk}
        aria-label={state === 'listening' ? 'Lopeta kuuntelu' : 'Kysy puheella'}
        aria-live="polite"
        className={`flex max-w-full items-center gap-1.5 rounded-full ax-glass px-2.5 py-1 transition-colors hover:bg-ax-panel-hi ${
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
    </div>
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
export function CommandPalette({ user }: { user: UserId }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState<Mode>('search')
  const [answer, setAnswer] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  /** Selain tukee puheentunnistusta. */
  const [micAvailable, setMicAvailable] = useState(false)
  /** ...ja mikrofonilupa on voimassa. Erillään tuesta, jotta evätyn luvan
   *  jälkeen merkki jää näkyviin ja tarjoaa uuden yrityksen. */
  const [micAllowed, setMicAllowed] = useState(false)
  /** Selain tukee herätyssanaa. Tilana eikä suorana kutsuna, koska
   *  palvelinrenderöinnissä selainrajapintoja ei ole eikä hydraatio saa erota. */
  const [wakeSupported, setWakeSupported] = useState(false)
  /** Herätyssana kytketty päälle (säilyy localStoragessa). */
  const [wakeEnabled, setWakeEnabled] = useState(false)
  /** Herätyssanan tunnistin kuuntelee juuri nyt. */
  const [wakeListening, setWakeListening] = useState(false)
  /** Kenen vuoro mikrofoni on auki. */
  const [capture, setCapture] = useState<Capture>('off')
  /** Keskustelu käynnissä: mikrofoni palaa auki vastauksen jälkeen. */
  const [conversation, setConversation] = useState(false)
  /** Keskustelu päättyi juuri — näytetään hetken, ettei loppu jää arvailun varaan. */
  const [conversationEnded, setConversationEnded] = useState(false)
  /** Välilehti taustalla: taustalla ei kuunnella. */
  const [hidden, setHidden] = useState(false)
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
  /** Vahvistusta odottava kirjoitustoimi. */
  const [proposal, setProposal] = useState<ProposalCard | null>(null)
  /**
   * Paletti on telakoitunut alalaitaan, koska avustaja vaihtoi näkymän.
   *
   * Peittävä tausta väistyy, jotta juuri avattu näkymä näkyy — muuten
   * "näytä trading" avaisi tradingin mustan kalvon taakse.
   */
  const [docked, setDocked] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  /** Käyttäjän vuoron kuuntelija. Eri instanssi kuin herätyssanan tunnistin. */
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  /** Herätyssanan tunnistin rajapinnan takana (voice/wakeWord.ts). */
  const wakeRef = useRef<WakeWordDetector | null>(null)
  /** Jaettu, käyttäjän eleellä avattu äänielementti (voice/audio.ts). */
  const audioRef = useRef<UnlockedAudio | null>(null)
  /** Esiladatun tervehdyksen objectURL, tai null jos esilataus ei onnistunut. */
  const greetingUrlRef = useRef<string | null>(null)
  /**
   * Tervehdyksen teksti sellaisena kuin palvelin sen sanoo. Tulee äänen mukana
   * otsakkeessa, koska kieli on käyttäjän palvelinpuolen asetus — selain ei
   * tiedä sitä eikä sen kuulu arvata, muuten ruudulla lukisi eri kieli kuin
   * kaiuttimesta kuuluu.
   */
  const greetingTextRef = useRef<string | null>(null)

  const captureRef = useRef<Capture>('off')
  const conversationRef = useRef(false)
  const micAllowedRef = useRef(false)
  /** Puhejono soi. Refinä, koska kuuntelun jatko päätetään käsittelijöissä. */
  const speakingRef = useRef(false)
  /** Assistentin vastaus on yhä matkalla: kuuntelua ei saa avata kesken sen. */
  const streamingRef = useRef(false)
  /** Hiljaisuuden ajastin: päättää vuoron ja keskustelun. */
  const silenceRef = useRef<number | null>(null)

  const getAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = createUnlockedAudio()
    return audioRef.current
  }, [])

  /**
   * Puhejono. Elää renderöinnin ulkopuolella refissä, koska sen tila (mikä
   * pala soi, mitkä on haettu) ei kuulu näkymään — näkymä saa vain tiedon
   * puhuuko kone ja estikö selain toiston.
   */
  const speechRef = useRef<SpeechQueue | null>(null)
  const getSpeech = useCallback(() => {
    if (!speechRef.current) {
      speechRef.current = new SpeechQueue({
        onSpeakingChange: value => {
          speakingRef.current = value
          setSpeaking(value)
          // Vuoro palaa käyttäjälle vasta kun jono on tyhjä: muuten avustaja
          // kuulisi oman äänensä ja vastaisi itselleen.
          if (!value) apiRef.current.maybeResume()
        },
        onBlocked: () => setSpeechBlocked(true),
        onError: message => setSpeechError(message),
        // Kaikki toisto samalla elementillä, joka on avattu käyttäjän eleellä
        // — herätyssana ei ole ele, joten uusi elementti olisi estetty.
        audio: () => getAudio().element(),
      })
    }
    return speechRef.current
  }, [getAudio])

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

  /**
   * Tuoreimmat käsittelijät refissä. Puheentunnistuksen ja herätyssanan
   * kuuntelijat luodaan kerran mount-effectissä, joten ne eivät näkisi
   * tuoreinta Reactin tilaa sulkeumasta — sama kuvio kuin GlobeScenessä.
   */
  const apiRef = useRef({
    ask: (_prompt: string) => {},
    stopCapture: () => {},
    endConversation: (_reason: 'silence' | 'user') => {},
    maybeResume: () => {},
    armSilence: () => {},
    onWake: (_rest: string) => {},
  })

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COMMANDS
    return COMMANDS.filter(c => `${c.label} ${c.hint}`.toLowerCase().includes(q))
  }, [query])

  // Kysymysrivi näkyy vain kun haku ei osunut mihinkään komentoon ja käyttäjä
  // on kirjoittanut jotain — tyhjällä haulla results on aina koko COMMANDS.
  const askVisible = mode === 'search' && results.length === 0 && query.trim() !== ''
  const selectableCount = results.length > 0 ? results.length : askVisible ? 1 : 0

  // Virheilmoitus katoaa itsestään kuten kuultu lausekin. Evätty mikrofonilupa
  // näkyy tämän jälkeenkin 'salli mikrofoni' -tilana, joten tieto ei katoa.
  useEffect(() => {
    if (!voiceError) return
    const timer = setTimeout(() => setVoiceError(null), 8000)
    return () => clearTimeout(timer)
  }, [voiceError])

  // "Keskustelu päättyi" on ilmoitus eikä tila: se katoaa itsestään, jottei
  // merkki jää kertomaan jostain joka tapahtui viisi minuuttia sitten.
  useEffect(() => {
    if (!conversationEnded) return
    const timer = setTimeout(() => setConversationEnded(false), 6000)
    return () => clearTimeout(timer)
  }, [conversationEnded])

  // Kuultu lause katoaa itsestään, jottei merkki jää roikkumaan vanhaan.
  // Ohi mennyt komento näkyy pidempään: siinä on käyttäjälle luettavaa,
  // läpi menneessä ei — paletti avautuu joka tapauksessa sen päälle.
  useEffect(() => {
    if (!heard) return
    const timer = setTimeout(() => setHeard(null), heard.status === 'ok' ? 6000 : 10000)
    return () => clearTimeout(timer)
  }, [heard])

  /* --- Vuoron hallinta: hiljaisuus, kuuntelu, keskustelun loppu --- */

  const clearSilence = useCallback(() => {
    if (silenceRef.current === null) return
    clearTimeout(silenceRef.current)
    silenceRef.current = null
  }, [])

  const stopCapture = useCallback(() => {
    clearSilence()
    captureRef.current = 'off'
    setCapture('off')
    try {
      recognitionRef.current?.stop()
    } catch {
      // Ei käynnissä — ei mitään pysäytettävää.
    }
  }, [clearSilence])

  /**
   * Päättää keskustelun ja kertoo siitä.
   *
   * Kaksi reittiä: hiljaisuus (mikrofoni ei jää auki loputtomiin) ja käyttäjän
   * nimenomainen lopetus. Jälkimmäinen vaientaa myös kesken olevan vastauksen
   * — "lopeta" tarkoittaa myös "ole hiljaa".
   */
  const endConversation = useCallback(
    (reason: 'silence' | 'user') => {
      const wasActive = conversationRef.current
      conversationRef.current = false
      setConversation(false)
      stopCapture()
      if (reason === 'user') {
        requestRef.current?.abort()
        speechRef.current?.cancel()
      }
      if (wasActive) setConversationEnded(true)
    },
    [stopCapture],
  )

  const armSilence = useCallback(() => {
    clearSilence()
    silenceRef.current = window.setTimeout(() => {
      silenceRef.current = null
      // Vuoro on jo avustajalla: se saa puhua niin kauan kuin vastaus kestää,
      // eikä hiljaisuus tarkoita tässä mitään.
      if (captureRef.current === 'off') return

      if (conversationRef.current) {
        apiRef.current.endConversation('silence')
        return
      }
      // Nappireitti: kuuntelu ei jää päälle jos käyttäjä painoi vahingossa.
      // Syy näytetään — hiljainen paluu lepotilaan näyttäisi samalta kuin
      // rikki oleva mikrofoni.
      apiRef.current.stopCapture()
      setVoiceError('en kuullut mitään')
    }, SILENCE_TIMEOUT)
  }, [clearSilence])

  /**
   * Avaa mikrofonin käyttäjän vuorolle.
   *
   * start() heittää jos edellinen pysäytys on vielä kesken (onend ei ole
   * ehtinyt laueta), joten yritystä toistetaan pari kertaa. Ilman sitä
   * keskustelu voisi jäädä hiljaiseksi kesken vuoron vaihdon eikä käyttäjä
   * näkisi mitään syytä.
   */
  const startCapture = useCallback(
    (kind: Exclude<Capture, 'off'>) => {
      const recognition = recognitionRef.current
      if (!recognition || !micAllowedRef.current) return

      captureRef.current = kind
      setCapture(kind)
      armSilence()

      const attempt = (retries: number) => {
        if (captureRef.current !== kind) return
        try {
          recognition.start()
        } catch {
          if (retries > 0) window.setTimeout(() => attempt(retries - 1), 300)
        }
      }
      attempt(2)
    },
    [armSilence],
  )

  /**
   * Palauttaa vuoron käyttäjälle, jos keskustelu on yhä käynnissä eikä
   * avustaja enää puhu tai kirjoita. Kutsutaan sekä puhejonon tyhjentyessä
   * että vastauksen loputtua — kumpi tahansa voi olla jälkimmäinen.
   */
  const maybeResume = useCallback(() => {
    if (!conversationRef.current) return
    if (streamingRef.current || speakingRef.current) return
    if (captureRef.current !== 'off') return
    startCapture('conversation')
  }, [startCapture])

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

  const askAssistant = useCallback(
    async (prompt: string) => {
      // Edellinen kysymys vaikenee ja katkeaa ennen uuden aloittamista: sekä
      // puhejono että virta ovat renderöinnin ulkopuolista tilaa, joka jatkaisi
      // muuten uuden vastauksen päälle.
      requestRef.current?.abort()
      // Lippu ennen cancel()-kutsua: cancel kertoo jonon tyhjenneen, ja ilman
      // lippua keskustelu avaisi mikrofonin juuri kun vastaus on lähdössä.
      streamingRef.current = true
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
            // Siirtymä omana haaranaan ennen tekstin kertymistä, samasta
            // syystä kuin ehdotus: value on olio, ei tekstipala.
            //
            // Palettia **ei suljeta** vaikka näkymä vaihtuu: sulkeminen
            // katkaisee sekä kesken olevan virran että puhejonon (ks.
            // open-efekti), jolloin avustaja vaikenisi kesken lauseen juuri
            // sen komennon kohdalla joka onnistui. Telakointi jättää
            // vastauksen näkyviin ja keskustelun käyntiin.
            if (event.type === 'action') {
              setDocked(true)
              router.push(event.value.href)
              continue
            }

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
      } finally {
        // Vain oma pyyntö saa nollata lipun: keskeytetty vanha virta pääsee
        // tänne vasta kun uusi on jo asettanut sen, ja nollaus avaisi
        // mikrofonin kesken tuoreen vastauksen.
        if (requestRef.current === controller) {
          requestRef.current = null
          streamingRef.current = false
          apiRef.current.maybeResume()
        }
      }
    },
    [getSpeech, dropProposal, router],
  )

  /**
   * Esilataa tervehdyksen, jotta herätesanan jälkeen ei odoteta verkkoa.
   *
   * Teksti otetaan samasta vastauksesta kuin ääni: kieli voi olla suomi tai
   * englanti, ja vain palvelin tietää kumpi. Kielen vaihto tulee voimaan
   * seuraavalla sivulatauksella — tässä muistissa oleva ääni pysyy sen
   * istunnon loppuun, koska soitossa olevan objectURLin vapauttaminen kesken
   * puheen katkaisisi sen. Reitti tarkistaa tuoreuden ETagilla, joten
   * selaimen oma välimuisti ei jää vanhalle kielelle.
   */
  const prefetchGreeting = useCallback(async () => {
    if (greetingUrlRef.current) return
    try {
      const res = await fetch(GREETING_URL)
      if (!res.ok) return
      const heading = res.headers.get(GREETING_TEXT_HEADER)
      greetingUrlRef.current = URL.createObjectURL(await res.blob())
      greetingTextRef.current = heading ? decodeURIComponent(heading) : null
    } catch {
      // Tervehdys ei ole pakollinen: ilman esilatausta soitetaan suoraan
      // reitiltä, jolloin alkuun tulee verkon verran viivettä.
    }
  }, [])

  /**
   * Herätesana kuultiin: keskustelu alkaa.
   *
   * Tervehdys soitetaan **heti ja ilman mallikutsua** — se on koko syy sille,
   * että se on syntetisoitu ja esiladattu valmiiksi. Poikkeus on lause jossa
   * käyttäjä ehti jo kysyä ("arxcian, mikä on sää"): silloin tervehdys vain
   * viivyttäisi vastausta, joka on itsessään sama kuittaus siitä että
   * herätesana kuultiin.
   */
  const startConversation = useCallback(
    (rest: string) => {
      // Tunnistin kiinni heti: se ei saa kuulla tervehdystä eikä vastausta.
      // Sync-effect pitää sen kiinni koko keskustelun ajan.
      wakeRef.current?.stop()

      // Edellinen ääni vaiennetaan **ennen** kuin keskustelu merkitään
      // käynnissä olevaksi: cancel() ilmoittaa jonon tyhjenneen, ja käynnissä
      // olevassa keskustelussa se avaisi mikrofonin juuri ennen tervehdystä —
      // jolloin ensimmäinen kuultu lause olisi avustajan oma tervehdys.
      const speech = getSpeech()
      speech.cancel()

      conversationRef.current = true
      setConversation(true)
      setConversationEnded(false)
      setVoiceError(null)
      setSpeechBlocked(false)
      setSpeechError(null)
      setOpen(true)

      const question = rest.trim()
      if (question) {
        void askAssistant(question)
        return
      }

      dropProposal()
      setMode('answered')
      setErrorMessage(null)
      // Esilataus kertoi tekstin kielineen. Jos se ei ehtinyt tai epäonnistui,
      // näytetään oletuskielinen tervehdys — sama jonka palvelin valitsisi
      // ilman tallennettua asetusta.
      setAnswer(greetingTextRef.current ?? greetingText(user, DEFAULT_LANGUAGE))
      speech.pushAudio(greetingUrlRef.current ?? GREETING_URL)
      // Esilataus jäi tekemättä tai epäonnistui — yritetään seuraavaa kertaa
      // varten uudelleen taustalla.
      if (!greetingUrlRef.current) void prefetchGreeting()
    },
    [askAssistant, dropProposal, getSpeech, prefetchGreeting, user],
  )

  // Käsittelijöiden tuorein versio kuuntelijoille, jotka luodaan kerran.
  useEffect(() => {
    apiRef.current = {
      ask: askAssistant,
      stopCapture,
      endConversation,
      maybeResume,
      armSilence,
      onWake: startConversation,
    }
  })

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
      // Telakointi kuuluu yhteen avauskertaan: seuraava avaus alkaa taas
      // keskeltä ruutua, muuten paletti jäisi alalaitaan ilman että kukaan
      // pyysi sitä sinne.
      setDocked(false)
      inputRef.current?.focus()
    } else {
      setDocked(false)
      // Paletti voi sulkeutua monesta reitistä (go(), taustaklikkaus, Escape)
      // — nollataan kysymystila täällä yhdessä paikassa sen sijaan että
      // jokainen sulkukohta joutuisi muistamaan sen itse.
      setMode('search')
      setAnswer(null)
      setErrorMessage(null)
      setSpeechBlocked(false)
      setSpeechError(null)
      // Paletin sulkeminen on myös keskustelun lopetus: mikrofoni ei jää auki
      // näkymään jota käyttäjä ei enää katso.
      endConversation('user')
      // Kesken oleva virta katkaistaan ja puhejono vaikenee: kumpikin jatkaisi
      // muuten näkymättömissä, ja ääni puhuisi suljetun paletin jälkeen.
      requestRef.current?.abort()
      speechRef.current?.cancel()
      // Vahvistamatta jäänyt ehdotus peruutetaan eikä jätetä odottamaan
      // vanhenemistaan — sulkeminen ei ole hyväksyntä, mutta se on päätös.
      dropProposal()
    }
  }, [open, dropProposal, endConversation])

  useEffect(() => {
    setIndex(0)
  }, [query])

  /* --- Käyttäjän vuoron kuuntelija: luodaan kerran, puretaan unmountissa --- */
  useEffect(() => {
    const recognition = createRecognition()
    if (!recognition) return

    recognition.onspeechstart = () => {
      // Käyttäjä alkoi puhua: laskuri alkaa alusta, jottei pitkä lause katkea
      // kesken. Laskuri viritetään uudelleen eikä pelkästään pysäytetä —
      // pysäytetty laskuri jättäisi mikrofonin auki loputtomiin siinä
      // tapauksessa ettei puheesta koskaan valmistu lopullista tulosta.
      if (captureRef.current !== 'off') apiRef.current.armSilence()
    }

    recognition.onend = () => {
      // Selain katkaisee tunnistuksen ajoittain itsestään (esim. hiljaisuuden
      // jälkeen) vaikka continuous on true. Jos vuoro on yhä käyttäjällä,
      // kuuntelu käynnistetään uudelleen — pieni viive, ettei uudelleen-
      // käynnistys osu täsmälleen samaan hetkeen kuin selaimen oma sulkeminen.
      const kind = captureRef.current
      if (kind === 'off') return
      window.setTimeout(() => {
        if (captureRef.current !== kind) return
        if (streamingRef.current || speakingRef.current) return
        try {
          recognition.start()
        } catch {
          // Jo käynnissä tms. — onend laukeaa taas jos tarpeen.
        }
      }, 300)
    }

    recognition.onerror = event => {
      if (isPermissionError(event.error)) {
        // Käyttäjä kielsi mikrofonin — ei yritetä automaattisesti uudelleen.
        // Asetetaan myös ref suoraan tässä, ettei onend ehdi käynnistää
        // uudelleen ennen kuin Reactin tila on ehtinyt päivittyä. Merkki jää
        // näkyviin, jotta luvan voi antaa napista ilman sivun uudelleenlatausta.
        micAllowedRef.current = false
        setMicAllowed(false)
      }

      // 'aborted' seuraa jokaisesta tavallisesta pysäytyksestä ja 'no-speech'
      // hiljaisuudesta: kumpikaan ei ole käyttäjälle kerrottava vika.
      // 'no-speech' kuitataan vuoron aikakatkaisulla, ei täällä.
      if (event.error === 'aborted' || event.error === 'no-speech') return

      setVoiceError(recognitionErrorMessage(event.error))
      apiRef.current.stopCapture()
      apiRef.current.endConversation('user')
    }

    recognition.onresult = event => {
      let finalTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalTranscript = event.results[i][0].transcript
      }
      const question = finalTranscript.trim()
      if (!question) return

      // Vuoro on avustajalla (se puhuu tai vastaa): kuultu lause on lähes
      // varmasti sen omaa ääntä, joten se ohitetaan.
      if (captureRef.current === 'off') return

      // Kuuntelu kiinni ennen kysymystä: vastaus luetaan ääneen, eikä sitä
      // saa poimia takaisin uudeksi kysymykseksi.
      apiRef.current.stopCapture()
      setHeard({ text: finalTranscript, status: 'ok' })
      setOpen(true)
      void apiRef.current.ask(question)
    }

    recognitionRef.current = recognition
    micAllowedRef.current = true
    setMicAvailable(true)
    setMicAllowed(true)

    return () => {
      recognition.onstart = null
      recognition.onend = null
      recognition.onspeechstart = null
      recognition.onerror = null
      recognition.onresult = null
      recognition.abort()
      recognitionRef.current = null
    }
  }, [])

  /* --- Herätyssana: oma tunnistimensa rajapinnan takana --- */
  useEffect(() => {
    if (!wakeWordSupported()) return

    const detector = createBrowserWakeWord({
      onDetected: rest => apiRef.current.onWake(rest),
      onStateChange: setWakeListening,
      onError: message => setVoiceError(message),
      onHeard: (text, matched) => setHeard({ text, status: matched ? 'ok' : 'no-wake' }),
      onDenied: () => {
        // Ilman lupaa herätyssana ei voi toimia. Kytkin pois päältä, jottei
        // se jää valehtelemaan kuuntelevansa — käyttäjä kytkee sen takaisin
        // annettuaan luvan.
        micAllowedRef.current = false
        setMicAllowed(false)
        setWakeEnabled(false)
        window.localStorage.setItem(WAKE_STORAGE_KEY, 'off')
      },
    })

    wakeRef.current = detector
    setWakeSupported(true)
    return () => {
      detector.stop()
      wakeRef.current = null
    }
  }, [])

  // Kytkimen tila muistista. Effectissä eikä alkuarvona, koska localStorage ei
  // ole olemassa palvelimella ja hydraatio hajoaisi.
  useEffect(() => {
    if (window.localStorage.getItem(WAKE_STORAGE_KEY) === 'on') setWakeEnabled(true)
  }, [])

  /**
   * Herätyssana päällä: tervehdys esiladataan, ja jos ääntä ei ole vielä
   * avattu käyttäjän eleellä (kytkin palautui muistista sivulatauksessa),
   * avataan se ensimmäisestä eleestä. Muuten selain estäisi tervehdyksen —
   * herätesana ei ole ele.
   */
  useEffect(() => {
    if (!wakeEnabled) return
    void prefetchGreeting()
    if (getAudio().unlocked) return

    const unlock = () => getAudio().unlock()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [wakeEnabled, prefetchGreeting, getAudio])

  /**
   * Herätyssanan kuuntelu päälle ja pois yhdestä paikasta.
   *
   * Ehtoja on monta, mutta ne kaikki tarkoittavat samaa: **kaksi tunnistinta
   * ei kuuntele samaa mikrofonia yhtä aikaa, eikä herätesanaa etsitä
   * avustajan omasta puheesta.** Yksi effect yhden totuuden kanssa on
   * luotettavampi kuin start/stop-kutsut siellä täällä.
   */
  useEffect(() => {
    const detector = wakeRef.current
    if (!detector) return

    const shouldListen =
      wakeEnabled &&
      micAllowed &&
      !hidden &&
      !conversation &&
      capture === 'off' &&
      !speaking &&
      mode !== 'asking'

    if (shouldListen) detector.start()
    else detector.stop()
  }, [wakeEnabled, micAllowed, hidden, conversation, capture, speaking, mode])

  // Välilehden näkyvyys. Taustalla ei kuunnella, ja kesken jäänyt keskustelu
  // päättyy: mikrofoni ei saa jäädä auki näkymään jota ei katsota.
  useEffect(() => {
    const onVisibilityChange = () => {
      const isHidden = document.visibilityState === 'hidden'
      setHidden(isHidden)
      if (isHidden && conversationRef.current) apiRef.current.endConversation('user')
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  // Ajastimet eivät saa jäädä elämään komponentin purun yli.
  useEffect(() => () => clearSilence(), [clearSilence])

  /**
   * Herätyssanan kytkin.
   *
   * Päälle kytkeminen on **käyttäjän ele** ja siksi ainoa hetki jolloin äänen
   * voi avata: samalla painalluksella soitetaan äänetön puskuri, ja sen jälkeen
   * tervehdys saa soida ilman uutta elettä.
   */
  const toggleWakeWord = () => {
    const next = !wakeEnabled
    setWakeEnabled(next)
    window.localStorage.setItem(WAKE_STORAGE_KEY, next ? 'on' : 'off')

    if (!next) {
      wakeRef.current?.stop()
      return
    }

    getAudio().unlock()
    void prefetchGreeting()
    setVoiceError(null)
    micAllowedRef.current = true
    setMicAllowed(true)
    // Varsinainen käynnistys tapahtuu sync-effectissä.
  }

  /**
   * Puhu-painike (push-to-talk): painallus aloittaa kuuntelun, seuraava kuultu
   * lause menee suoraan assistentille ilman herätesanaa. Uusi painallus
   * lopettaa kuuntelun, ja niin tekee myös lauseen päättyminen.
   *
   * Tämä on ääniohjauksen luotettava reitti, ja se toimii myös silloin kun
   * herätyssana on pois päältä. Herätesana "arxcian" on suomenkieliselle
   * puheentunnistukselle vaikea, ja jos se kuullaan väärin, mikään ei tapahdu.
   * Nappi ohittaa koko ongelman. Klikkaus on samalla se käyttäjän ele jota
   * Safari vaatii tunnistuksen käynnistämiseen ja selain äänen toistamiseen.
   */
  const askByVoice = () => {
    // Keskustelun aikana sama nappi lopettaa sen: kaksi eri kuuntelutilaa
    // yhtä aikaa samalla tunnistimella ei ole tila jota kannattaa rakentaa.
    if (conversationRef.current) {
      endConversation('user')
      return
    }

    if (captureRef.current === 'push') {
      stopCapture()
      return
    }

    if (!recognitionRef.current) return

    // Edellinen vastaus vaikenee heti kun käyttäjä alkaa puhua päälle:
    // avustajan puhe kuuluisi muuten mikrofoniin ja jatkuisi uuden kysymyksen
    // päälle. Sama syy kuin uuden kysymyksen kohdalla, eri laukaisin.
    speechRef.current?.cancel()
    setSpeechBlocked(false)
    setSpeechError(null)
    setVoiceError(null)
    setHeard(null)

    // Painallus on käyttäjän ele: avataan ääni samalla, jotta vastaus voi soida
    // myös iOS:ssä ilman erillistä "toista ääneen" -painallusta.
    getAudio().unlock()
    // Herätyssanan tunnistin pois päältä vuoron ajaksi — sync-effect hoitaa
    // sen capturen muuttuessa, mutta se ei saa kuulla tätäkään lausetta.
    wakeRef.current?.stop()

    micAllowedRef.current = true
    setMicAllowed(true)
    startCapture('push')
  }

  /**
   * Toistaa vastauksen uudelleen. Estetyssä tilassa jatketaan jonosta — nappi
   * on se käyttäjän ele jota selain vaati — muuten koko vastaus luetaan alusta.
   */
  const replayAnswer = () => {
    const speech = getSpeech()
    setSpeechBlocked(false)
    setSpeechError(null)
    // Painallus on ele: avataan ääni samalla, jotta seuraavakin pala soi.
    getAudio().unlock()

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
      if (askVisible && index === 0) void askAssistant(query.trim())
    }
  }

  /**
   * Yksi tila kerrallaan näkyvissä, tässä järjestyksessä: virhe menee kaiken
   * edelle (sitä ei saa piilottaa), sitten se mitä kone juuri nyt tekee
   * käyttäjän puolesta — kuuntelee, käsittelee, puhuu — ja vasta lopuksi
   * lepotilat.
   */
  const voiceState: VoiceState = voiceError
    ? 'error'
    : !micAllowed
      ? 'denied'
      : capture !== 'off'
        ? 'listening'
        : mode === 'asking'
          ? 'processing'
          : speaking
            ? 'speaking'
            : conversationEnded
              ? 'ended'
              : wakeListening
                ? 'ready'
                : 'idle'

  return (
    <>
      <VoiceControls
        state={voiceState}
        micAvailable={micAvailable}
        error={voiceError}
        heard={heard}
        wakeSupported={wakeSupported}
        wakeEnabled={wakeEnabled}
        wakeListening={wakeListening}
        conversation={conversation}
        onAsk={askByVoice}
        onToggleWake={toggleWakeWord}
        onEndConversation={() => endConversation('user')}
      />

      {open && (
        <div
          className={
            docked
              ? 'pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]'
              : 'fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-[14vh] backdrop-blur-sm'
          }
          onMouseDown={e => {
            // Telakoituna tausta ei ole enää paletin omaa pinta-alaa vaan
            // näkymä jota käyttäjä katsoo — klikkaus kuuluu sille.
            if (!docked && e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div
            role="dialog"
            // Telakoitu paletti ei estä muun sivun käyttöä, joten se ei ole
            // modaali. Väärä aria-modal kertoisi ruudunlukijalle että sivun
            // muu sisältö on piilossa vaikka se on käytettävissä.
            aria-modal={docked ? undefined : true}
            aria-label="Komentopaletti"
            className="pointer-events-auto w-full max-w-lg overflow-hidden ax-glass rounded-xl shadow-2xl"
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
                      onClick={() => void askAssistant(query.trim())}
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
                    speaking || speechBlocked || speechError || conversation ? '' : 'hidden'
                  }`}
                >
                  {speaking && (
                    <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-ax-up">
                      <span className="ax-pulse h-1.5 w-1.5 rounded-full bg-ax-up" />
                      puhuu
                    </span>
                  )}
                  {/* Keskustelutilassa kerrotaan kenen vuoro on: mikrofoni on
                      auki vain silloin kun avustaja ei puhu. */}
                  {conversation && !speaking && capture === 'conversation' && (
                    <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-ax-accent">
                      <span className="ax-pulse h-1.5 w-1.5 rounded-full bg-ax-accent" />
                      kuuntelee
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
                  {conversation && (
                    <button
                      type="button"
                      onClick={() => endConversation('user')}
                      className="ml-auto rounded-md border border-ax-line px-2.5 py-1 text-[11px] text-ax-dim transition-colors hover:bg-ax-panel-hi"
                    >
                      Lopeta
                    </button>
                  )}
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
