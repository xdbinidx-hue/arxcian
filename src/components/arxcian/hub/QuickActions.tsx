import Link from 'next/link'
import { IconNote, IconTarget, IconCalendarPlus, IconAlertPlus } from '@/components/arxcian/icons'
import { Panel } from '@/components/arxcian/Panel'

const ACTIONS = [
  { label: 'Muistiinpano', href: '/arxcian/personal', Icon: IconNote },
  { label: 'Tavoite', href: '/arxcian/personal', Icon: IconTarget },
  { label: 'Kalenteri', href: '/arxcian/personal', Icon: IconCalendarPlus },
  { label: 'Hälytys', href: '/arxcian/trading', Icon: IconAlertPlus },
] as const

/** Pikatoiminnot hubin etusivulla — suorat oikotiet Personal/Trading-osioiden lisäystoimintoihin. */
export function QuickActions({ delay }: { delay?: number }) {
  return (
    <Panel title="Pikatoiminnot" delay={delay}>
      <div className="grid grid-cols-4 gap-2">
        {ACTIONS.map(({ label, href, Icon }) => (
          <Link
            key={label}
            href={href}
            className="group flex flex-col items-center gap-1.5 ax-glass ax-glass-hover rounded-xl px-2 py-3 text-center transition-colors"
          >
            <Icon className="h-4.5 w-4.5 text-ax-accent transition-transform group-hover:scale-110" />
            <span className="text-[10px] leading-tight text-ax-faint">{label}</span>
          </Link>
        ))}
      </div>
    </Panel>
  )
}
