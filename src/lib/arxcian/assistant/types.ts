/**
 * Avustajan kielen sopimus: tyyppi, oletus ja tarkistus.
 *
 * Omassa tiedostossaan eikä language.ts:ssä, koska **selain tarvitsee nämä**:
 * komentopaletti näyttää tervehdyksen oletuskielellä siihen asti kunnes
 * palvelin kertoo käyttäjän oman kielen. language.ts lukee ja kirjoittaa
 * Redisiä, joten sen tuominen client-komponenttiin vetäisi kv-asiakkaan
 * selainniputukseen. Tässä tiedostossa ei ole tuonteja lainkaan.
 */

export type AssistantLanguage = 'fi' | 'en'

/**
 * Oletus, kun asetusta ei ole tallennettu tai Redis ei vastaa.
 *
 * Englanti säilyttää aiemman käyttäytymisen: ennen kielivalintaa avustaja
 * vastasi aina englanniksi, joten kukaan ei huomaa muutosta ennen kuin pyytää
 * suomea.
 */
export const DEFAULT_LANGUAGE: AssistantLanguage = 'en'

/** Kelpaako arvo kieleksi. Malli voi ehdottaa mitä tahansa merkkijonoa. */
export function isLanguage(value: unknown): value is AssistantLanguage {
  return value === 'fi' || value === 'en'
}
