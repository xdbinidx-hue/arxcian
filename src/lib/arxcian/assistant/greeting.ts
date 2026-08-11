import type { UserId } from '@/lib/session'

/**
 * Herätyssanan jälkeinen tervehdys.
 *
 * Oma tiedostonsa eikä osa reittiä siksi, että **selain tarvitsee saman
 * tekstin**: ääni tulee valmiiksi syntetisoituna reitiltä, mutta paletti
 * näyttää tervehdyksen myös kirjoitettuna. Tässä ei ole palvelinpuolen
 * tuonteja (istunnon tyyppi tuodaan `import type`illa, joka katoaa
 * käännöksessä), joten tiedoston voi tuoda myös client-komponenttiin.
 *
 * Teksti on suomeksi, vaikka avustaja vastaa englanniksi
 * (api/arxcian/assistant:n SYSTEM_PROMPT). Ristiriita on tiedossa: englanti
 * valittiin aikanaan Googlen brittiäänen takia, eikä ElevenLabsiin siirtyminen
 * yksin ole syy vaihtaa avustajan kieltä — se on erillinen päätös.
 */

/** Käyttäjätunnus näyttömuodossa: 'albin' → 'Albin'. */
export function displayName(user: UserId): string {
  return user.charAt(0).toUpperCase() + user.slice(1)
}

/** Tervehdys nimeltä. Käyttäjiä on kaksi, joten tervehdyksiäkin on kaksi. */
export function greetingText(user: UserId): string {
  return `Hei ${displayName(user)}, miten voin auttaa?`
}
