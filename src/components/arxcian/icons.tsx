import type { SectionId } from '@/lib/arxcian/nav'

type IconProps = { className?: string }

/** Ohutviivaiset ikonit. Kirjoitettu käsin, jotta ikonikirjastoa ei tarvita. */

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function IconRjmob({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3 20h18" />
      <path d="M6 20V12" />
      <path d="M11 20V7" />
      <path d="M16 20v-5" />
      <path d="M21 20V4" />
    </svg>
  )
}

export function IconTrading({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M7 4v3M7 17v3M17 4v2M17 18v2" />
      <rect x="4.5" y="7" width="5" height="10" rx="1" />
      <rect x="14.5" y="6" width="5" height="12" rx="1" />
    </svg>
  )
}

export function IconUutiset({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M16 9h3a1 1 0 0 1 1 1v7a2 2 0 0 1-4 0" />
      <path d="M7 9h6M7 12h6M7 15h4" />
    </svg>
  )
}

export function IconPersonal({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  )
}

export function IconHub({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="12" cy="12" r="8.5" opacity="0.45" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2" />
    </svg>
  )
}

export function IconSearch({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5" />
    </svg>
  )
}

export function IconLogout({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" />
      <path d="M10 8l-4 4 4 4M6 12h9" />
    </svg>
  )
}

const SECTION_ICONS: Record<SectionId, (p: IconProps) => JSX.Element> = {
  rjmob: IconRjmob,
  trading: IconTrading,
  uutiset: IconUutiset,
  personal: IconPersonal,
}

export function SectionIcon({ id, className }: { id: SectionId; className?: string }) {
  const Icon = SECTION_ICONS[id]
  return <Icon className={className} />
}
