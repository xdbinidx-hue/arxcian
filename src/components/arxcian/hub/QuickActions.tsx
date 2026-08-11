import Link from 'next/link'
import {
  IconNote,
  IconTarget,
  IconCalendarPlus,
  IconAlertPlus,
  SectionIcon,
} from '@/components/arxcian/icons'
import { Panel } from '@/components/arxcian/Panel'

/**
 * Pikatoiminnot hubin etusivulla — suorat oikotiet olemassa oleviin
 * näkymiin.
 *
 * Kaikki viisi osoittavat sivulle joka on oikeasti olemassa. Tavoitekuvassa
 * oli nimiä joille ei ole vastinetta ("Asiakkaat", "Raportit", "Asetukset"),
 * eikä etusivulle laiteta painikkeita jotka johtavat 404:ään.
 */
const ACTIONS = [
  { label: 'Muistiinpano', href: '/arxcian/personal', Icon: IconNote },
  { label: 'Tavoite', href: '/arxcian/personal', Icon: IconTarget },
  { label: 'Kalenteri', href: '/arxcian/personal', Icon: IconCalendarPlus },
  { label: 'Hälytys', href: '/arxcian/trading', Icon: IconAlertPlus },
  {
    label: 'Tuotto',
    href: '/arxcian/rj-mob/tuotto',
    Icon: (props: { className?: string }) => <SectionIcon id="rjmob" {...props} />,
  },
] as const

export function QuickActions({ delay }: { delay?: number }) {
  return (
    <Panel title="Pikatoiminnot" delay={delay}>
      <div className="grid grid-cols-5 gap-2">
        {ACTIONS.map(({ label, href, Icon }) => (
          <Link
            key={label}
            href={href}
            className="group flex flex-col items-center gap-1.5 text-center"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-ax-accent/25 bg-ax-accent/[0.04] transition-colors group-hover:border-ax-accent/50 group-hover:bg-ax-accent/10">
              <Icon className="h-4.5 w-4.5 text-ax-accent transition-transform group-hover:scale-110" />
            </span>
            <span className="text-[8px] leading-tight text-ax-faint">{label}</span>
          </Link>
        ))}
      </div>
    </Panel>
  )
}
