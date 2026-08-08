/**
 * Maapallon Weather-kerroksen kaupungit.
 *
 * Valittu niin että pallo kattuu tasaisesti: koti ja markkinakeskukset
 * (samat kuin Markets-kerroksessa) sekä muutama muu maanosien peittoon.
 * Open-Meteo hakee kaikki yhdellä kutsulla, joten lista saa kasvaa.
 */
export const GLOBE_CITIES = [
  { name: 'Helsinki', lat: 60.1699, lon: 24.9384 },
  { name: 'Lontoo', lat: 51.5074, lon: -0.1278 },
  { name: 'Frankfurt', lat: 50.1109, lon: 8.6821 },
  { name: 'New York', lat: 40.7128, lon: -74.006 },
  { name: 'Los Angeles', lat: 34.0522, lon: -118.2437 },
  { name: 'São Paulo', lat: -23.5505, lon: -46.6333 },
  { name: 'Lagos', lat: 6.5244, lon: 3.3792 },
  { name: 'Dubai', lat: 25.2048, lon: 55.2708 },
  { name: 'Singapore', lat: 1.3521, lon: 103.8198 },
  { name: 'Tokio', lat: 35.6762, lon: 139.6503 },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
] as const
