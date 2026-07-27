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
