/**
 * Puheeksi luettavan tekstin siivous ja pilkkominen.
 *
 * Oma tiedostonsa eikä osa tts.ts:ää siksi, että **selain tarvitsee nämä**:
 * CommandPalette pilkkoo striimattua vastausta lauseiksi jo generoinnin
 * aikana, jotta ääni alkaa ensimmäisestä valmiista lauseesta. tts.ts tuo
 * googleapis-kirjaston ja palvelutilin tunnukset, joten sitä ei voi tuoda
 * selainkomponenttiin. Sama siivous ajetaan molemmissa päissä (funktio on
 * idempotentti), jottei kumpikaan pää oleta toisen tehneen sen.
 */

/**
 * Poistaa markdown-merkinnän ennen puhesynteesiä.
 *
 * Assistentin ohje kieltää korostukset, mutta malli tuottaa niitä silti
 * ajoittain — ja Chirp3-HD ääntää ne kuuluvasti, jolloin vastaus alkaa
 * "tähti tähti Teknologia tähti tähti". Siivous tehdään täällä eikä
 * kutsujassa, jotta jokainen puhereitti saa saman kohtelun ohjeen
 * pettäessä.
 *
 * Yhden alaviivan korostusta ei pureta tarkoituksella: se osuisi myös
 * tavallisiin snake_case-nimiin ja typistäisi ne väärin.
 */
export function speakableText(text: string): string {
  return (
    text
      // [teksti](osoite) → teksti
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      // **lihavointi** ja __lihavointi__ → sisältö
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      // *kursiivi* → sisältö, mutta vain kun tähdet rajaavat sanaa
      .replace(/\*(?=\S)([^*]*?)(?<=\S)\*/g, '$1')
      // `koodi` → koodi
      .replace(/`+([^`]*)`+/g, '$1')
      // otsikot ja lainaukset rivin alussa
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      // vaakaviivat omalla rivillään, ennen luettelomerkkejä ettei "---"
      // typisty pelkäksi viivaksi
      .replace(/^\s*([-*_]\s*){3,}$/gm, '')
      // luettelomerkit rivin alussa
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/**
 * Palan vähimmäispituus järjestysnumeron mukaan, siivotusta tekstistä
 * mitattuna.
 *
 * Kasvava raja on tarkoituksellinen, kahdesta syystä. Nopeus koskee vain
 * ensimmäistä palaa: siihen asti käyttäjä odottaa hiljaisuudessa, joten se
 * kannattaa katkaista heti ensimmäisestä valmiista lauseesta. Kun ääni jo
 * soi, seuraavan palan haku ehtii tapahtua toiston aikana, jolloin lyhyestä
 * palasta ei ole enää hyötyä — pidempi kuulostaa luontevammalta (Chirp3
 * intonoi kokonaisen kappaleen paremmin kuin irrallisen lauseen) ja säästää
 * TTS-pyyntöjä. Tyypillinen vastaus jakautuu näin kolmeen pyyntöön yhden
 * sijaan, ei kymmeneen.
 */
const CHUNK_MIN_CHARS = [20, 120, 260, 420]

/**
 * Lauseen raja: päättömerkki (mahdollisine sulkevine lainaus- tai
 * sulkumerkkeineen) jota seuraa tyhjä merkki, tai rivinvaihto.
 *
 * Rivinvaihto on mukana koska mallin vastaukset ovat usein luetteloita joiden
 * riveiltä puuttuu piste kokonaan — ilman sitä koko luettelo jäisi yhdeksi
 * palaksi joka lähtisi TTS:ään vasta virran lopussa. Vähimmäispituus estää
 * luettelon hajoamisen sanan mittaisiksi pätkiksi.
 *
 * Desimaalipilkut ("3.5") eivät katkaise, koska pisteen jälkeen vaaditaan
 * tyhjä merkki.
 */
const BOUNDARY_SOURCE = '(?:[.!?…]+["\'”’)\\]]*\\s)|\\n'

/**
 * Lyhenteet joiden piste ei lopeta lausetta. Malli vastaa englanniksi, mutta
 * mukana on myös tavallisimmat suomalaiset — käyttäjä voi pyytää vastauksen
 * suomeksi, eikä lista maksa mitään.
 */
const ABBREVIATION = /(?:^|[\s("'])(?:mr|mrs|ms|dr|prof|st|vs|etc|approx|inc|ltd|no|e\.g|i\.e|esim|ks|mm|ym|jne|n)\.$/i

/**
 * Numeroidun luettelon järjestysnumero ("1.", "2.") ei lopeta lausetta.
 * Ilman tätä pala katkeaisi numeron jälkeen ja ääni lukisi edellisen palan
 * lopuksi irrallisen "one". Enintään kaksi numeroa, jottei vuosiluvulla
 * päättyvä oikea lause ("…in 2024.") jäisi katkaisematta.
 */
const LIST_NUMBER = /(?:^|[\s(])\d{1,2}\.$/

/**
 * Sisältääkö pala ylipäätään luettavaa — pelkkä "---" tai luettelomerkki ei.
 *
 * Kirjainluokka on kirjoitettu auki eikä \p{L}:nä, koska tsconfigin target on
 * es5 eikä u-lippua voi käyttää. Latin-1-alue kattaa englannin ja suomen, ja
 * väärä negatiivinen tarkoittaisi vain yhden välimerkkipalan ohittamista.
 */
function hasSpeech(text: string): boolean {
  return /[0-9A-Za-zÀ-ÖØ-öø-ÿ]/.test(text)
}

/**
 * Etsii ensimmäisen katkaisukohdan joka tuottaa vähintään `min` merkin palan.
 * Palauttaa indeksin katkaisumerkin jälkeen, tai null jos sellaista ei ole.
 */
function findCut(text: string, min: number): number | null {
  const boundary = new RegExp(BOUNDARY_SOURCE, 'g')
  for (let match = boundary.exec(text); match; match = boundary.exec(text)) {
    const cut = match.index + match[0].length
    const raw = text.slice(0, cut)
    const trimmed = raw.trimEnd()
    if (ABBREVIATION.test(trimmed) || LIST_NUMBER.test(trimmed)) continue
    if (speakableText(raw).length < min) continue
    return cut
  }
  return null
}

/** Yksi virta pilkottavaksi. Tila on kutsujakohtainen, ei moduulitasoinen. */
export type SpeechSplitter = {
  /** Lisää striimattua tekstiä ja palauttaa palat jotka ovat nyt valmiita. */
  push: (text: string) => string[]
  /** Virta loppui: palauttaa lopun vaikka lause jäisi kesken. */
  flush: () => string[]
}

/**
 * Pilkkoo striimattua tekstiä puheeksi luettaviksi paloiksi.
 *
 * Puskuri pidetään **raakana** ja siivous tehdään vasta irrotetulle palalle:
 * kesken jäänyt korostus ("**Bold" ilman paria) ehtii täydentyä seuraavassa
 * verkkopalasessa, kun taas jo siivottuun puskuriin liimattu jatko jättäisi
 * jälkeensä irtonaisia merkkejä.
 */
export function createSpeechSplitter(): SpeechSplitter {
  let buffer = ''
  let emitted = 0

  const take = (flush: boolean): string[] => {
    const out: string[] = []

    for (;;) {
      const min = CHUNK_MIN_CHARS[Math.min(emitted, CHUNK_MIN_CHARS.length - 1)]
      const cut = findCut(buffer, min)
      if (cut === null) break
      const piece = speakableText(buffer.slice(0, cut))
      // Katkaisukohta on aina vähintään yhden merkin päässä, joten puskuri
      // kutistuu joka kierroksella eikä silmukka jää päälle vaikka pala
      // siivoutuisi tyhjäksi.
      buffer = buffer.slice(cut)
      if (!hasSpeech(piece)) continue
      out.push(piece)
      emitted++
    }

    if (flush) {
      const piece = speakableText(buffer)
      buffer = ''
      if (hasSpeech(piece)) {
        out.push(piece)
        emitted++
      }
    }

    return out
  }

  return {
    push: (text: string) => {
      buffer += text
      return take(false)
    },
    flush: () => take(true),
  }
}
