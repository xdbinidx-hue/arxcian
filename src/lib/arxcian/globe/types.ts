/**
 * Maapallon datan yhteinen muoto.
 *
 * Aiemmin data oli jaettu erillisiin kerroksiin (Maailma / Markkinat / Sää),
 * joiden välillä käyttäjä vaihtoi. Kerrokset on yhdistetty yhdeksi näkymäksi:
 * kaikki pisteet ovat kartalla samaan aikaan, ja piste kertoo itse mihin
 * ryhmään se kuuluu.
 */

export type PointTone = 'up' | 'down' | 'warn' | 'neutral'

/** Mistä ryhmästä piste on. Ohjaa korkeutta ja sitä piirretäänkö sille kutsuviiva. */
export type PointKind = 'markets' | 'weather'

export type GlobePoint = {
  id: string
  lat: number
  lng: number
  label: string
  kind: PointKind
  /** Suhteellinen paino 0–1, ohjaa pisteen kokoa. Oletus 0.5. */
  weight?: number
  tone?: PointTone
  /** Lyhyt lisätieto HUD-kortissa, esim. "13 instrumenttia · +0,42 %" */
  meta?: string
  /**
   * Lyhyt arvo joka piirretään kartan ulkopuolelle kutsuviivan päähän,
   * esim. "21°". Jos puuttuu, pisteelle ei piirretä viivaa.
   */
  callout?: string
  /** Mihin klikkaus vie, jos jonnekin */
  href?: string
}

export type GlobeArc = {
  id: string
  from: [number, number]
  to: [number, number]
}

export type GlobeSource = {
  name: string
  /** null = dataa ei ole vielä haettu */
  fetchedAt: number | null
}

export type GlobeData = {
  points: GlobePoint[]
  arcs?: GlobeArc[]
  /**
   * Mistä data tuli ja milloin — yksi rivi per lähde. Pakollinen
   * tarkoituksella: HUD näyttää tämän aina, jottei vanhentunutta
   * välimuistidataa luulla reaaliaikaiseksi.
   */
  sources: GlobeSource[]
  /** Näytetään HUDissa, jos jokin lähde jättää osan datasta pois kartalta. */
  caveats: string[]
}
