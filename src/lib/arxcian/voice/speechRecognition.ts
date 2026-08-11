/**
 * Web Speech API:n minimityypit ja yhteinen luonti.
 *
 * Rajapinta ei ole standardi eikä TypeScriptin lib.dom:ssa (Chrome/Safari-vain,
 * webkit-etuliitteinen versio yhä laajimmin tuettu), joten tyypit määritellään
 * tässä minimissään sen sijaan että tuotaisiin koko riippuvuus.
 *
 * Oma tiedostonsa siksi, että käyttäjiä on nyt kaksi eikä yksi: herätyssanan
 * tunnistin (voice/wakeWord.ts) ja käyttäjän vuoron kuuntelija
 * (CommandPalette). Ne ovat **eri instansseja tarkoituksella** — herätyssanan
 * tunnistin on suunniteltu vaihdettavaksi (Picovoice Porcupine kuuntelee omaa
 * ääntään WebAudion kautta), joten se ei voi jakaa tunnistinta kuuntelijan
 * kanssa. Kutsuja vastaa siitä, ettei kumpikaan ole päällä yhtä aikaa.
 */

export type SpeechRecognitionErrorCode =
  | 'no-speech'
  | 'aborted'
  | 'audio-capture'
  | 'network'
  | 'not-allowed'
  | 'service-not-allowed'
  | 'bad-grammar'
  | 'language-not-supported'

export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: { readonly transcript: string }
}

export interface SpeechRecognitionResultListLike {
  readonly length: number
  [index: number]: SpeechRecognitionResultLike
}

export interface SpeechRecognitionEventLike {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultListLike
}

export interface SpeechRecognitionErrorEventLike {
  readonly error: SpeechRecognitionErrorCode
}

export interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onstart: (() => void) | null
  onend: (() => void) | null
  /** Käyttäjä alkoi puhua. Ei kaikissa selaimissa, siksi valinnainen. */
  onspeechstart?: (() => void) | null
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

/** Virheen selite käyttäjälle. Tuntematon koodi saa yleisen tekstin. */
export function recognitionErrorMessage(code: SpeechRecognitionErrorCode): string {
  return RECOGNITION_ERROR[code] ?? 'puheentunnistus epäonnistui'
}

/**
 * Onko virhe sellainen josta ei kannata yrittää toipua itsestään.
 * Evätty lupa palaa vain käyttäjän toimesta, joten uudelleenyritys olisi
 * loputon silmukka ilman että käyttäjä näkee mitään.
 */
export function isPermissionError(code: SpeechRecognitionErrorCode): boolean {
  return code === 'not-allowed' || code === 'service-not-allowed'
}

/** Tukeeko selain puheentunnistusta lainkaan. */
export function speechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition)
}

/**
 * Uusi tunnistin arxcianin oletuksilla: jatkuva kuuntelu, vain valmiit
 * tulokset, suomi. Palauttaa null jos selain ei tue rajapintaa.
 */
export function createRecognition(): SpeechRecognitionLike | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition
  if (!Ctor) return null

  const recognition = new Ctor()
  recognition.continuous = true
  recognition.interimResults = false
  recognition.lang = 'fi-FI'
  return recognition
}
