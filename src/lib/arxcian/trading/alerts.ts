import { readCached, writeCached } from '../cache'
import type { Alert, AlertCondition, Quote } from './types'

const CACHE_KEY = 'trading:alerts'
const TTL_SECONDS = 30 * 24 * 60 * 60
// Lauenneet hälytykset säilytetään näkyvissä viikon, sitten siivotaan pois.
const TRIGGERED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const MAX_ALERTS = 100

function purgeOld(alerts: Alert[]): Alert[] {
  const cutoff = Date.now() - TRIGGERED_RETENTION_MS
  return alerts.filter(a => !a.triggeredAt || a.triggeredAt > cutoff)
}

export async function getAlerts(): Promise<Alert[]> {
  const cached = await readCached<Alert[]>(CACHE_KEY)
  return purgeOld(cached?.data ?? [])
}

export async function addAlert(input: {
  symbol: string
  label: string
  condition: AlertCondition
  threshold: number
  createdBy: string
}): Promise<Alert[]> {
  const current = await getAlerts()
  const alert: Alert = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: Date.now(),
    triggeredAt: null,
  }
  const updated = [alert, ...current].slice(0, MAX_ALERTS)
  await writeCached(CACHE_KEY, updated, TTL_SECONDS, 0)
  return updated
}

export async function removeAlert(id: string): Promise<Alert[]> {
  const current = await getAlerts()
  const updated = current.filter(a => a.id !== id)
  await writeCached(CACHE_KEY, updated, TTL_SECONDS, 0)
  return updated
}

/**
 * Vertaa aktiivisia hälytyksiä annettuihin kursseihin ja merkitsee lauenneet.
 * Kutsutaan cron-työstä quotes-päivityksen jälkeen.
 */
export async function checkAlerts(quotes: Record<string, Quote | null>): Promise<number> {
  const current = await getAlerts()
  let triggeredCount = 0

  const updated = current.map(alert => {
    if (alert.triggeredAt) return alert
    const quote = quotes[alert.symbol]
    if (!quote) return alert

    const hit =
      alert.condition === 'above' ? quote.price >= alert.threshold : quote.price <= alert.threshold

    if (hit) {
      triggeredCount++
      return { ...alert, triggeredAt: Date.now() }
    }
    return alert
  })

  if (triggeredCount > 0) {
    await writeCached(CACHE_KEY, updated, TTL_SECONDS, 0)
  }
  return triggeredCount
}
