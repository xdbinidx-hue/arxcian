/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Poistetut RJ-Mobin välilehdet (1.9.2026): Yhteenveto, Tavoitteet ja Run
   * Rate, Kassamyynti ja Päällikköbonus. Vanhat osoitteet ohjataan lähimpään
   * jäljelle jääneeseen näkymään eikä 404:ään — kirjanmerkit ja kotiruudulle
   * asennettu PWA voivat yhä osoittaa niihin.
   *
   * Kohde ei ole kaikilla sama sisältö kuin poistettu sivu, eikä voi olla:
   * Päällikköbonuksella ei ole korvaajaa lainkaan, ja Kassamyynnin
   * myyjäkohtainen näkymä on eri rajaus kuin poistetun sivun myymäläkohtainen.
   * Toimiva sivu on silti parempi lasku kuin virhesivu.
   *
   * `permanent: false` tarkoituksella — 308 jää selaimen välimuistiin
   * pysyvästi, eikä sivun palauttaminen olisi enää peruttavissa käyttäjän
   * puolelta.
   */
  async redirects() {
    return [
      { source: '/arxcian/rj-mob/yhteenveto', destination: '/arxcian/rj-mob/etela', permanent: false },
      { source: '/arxcian/rj-mob/tavoitteet', destination: '/arxcian/rj-mob/etela', permanent: false },
      { source: '/arxcian/rj-mob/kassamyynti', destination: '/arxcian/rj-mob/etela?nakyma=kassamyynti', permanent: false },
      { source: '/arxcian/rj-mob/bonus', destination: '/arxcian/rj-mob/tuotto', permanent: false },
    ]
  },
}
module.exports = nextConfig
