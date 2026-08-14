import type { UserId } from '@/lib/session'
import type { AssistantLanguage } from './types'

/**
 * Herätyssanan jälkeinen tervehdys.
 *
 * Oma tiedostonsa eikä osa reittiä siksi, että **selain tarvitsee saman
 * tekstin**: ääni tulee valmiiksi syntetisoituna reitiltä, mutta paletti
 * näyttää tervehdyksen myös kirjoitettuna. Tässä ei ole palvelinpuolen
 * tuonteja (istunnon ja kielen tyypit tuodaan `import type`illa, joka katoaa
 * käännöksessä), joten tiedoston voi tuoda myös client-komponenttiin.
 *
 * Tervehdys on samalla kielellä kuin avustajan vastaukset, koska sen lukee sama
 * ääni: englanninkielinen ääni suomenkielisessä tervehdyksessä oli juuri se
 * ristiriita jonka kielivalinta poisti.
 */

/**
 * Otsake jolla tervehdysreitti kertoo selaimelle mitä ääni sanoo.
 *
 * Teksti kulkee äänen mukana samassa vastauksessa, jotta paletin näyttämä
 * tervehdys on varmasti sama kuin kuultu — selaimen ei tarvitse tietää kieltä
 * eikä kysyä sitä erikseen. Nimi on tässä eikä reitissä, koska route.ts saa
 * viedä vain Next.js:n tuntemat nimet.
 *
 * Arvo on URI-koodattu: otsakkeet ovat tavupohjaisia eivätkä kanna ääkkösiä
 * sellaisenaan.
 */
export const GREETING_TEXT_HEADER = 'X-Greeting-Text'

/** Käyttäjätunnus näyttömuodossa: 'albin' → 'Albin'. */
export function displayName(user: UserId): string {
  return user.charAt(0).toUpperCase() + user.slice(1)
}

/** Tervehdys nimeltä ja kielellä. Käyttäjiä on kaksi ja kieliä kaksi. */
export function greetingText(user: UserId, language: AssistantLanguage): string {
  const name = displayName(user)
  return language === 'fi' ? `Hei ${name}, miten voin auttaa?` : `Hi ${name}, how can I help?`
}
