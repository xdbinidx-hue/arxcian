/**
 * Tämä päivä Helsingin aikavyöhykkeellä muodossa YYYY-MM-DD. UTC:hen nojaava
 * toISOString() vaihtaisi päivän klo 02–03 Suomen aikaa, jolloin "tänään"
 * hyppäisi eteenpäin kesken illan. en-CA antaa valmiiksi ISO-muodon.
 */
export function todayISOHelsinki(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date())
}

/** Annettu hetki Helsingin päivämääränä, ks. todayISOHelsinki. */
export function isoDateHelsinki(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(date)
}

/** Suhteellinen aikaleima suomeksi. Sama muotoilu uutiskorteissa ja hubissa. */
export function timeAgo(ms: number | null): string {
  if (!ms) return ''
  const diffMin = Math.round((Date.now() - ms) / 60_000)
  if (diffMin < 1) return 'juuri nyt'
  if (diffMin < 60) return `${diffMin} min sitten`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH} h sitten`
  return `${Math.round(diffH / 24)} vrk sitten`
}
