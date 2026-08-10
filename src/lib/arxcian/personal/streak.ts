import { todayISOHelsinki, isoDateHelsinki } from '../time'

/**
 * Peräkkäisten päivien putki tähän hetkeen asti. Eilinen riittää pitämään
 * streakin elossa, jottei se näytä nollaa ennen kuin päivä on ohi.
 *
 * Ainoa riippuvuus on time.ts:n päivämääräapurit — turvallinen tuoda sekä
 * palvelin- että asiakaskomponentteihin (habits.ts käyttää Redis-yhteyttä,
 * jota ei saa päätyä selainbundleen).
 */
export function calculateStreak(completedDates: string[]): number {
  const dates = new Set(completedDates)
  const cursor = new Date()

  if (!dates.has(todayISOHelsinki())) {
    cursor.setDate(cursor.getDate() - 1)
    if (!dates.has(isoDateHelsinki(cursor))) return 0
  }

  let streak = 0
  while (dates.has(isoDateHelsinki(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}
