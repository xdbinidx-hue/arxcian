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
