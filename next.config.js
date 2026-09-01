/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Poistetut RJ-Mobin välilehdet (1.9.2026). Yhteenveto ja Tavoitteet ja Run
   * Rate poistuivat navigaatiosta, ja jälkimmäisen kolme näkymää siirtyivät
   * Myyntiseurantaan. Vanhat osoitteet ohjataan sinne eikä 404:ään:
   * kirjanmerkit ja kotiruudulle asennettu PWA voivat yhä osoittaa niihin.
   *
   * `permanent: false` tarkoituksella — 308 jää selaimen välimuistiin
   * pysyvästi, eikä sivun palauttaminen olisi enää peruttavissa käyttäjän
   * puolelta.
   */
  async redirects() {
    return [
      { source: '/arxcian/rj-mob/yhteenveto', destination: '/arxcian/rj-mob/etela', permanent: false },
      { source: '/arxcian/rj-mob/tavoitteet', destination: '/arxcian/rj-mob/etela', permanent: false },
    ]
  },
}
module.exports = nextConfig
