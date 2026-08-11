/**
 * Herätyssanan tunnistus.
 *
 * Moduuli on olemassa rajapinnan takia: selaimen puheentunnistus on halpa
 * mutta epätarkka tapa kuunnella herätesanaa, ja se on tarkoitus voida
 * korvata oikealla herätesanamallilla (Picovoice Porcupine ajaa WASM-mallia
 * WebAudion päällä) **ilman että kutsuja muuttuu**. Siksi kaikki selaimen
 * puheentunnistukseen sidottu on `createBrowserWakeWord`:n sisällä, ja
 * ulospäin näkyy vain `WakeWordDetector`.
 *
 * Toteutusten ero näkyy vain yhdessä kohdassa: selaintunnistin kuulee koko
 * lauseen, joten se voi antaa herätesanan **jälkeisen** osan (`rest`)
 * suoraan kysymyksenä. Porcupine kuulee vain herätesanan, jolloin `rest` on
 * aina tyhjä ja kutsuja jää kuuntelemaan kysymystä erikseen — molemmat
 * tapaukset ovat jo tuettuja.
 */

import {
  createRecognition,
  isPermissionError,
  recognitionErrorMessage,
  speechRecognitionSupported,
  type SpeechRecognitionLike,
} from './speechRecognition'

/** Herätesana joka avaa keskustelun. */
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
export function foldPhonetic(word: string): string {
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
export function levenshtein(a: string, b: string): number {
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
export function matchWakeWord(words: string[]): number | null {
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
 * Erottaa lauseesta herätesanan jälkeisen osan.
 * Palauttaa null jos herätesanaa ei kuultu, ja tyhjän merkkijonon jos
 * sanottiin pelkkä herätesana.
 */
export function wakeWordRest(transcript: string): string | null {
  // Sanat pilkotaan alkuperäisestä transkriptista — vain vertailua varten
  // tehdään taitettu kopio kustakin ehdokkaasta, jottei käyttäjän oma ä/ö/å
  // korruptoidu itse kysymyksessä.
  const words = transcript.split(/[\s,]+/).filter(Boolean)
  const matched = matchWakeWord(words)
  if (matched === null) return null

  const rest = words.slice(matched).join(' ').trim()
  // Pelkät välimerkit eivät ole kysymys.
  return /[a-zA-Z0-9äöåÄÖÅ]/.test(rest) ? rest : ''
}

/* ---------------------------------------------------------------
   Rajapinta
   --------------------------------------------------------------- */

/**
 * Herätesanan kuuntelija. Kolme jäsentä, ei enempää — mitä pienempi pinta,
 * sitä helpompi toteutus on vaihtaa.
 */
export type WakeWordDetector = {
  /** Alkaa kuunnella. Turvallinen kutsua uudestaan jo kuunnellessa. */
  start(): void
  /** Lopettaa kuuntelun ja peruu odottavat uudelleenyritykset. */
  stop(): void
  /** Kuunteleeko juuri nyt oikeasti (ei sama kuin "haluttiin kuunnella"). */
  readonly listening: boolean
}

export type WakeWordHandlers = {
  /**
   * Herätesana kuultiin. `rest` on sen jälkeinen osa lauseesta tai tyhjä,
   * jos sanottiin pelkkä herätesana.
   */
  onDetected: (rest: string) => void
  /** Kuunteleeko tunnistin. Merkkivalo käyttöliittymässä. */
  onStateChange?: (listening: boolean) => void
  /** Virhe käyttäjän kielellä. Hiljainen vika on ääniohjauksen pahin vika. */
  onError?: (message: string) => void
  /** Mikrofonilupa evättiin: kuuntelu lopetettiin eikä sitä yritetä uudelleen. */
  onDenied?: () => void
  /**
   * Mitä kuultiin ja osuiko herätesana. **Selaintoteutuksen lisä** eikä osa
   * sopimusta: oikea herätesanamalli ei kuule lauseita lainkaan, joten
   * kutsujan on siedettävä ettei tätä kutsuta koskaan.
   */
  onHeard?: (text: string, matched: boolean) => void
}

/**
 * Uudelleenkäynnistyksen viiveet peräkkäisille epäonnistumisille.
 *
 * Tavallinen tapaus on ensimmäinen luku: selain katkaisee tunnistuksen
 * itsestään hiljaisuuden jälkeen vaikka continuous on true, ja silloin
 * kuuntelun pitää palata heti. Kasvava viive koskee vain oikeita virheitä
 * (verkko, palvelu poissa) — ilman sitä rikkinäinen tila jäisi jauhamaan
 * uutta yritystä kolmen sekunnin välein loputtomiin. Viimeinen arvo toistuu,
 * eli yrittäminen ei lopu koskaan kokonaan: verkko voi palata.
 */
const RESTART_DELAYS = [300, 800, 2000, 5000]

/** Tukeeko selain herätyssanaa lainkaan. */
export function wakeWordSupported(): boolean {
  return speechRecognitionSupported()
}

/**
 * Selaimen puheentunnistukseen perustuva herätyssana.
 *
 * Tunnistin luodaan kerran ja käynnistetään uudelleen aina kun se sammuu —
 * `continuous = true` ei estä selainta katkaisemasta kuuntelua hiljaisuuden
 * jälkeen, joten ilman uudelleenkäynnistystä herätyssana lakkaisi toimimasta
 * muutamassa minuutissa ilman mitään näkyvää merkkiä.
 */
export function createBrowserWakeWord(handlers: WakeWordHandlers): WakeWordDetector {
  let recognition: SpeechRecognitionLike | null = null
  /** Haluttiin kuunnella. Eri asia kuin `running`: uudelleenyritys odottaa. */
  let wanted = false
  let running = false
  let restartTimer: number | null = null
  /** Peräkkäisten virheiden määrä. Nollautuu heti kun kuuntelu onnistuu. */
  let failures = 0

  const setRunning = (value: boolean) => {
    if (running === value) return
    running = value
    handlers.onStateChange?.(value)
  }

  const clearRestart = () => {
    if (restartTimer === null) return
    clearTimeout(restartTimer)
    restartTimer = null
  }

  const scheduleRestart = () => {
    if (!wanted || restartTimer !== null) return
    const delay = RESTART_DELAYS[Math.min(failures, RESTART_DELAYS.length - 1)]
    restartTimer = window.setTimeout(() => {
      restartTimer = null
      if (!wanted || !recognition) return
      try {
        recognition.start()
      } catch {
        // start() heittää myös silloin kun tunnistus on jo käynnissä, jolloin
        // kaikki on hyvin. Muissa tapauksissa lasketaan virheeksi ja
        // yritetään pidemmän viiveen päästä — jumiin ei jäädä kummassakaan.
        failures++
        scheduleRestart()
      }
    }, delay)
  }

  const ensureRecognition = (): SpeechRecognitionLike | null => {
    if (recognition) return recognition
    recognition = createRecognition()
    if (!recognition) return null

    recognition.onstart = () => {
      failures = 0
      setRunning(true)
    }

    recognition.onend = () => {
      setRunning(false)
      // Normaali katkaisu hiljaisuuden jälkeen: takaisin kuuntelemaan.
      // Pysäytyksen jälkeen wanted on false, joten stop() ei kierrä tänne.
      scheduleRestart()
    }

    recognition.onerror = event => {
      if (isPermissionError(event.error)) {
        // Lupa on käyttäjän päätös: uudelleenyritys olisi loputon silmukka
        // josta käyttäjä ei näkisi mitään. Kytkin jää käyttäjälle.
        wanted = false
        clearRestart()
        setRunning(false)
        handlers.onError?.(recognitionErrorMessage(event.error))
        handlers.onDenied?.()
        return
      }

      // 'aborted' seuraa jokaisesta tavallisesta pysäytyksestä ja 'no-speech'
      // taustakuuntelun hiljaisuudesta: kumpikaan ei ole käyttäjälle
      // kerrottava vika eikä syy hidastaa uudelleenkäynnistystä.
      if (event.error === 'aborted' || event.error === 'no-speech') return

      failures++
      handlers.onError?.(recognitionErrorMessage(event.error))
    }

    recognition.onresult = event => {
      failures = 0
      let finalTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalTranscript = event.results[i][0].transcript
      }
      if (!finalTranscript.trim()) return

      const rest = wakeWordRest(finalTranscript)
      handlers.onHeard?.(finalTranscript, rest !== null)
      if (rest === null) return
      handlers.onDetected(rest)
    }

    return recognition
  }

  return {
    start() {
      const instance = ensureRecognition()
      if (!instance) return
      if (wanted && running) return
      wanted = true
      clearRestart()
      try {
        instance.start()
      } catch {
        // Edellinen pysäytys voi olla vielä kesken — yritetään hetken päästä.
        scheduleRestart()
      }
    },

    stop() {
      wanted = false
      clearRestart()
      if (!recognition) return
      // abort() eikä stop(): kesken oleva tunnistus hylätään heti, jottei
      // keskustelun aikana kuultu lause tipahda jälkikäteen herätesanaksi.
      try {
        recognition.abort()
      } catch {
        // Ei käynnissä — ei mitään pysäytettävää.
      }
      setRunning(false)
    },

    get listening() {
      return running
    },
  }
}
