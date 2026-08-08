/**
 * Maapallon geometria-apurit. Erillään komponentista, jotta samat kaavat
 * ovat käytettävissä sekä pisteiden sijoitteluun että kameran tarkennukseen
 * eikä niitä tarvitse johtaa uudelleen.
 */

/**
 * Maantieteelliset koordinaatit pisteeksi pallon pinnalla.
 *
 * Sovitettu three.js:n koordinaatistoon: y ylös, kamera katsoo −z-suuntaan.
 */
export function latLngToVec3(
  lat: number,
  lng: number,
  radius: number,
): { x: number; y: number; z: number } {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((lng + 180) * Math.PI) / 180
  return {
    x: -radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  }
}

/**
 * Kiertokulma (radiaaneina) joka kääntää annetun pituuspiirin kohti kameraa.
 *
 * Johdettu latLngToVec3:sta: kierron jälkeen z' = sin(phi)·sin(theta + a), joka
 * on suurin kun theta + a = 90°. Koska theta = pituuspiiri + 180°, saadaan
 * a = −90° − pituuspiiri.
 */
export function faceLongitude(lng: number): number {
  return ((-90 - lng) * Math.PI) / 180
}
