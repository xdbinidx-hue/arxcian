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

/**
 * Kuluva hetki minuutteina keskiyöstä Helsingin aikaa.
 *
 * hourCycle: 'h23' on nimenomainen, koska osa ICU-versioista muotoilee
 * keskiyön muotoon 24:00, jolloin vuorokausi alkaisi 1440 minuutista.
 */
export function nowMinutesHelsinki(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Helsinki',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())

  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

/** "05:26" → minuutteja keskiyöstä. null jos muoto ei kelpaa. */
export function clockToMinutes(clock: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(clock)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
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

/**
 * Hakuhetki lyhyesti: kellonaika, ja päivämäärä eteen jos haku ei ole tältä
 * päivältä.
 *
 * Jaettu Panelin virkistysrivin ja kanavapaneelin kesken. Muotoilu on
 * tarkoituksella tiivis: se mahtuu kapean paneelin otsikkoriville metatiedon
 * viereen. Sama hetki ei saa näyttää kahdelta eri asialta kahdessa
 * paneelissa — sama peruste kuin countdownilla.
 */
export function fetchLabel(ms: number): string {
  const d = new Date(ms)
  const klo = d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
  const tanaan = new Date().toDateString() === d.toDateString()
  return tanaan ? klo : `${d.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })} ${klo}`
}
