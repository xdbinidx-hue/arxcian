function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Peräkkäisten päivien putki tähän hetkeen asti. Eilinen riittää pitämään
 * streakin elossa, jottei se näytä nollaa ennen kuin päivä on ohi.
 *
 * Puhdas funktio ilman riippuvuuksia — turvallinen tuoda sekä palvelin-
 * että asiakaskomponentteihin (habits.ts käyttää Redis-yhteyttä, jota ei
 * saa päätyä selainbundleen).
 */
export function calculateStreak(completedDates: string[]): number {
  const dates = new Set(completedDates)
  const cursor = new Date()

  if (!dates.has(todayISO())) {
    cursor.setDate(cursor.getDate() - 1)
    if (!dates.has(cursor.toISOString().slice(0, 10))) return 0
  }

  let streak = 0
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}
