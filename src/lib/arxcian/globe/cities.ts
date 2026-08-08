/**
 * Maapallon Weather-kerroksen kaupungit — käyttäjän valitsema lista.
 *
 * Open-Meteo hakee kaikki yhdellä kutsulla, joten lista saa kasvaa ilman
 * että pyyntöjen määrä muuttuu.
 */
export const GLOBE_CITIES = [
  { name: 'Tirana', lat: 41.3275, lon: 19.8187 },
  { name: 'Prishtina', lat: 42.6629, lon: 21.1655 },
  { name: 'Helsinki', lat: 60.1699, lon: 24.9384 },
  { name: 'Berliini', lat: 52.52, lon: 13.405 },
  { name: 'Pariisi', lat: 48.8566, lon: 2.3522 },
  { name: 'Lontoo', lat: 51.5074, lon: -0.1278 },
  { name: 'Moskova', lat: 55.7558, lon: 37.6173 },
  { name: 'Dubai', lat: 25.2048, lon: 55.2708 },
  { name: 'Hongkong', lat: 22.3193, lon: 114.1694 },
  { name: 'Tokio', lat: 35.6762, lon: 139.6503 },
  { name: 'Melbourne', lat: -37.8136, lon: 144.9631 },
  { name: 'New York', lat: 40.7128, lon: -74.006 },
  { name: 'Miami', lat: 25.7617, lon: -80.1918 },
  { name: 'Los Angeles', lat: 34.0522, lon: -118.2437 },
] as const
