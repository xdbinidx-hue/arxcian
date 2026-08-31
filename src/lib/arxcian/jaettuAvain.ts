import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Jaetun avaimen vertailu vakioajassa.
 *
 * `===` paljastaisi avaimen pituuden ja alun ajoituksesta, ja
 * `timingSafeEqual` heittää suoraan käytettynä `RangeError`in kun puskurit
 * ovat eri pituisia — eli pituusvuoto tulisi takaovesta sisään. Molemmat
 * arvot tiivistetään siksi ensin SHA-256:lla, jolloin vertailtavat ovat aina
 * 32 tavua riippumatta siitä mitä kutsuja lähetti.
 *
 * **Tyhjä odotettu avain ei kelpaa koskaan.** Ilman tätä puuttuva
 * ympäristömuuttuja tekisi reitistä avoimen kenelle tahansa joka lähettää
 * tyhjän otsakkeen.
 */
export function avainKelpaa(annettu: string | null | undefined, odotettu: string | undefined): boolean {
  if (!odotettu) return false
  if (!annettu) return false

  const a = createHash('sha256').update(annettu).digest()
  const b = createHash('sha256').update(odotettu).digest()
  return timingSafeEqual(a, b)
}
