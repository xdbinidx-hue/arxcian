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

/**
 * Kesto ihmisluettavana: "nyt", "25 min", "3 h 12 min", "2 vrk 4 h".
 *
 * Jaettu lähtölaskennoissa (talouskalenteri, markkinaistunnot), jottei sama
 * kesto näyttäisi kahdelta eri asialta kahdessa vierekkäisessä paneelissa.
 * Vuorokaudet ovat mukana istuntojen takia: perjantai-iltana seuraava avaus on
 * maanantaina, ja "62 h" olisi luettavana huonompi kuin "2 vrk 14 h".
 */
export function countdown(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return 'nyt'
  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const restMinutes = minutes % 60
    return restMinutes === 0 ? `${hours} h` : `${hours} h ${restMinutes} min`
  }

  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours === 0 ? `${days} vrk` : `${days} vrk ${restHours} h`
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
