/**
 * Yksi äänielementti, avattuna käyttäjän eleellä.
 *
 * Selain estää äänen toiston ilman käyttäjän elettä, eikä **herätesana ole
 * ele**: jos tervehdys soitettaisiin herätesanan jälkeen uudella
 * `new Audio(...)`-elementillä, iOS Safari ja Chrome hylkäisivät sen.
 *
 * Kierto on vakio: kun käyttäjä kytkee herätyssanan päälle — se painallus on
 * ele — soitetaan samalla hetkellä äänetön puskuri **yhdellä** elementillä.
 * Elementti jää sen jälkeen "avatuksi", ja kaikki myöhempi toisto tehdään
 * samalla elementillä pelkkää `src`:ää vaihtamalla. Uusi elementti olisi taas
 * lukittu, joten jakaminen ei ole optimointi vaan koko idea.
 *
 * Avaus ei ole tae: käyttäjä voi olla estänyt äänen selainasetuksista tai
 * eleen ja toiston välissä on voinut kulua liikaa aikaa. Siksi toiston
 * epäonnistuminen näytetään käyttäjälle (SpeechQueuen onBlocked), eikä
 * tämä moduuli lupaa onnistumista.
 */

/**
 * 8 ms hiljaisuutta 8-bittisenä PCM-WAVina. Data-URI eikä tiedosto, jottei
 * avaus jää verkkohaun varaan — eleen ja toiston väliin ei saa jäädä
 * pyyntöä, koska osa selaimista laskee vain synkronisen play()-kutsun
 * eleeksi.
 */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRmQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA'

export type UnlockedAudio = {
  /** Kutsutaan käyttäjän eleen käsittelijästä. Uudelleenkutsu on vaaraton. */
  unlock(): void
  /** Jaettu elementti kaikelle toistolle. Luodaan vasta ensimmäisellä kutsulla. */
  element(): HTMLAudioElement
  /** Onnistuiko avaus. Epätosi ei estä yrittämästä toistoa. */
  readonly unlocked: boolean
}

export function createUnlockedAudio(): UnlockedAudio {
  let element: HTMLAudioElement | null = null
  let unlocked = false

  const ensure = (): HTMLAudioElement => {
    if (!element) element = new Audio()
    return element
  }

  return {
    unlock() {
      if (unlocked) return
      const audio = ensure()
      audio.src = SILENT_WAV
      // Ei await: eleen käsittelijä ei saa jäädä odottamaan, ja lupaus
      // ratkeaa joka tapauksessa ennen ensimmäistä oikeaa toistoa.
      void audio
        .play()
        .then(() => {
          unlocked = true
        })
        .catch(() => {
          // Selain ei suostunut. Toistoa yritetään silti myöhemmin — este
          // näytetään vasta kun oikea ääni jää soimatta.
        })
    },

    element: ensure,

    get unlocked() {
      return unlocked
    },
  }
}
