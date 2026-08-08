/**
 * Maapallon datakerrosten yhteinen muoto. Jokainen kerros (Markets, Weather, …)
 * tuottaa saman tyypin, jolloin maapallokomponentti ei tiedä mitään yksittäisen
 * kerroksen sisällöstä.
 */

export type LayerId = 'world' | 'markets' | 'weather'

export type PointTone = 'up' | 'down' | 'warn' | 'neutral'

export type GlobePoint = {
  id: string
  lat: number
  lng: number
  label: string
  /** Suhteellinen paino 0–1, ohjaa pisteen kokoa. Oletus 0.5. */
  weight?: number
  tone?: PointTone
  /** Lyhyt lisätieto HUD-kortissa, esim. "13 instrumenttia · +0,42 %" */
  meta?: string
  /** Mihin klikkaus vie, jos jonnekin */
  href?: string
}

export type GlobeArc = {
  id: string
  from: [number, number]
  to: [number, number]
}

export type GlobeLayer = {
  id: LayerId
  label: string
  points: GlobePoint[]
  arcs?: GlobeArc[]
  /**
   * Mistä data tuli ja milloin. Pakollinen tarkoituksella: HUD näyttää tämän
   * aina, jottei vanhentunutta välimuistidataa luulla reaaliaikaiseksi.
   * fetchedAt null = dataa ei ole vielä haettu.
   */
  source: { name: string; fetchedAt: number | null }
  /** Näytetään HUDissa, jos kerros jättää osan datasta pois kartalta. */
  caveat?: string
}
