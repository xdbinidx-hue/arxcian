/**
 * Puhejono selaimelle: hae rinnakkain, toista järjestyksessä.
 *
 * Vain selaimessa (käyttää Audio- ja URL-rajapintoja). Syntyi siitä, että
 * assistentin vastaus luetaan ääneen lause kerrallaan jo generoinnin aikana:
 * ilman jonoa jokainen valmis lause aloittaisi oman äänensä heti, ja lauseet
 * soisivat päällekkäin.
 *
 * Kaksi asiaa pidetään tiukasti erillään:
 *
 * - **Haku saa mennä rinnakkain.** Seuraavan palan MP3 haetaan jo edellisen
 *   soidessa, muuten palojen väliin jäisi TTS-kutsun mittainen tauko.
 * - **Toisto on ehdottomasti järjestyksessä.** Yksi Audio-elementti kerrallaan,
 *   seuraava alkaa vasta kun edellinen on päättynyt.
 *
 * Rinnakkaisuus on rajattu (PREFETCH), koska jokainen pala on oma TTS-pyyntönsä
 * ja niillä on tuntikohtainen kiintiö — koko vastauksen ampuminen kerralla
 * polttaisi kiintiötä myös silloin kun käyttäjä keskeyttää heti.
 */

/** Kuinka monta palaa haetaan valmiiksi soivan palan lisäksi. */
const PREFETCH = 2

export type SpeechQueueHandlers = {
  /** Jono alkoi tai loppui — käyttöliittymän "puhuu"-tila. */
  onSpeakingChange: (speaking: boolean) => void
  /** Selain esti automaattisen toiston; jono odottaa käyttäjän elettä. */
  onBlocked: () => void
  /** Äänen haku epäonnistui (verkko, kiintiö, palvelin). */
  onError: (message: string) => void
}

type QueueItem = {
  text: string
  controller: AbortController
  /** null = haku epäonnistui, pala ohitetaan. Alkaa vasta kun pump() käynnistää. */
  audio: Promise<string | null> | null
}

export class SpeechQueue {
  private items: QueueItem[] = []
  private current: HTMLAudioElement | null = null
  private running = false
  /** Selain esti toiston: jonon kärki jää odottamaan resume()-kutsua. */
  private blocked = false
  /**
   * Sukupolvi kasvaa jokaisessa cancel()-kutsussa. Kesken oleva silmukka voi
   * olla await-kohdassa peruutuksen hetkellä, joten se tarkistaa numeron
   * jokaisen odotuksen jälkeen ja poistuu jos jono on vaihtunut alta.
   */
  private generation = 0

  constructor(private handlers: SpeechQueueHandlers) {}

  /** Lisää palan jonon perään ja käynnistää toiston jos se ei ole käynnissä. */
  push(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    this.items.push({ text: trimmed, controller: new AbortController(), audio: null })
    this.pump()
    this.start()
  }

  /**
   * Jatkaa estetystä kohdasta käyttäjän eleen jälkeen. Jonoa ei ole purettu,
   * joten koko loppuvastaus kuuluu — ei vain sitä lausetta jonka kohdalla
   * selain esti toiston.
   */
  resume() {
    if (!this.blocked) return
    this.blocked = false
    this.start()
  }

  /** Onko jonossa mitään toistettavaa (estetty pala mukaan lukien). */
  get pending(): boolean {
    return this.items.length > 0
  }

  /**
   * Tyhjentää jonon ja vaientaa soivan äänen.
   *
   * Kutsutaan kun käyttäjä sulkee paletin tai aloittaa uuden kysymyksen. Ilman
   * tätä edellinen vastaus jatkaisi puhumista uuden päälle — jono on tila joka
   * elää komponentin renderöinnin ulkopuolella, joten sitä ei siivoa mikään
   * muu.
   */
  cancel() {
    this.generation++
    this.running = false
    this.blocked = false

    for (const item of this.items) {
      item.controller.abort()
      // Jo valmistunut objectURL vapautetaan, keskeytynyt haku hylkää itsensä.
      void item.audio?.then(url => url && URL.revokeObjectURL(url)).catch(() => {})
    }
    this.items = []

    if (this.current) {
      this.current.pause()
      this.current.src = ''
      this.current = null
    }
    this.handlers.onSpeakingChange(false)
  }

  /** Käynnistää haun jonon kärjestä PREFETCH+1 palalle. */
  private pump() {
    const limit = Math.min(this.items.length, PREFETCH + 1)
    for (let i = 0; i < limit; i++) {
      const item = this.items[i]
      if (!item.audio) item.audio = this.fetchAudio(item)
    }
  }

  private async fetchAudio(item: QueueItem): Promise<string | null> {
    try {
      const res = await fetch('/api/arxcian/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: item.text }),
        signal: item.controller.signal,
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        this.handlers.onError(data?.error ?? 'Äänen tuottaminen epäonnistui')
        return null
      }
      return URL.createObjectURL(await res.blob())
    } catch {
      // Peruutus ei ole virhe: käyttäjä sulki paletin tai kysyi uutta.
      if (item.controller.signal.aborted) return null
      this.handlers.onError('Äänen tuottaminen epäonnistui')
      return null
    }
  }

  private start() {
    if (this.running || this.blocked || this.items.length === 0) return
    this.running = true
    this.handlers.onSpeakingChange(true)
    void this.run(this.generation)
  }

  private async run(generation: number) {
    try {
      while (this.items.length > 0 && !this.blocked) {
        const item = this.items[0]
        this.pump()

        const url = await item.audio
        if (generation !== this.generation) return

        if (!url) {
          // Haku epäonnistui — virhe on jo kerrottu, pala ohitetaan jottei
          // yksi rikkinäinen lause jätä loppuvastausta lukematta.
          this.items.shift()
          continue
        }

        const result = await this.play(url)
        if (generation !== this.generation) return

        if (result === 'blocked') {
          // Pala jätetään jonon kärkeen valmiina, jotta resume() jatkaa siitä.
          this.blocked = true
          this.handlers.onBlocked()
          return
        }

        this.items.shift()
        URL.revokeObjectURL(url)
      }
    } finally {
      // Vain jos jono on yhä sama: peruutuksen jälkeen lippujen omistaa jo
      // uusi ajo, eikä vanha silmukka saa nollata sen tilaa.
      if (generation === this.generation) {
        this.running = false
        this.current = null
        this.handlers.onSpeakingChange(false)
      }
    }
  }

  /** Toistaa yhden palan loppuun asti. */
  private play(url: string): Promise<'ok' | 'blocked'> {
    return new Promise(resolve => {
      const audio = new Audio(url)
      this.current = audio
      audio.onended = () => resolve('ok')
      // Vioittunut tai purkukelvoton pala ei saa jättää jonoa jumiin.
      audio.onerror = () => resolve('ok')
      audio.play().catch(() => resolve('blocked'))
    })
  }
}
