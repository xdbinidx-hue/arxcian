import Link from 'next/link'
import { getAlerts } from '@/lib/arxcian/trading/alerts'
import { timeAgo } from '@/lib/arxcian/time'
import { Panel } from '@/components/arxcian/Panel'

const MAX_SHOWN = 4

/**
 * Lauenneet hälytykset nostetaan hubin etusivulle — ne ovat ainoa asia
 * jonka takia tänne kannattaa vilkaista kesken päivän. Aktiiviset näkyvät
 * pelkkänä lukumääränä, koko lista on Trading-osiossa.
 */
export async function AlertsSummary({ delay }: { delay?: number }) {
  const alerts = await getAlerts()
  const triggered = alerts
    .filter(a => a.triggeredAt)
    .sort((a, b) => (b.triggeredAt ?? 0) - (a.triggeredAt ?? 0))
  const activeCount = alerts.length - triggered.length

  return (
    <Panel
      title="Hälytykset"
      meta={
        triggered.length > 0
          ? `${triggered.length} lauennut`
          : activeCount > 0
            ? `${activeCount} aktiivista`
            : undefined
      }
      delay={delay}
      empty={
        alerts.length === 0
          ? 'Ei hälytyksiä. Aseta rajat Trading-osiossa.'
          : `${activeCount} hälytystä vahtimassa — yksikään ei ole lauennut.`
      }
    >
      {triggered.length > 0 ? (
        <>
          <ul className="space-y-2">
            {triggered.slice(0, MAX_SHOWN).map(alert => (
              <li key={alert.id} className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-ax-text">
                  <span className="font-medium">{alert.label}</span>{' '}
                  <span className="text-ax-dim">
                    {alert.condition === 'above' ? 'yli' : 'alle'}{' '}
                    <span className="font-mono tabular-nums">{alert.threshold}</span>
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-ax-faint">
                  {timeAgo(alert.triggeredAt)}
                </span>
              </li>
            ))}
          </ul>
          {triggered.length > MAX_SHOWN && (
            <p className="mt-2 text-[11px] text-ax-faint">
              +{triggered.length - MAX_SHOWN} muuta lauennutta
            </p>
          )}
          <Link
            href="/arxcian/trading"
            className="mt-3 inline-block text-[11px] text-ax-faint transition-colors hover:text-ax-accent"
          >
            Kuittaa Trading-osiossa →
          </Link>
        </>
      ) : null}
    </Panel>
  )
}
