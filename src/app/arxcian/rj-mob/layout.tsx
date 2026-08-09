/**
 * RJ-Mobin pinta arxcianin kehyksen sisällä.
 *
 * arxcianin Shell antaa ylänauhan ja osiopalkin tummana; RJ-Mobin data —
 * taulukot, listat ja seurannat — pysyy tarkoituksella neutraalin valkoisena,
 * koska lukujen pitää olla luettavia eikä tunnelmallisia.
 *
 * Negatiiviset marginaalit kumoavat Shellin `main`-elementin sisennyksen, jotta
 * valkoinen pinta yltää reunoihin asti. Ilman sitä RJ-Mob näyttäisi kapealta
 * laatikolta tumman taustan päällä.
 *
 * Vasenta sisennystä EI kumota: osiopalkki on kiinteä päällyskerros, ja pinnan
 * vetäminen sen alle piilottaisi navigaation vasemman reunan sen taakse.
 *
 * `color` on palautettava erikseen: `.arxcian-root` asettaa vaalean tekstivärin
 * tummaa taustaa varten, ja se periytyisi tänne valkoiselle pinnalle, jolloin
 * taulukot näkyisivät lähes lukukelvottoman haaleina.
 */
export default function RjMobLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="-mx-3 -mt-4 min-h-dvh sm:-mx-5"
      style={{ background: '#f8f8f6', color: '#1a1a1a', fontFamily: 'system-ui,sans-serif' }}
    >
      {children}
    </div>
  )
}
