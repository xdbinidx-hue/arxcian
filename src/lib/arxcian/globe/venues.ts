/**
 * Kaupankäyntipaikkojen sijainnit Markets-kerrosta varten.
 *
 * Osakkeille ja indekseille käytetään todellista päälistautumispaikkaa.
 * Valuuttapareille käytetään vastavaluutan kotifinanssikeskusta — valuutta-
 * kauppa on OTC-markkina eikä sillä ole yhtä pörssiä, joten tämä on
 * tulkinta eikä tosiasia. Se kerrotaan käyttäjälle HUDissa.
 *
 * Kryptot jätetään tarkoituksella pois: ne käyvät kauppaa ympäri
 * vuorokauden ilman sijaintia, ja piste kartalla antaisi väärän kuvan.
 */

export type VenueId = 'new-york' | 'london' | 'tokyo' | 'frankfurt'

export const VENUES: Record<VenueId, { label: string; lat: number; lng: number }> = {
  'new-york': { label: 'New York', lat: 40.7128, lng: -74.006 },
  london: { label: 'Lontoo', lat: 51.5074, lng: -0.1278 },
  tokyo: { label: 'Tokio', lat: 35.6762, lng: 139.6503 },
  frankfurt: { label: 'Frankfurt', lat: 50.1109, lng: 8.6821 },
}

/**
 * Watchlistin quoteSymbol → kaupankäyntipaikka. Symbolit joita ei ole tässä
 * (kryptot) jäävät pois kartalta.
 */
export const SYMBOL_VENUE: Record<string, VenueId> = {
  // Yhdysvaltain osakkeet — NYSE / NASDAQ
  AAPL: 'new-york',
  MSFT: 'new-york',
  NVDA: 'new-york',
  GOOGL: 'new-york',
  AMZN: 'new-york',
  META: 'new-york',
  TSLA: 'new-york',
  'BRK-B': 'new-york',
  AVGO: 'new-york',
  JPM: 'new-york',
  // Indeksit
  '^GSPC': 'new-york',
  '^NDX': 'new-york',
  'DX-Y.NYB': 'new-york', // ICE
  // Hyödykkeet — NYMEX / COMEX
  'CL=F': 'new-york',
  'GC=F': 'new-york',
  // Valuuttaparit vastavaluutan kotikeskukseen
  'EURUSD=X': 'frankfurt',
  'GBPUSD=X': 'london',
  'USDJPY=X': 'tokyo',
}
