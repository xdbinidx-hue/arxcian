'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HUB_HREF, SECTIONS, activeSection } from '@/lib/arxcian/nav'
import { SectionIcon, IconHub } from './icons'
import { Ticker } from './Ticker'
import { UserBadge } from './UserBadge'
import { CommandPalette } from './CommandPalette'

/**
 * arxcianin kehys: ylänauha, navigaatio ja komentopaletti.
 * Desktopissa navigaatio on kapea vasen palkki, mobiilissa alapalkki.
 */
export function Shell({ user, children }: { user: string; children: ReactNode }) {
  const pathname = usePathname()
  const active = activeSection(pathname)
  const onHub = pathname === HUB_HREF

  const items = [
    { id: 'hub' as const, label: 'Hub', href: HUB_HREF, isActive: onHub },
    ...SECTIONS.map(s => ({
      id: s.id,
      label: s.label,
      href: s.href,
      isActive: active === s.id,
    })),
  ]

  return (
    <div className="min-h-dvh">
      {/* Ylänauha */}
      <header className="fixed inset-x-0 top-0 z-40 h-12 ax-glass-divide border-b bg-ax-bg/60 backdrop-blur-2xl">
        <div className="flex h-full items-center gap-4 px-3 sm:px-4">
          <Link href={HUB_HREF} className="flex shrink-0 items-center gap-2">
            <span className="ax-pulse h-1.5 w-1.5 rounded-full bg-ax-accent" />
            <span className="text-[13px] font-medium lowercase tracking-[0.18em] text-ax-text">
              arxcian
            </span>
          </Link>

          <div className="min-w-0 flex-1">
            <Ticker />
          </div>

          <kbd className="hidden shrink-0 rounded border border-ax-line px-1.5 py-0.5 font-mono text-[10px] text-ax-faint md:inline">
            ⌘K
          </kbd>
          <UserBadge user={user} />
        </div>
      </header>

      {/* Vasen palkki, desktop */}
      <nav
        aria-label="Osiot"
        className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col items-center gap-1 ax-glass-divide border-r bg-ax-bg/50 pt-14 backdrop-blur-2xl lg:flex"
      >
        {items.map(item => (
          <Link
            key={item.id}
            href={item.href}
            title={item.label}
            aria-current={item.isActive ? 'page' : undefined}
            className={`group relative flex h-12 w-12 items-center justify-center rounded-lg transition-colors ${
              item.isActive ? 'bg-ax-panel-hi text-ax-accent' : 'text-ax-faint hover:text-ax-text'
            }`}
          >
            {item.id === 'hub' ? (
              <IconHub className="h-5 w-5" />
            ) : (
              <SectionIcon id={item.id} className="h-5 w-5" />
            )}
            {item.isActive && (
              <span className="absolute left-0 h-6 w-0.5 rounded-r bg-ax-accent" />
            )}
            <span className="pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded-md border border-ax-line bg-ax-panel px-2 py-1 text-[11px] text-ax-text group-hover:block">
              {item.label}
            </span>
          </Link>
        ))}
      </nav>

      {/* Sisältö */}
      <main className="px-3 pb-24 pt-16 sm:px-5 lg:pb-10 lg:pl-[4.75rem]">{children}</main>

      {/* Alapalkki, mobiili */}
      <nav
        aria-label="Osiot"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 ax-glass-divide border-t bg-ax-bg/70 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl lg:hidden"
      >
        {items.map(item => (
          <Link
            key={item.id}
            href={item.href}
            aria-current={item.isActive ? 'page' : undefined}
            className={`flex flex-col items-center gap-1 py-2.5 transition-colors ${
              item.isActive ? 'text-ax-accent' : 'text-ax-faint'
            }`}
          >
            {item.id === 'hub' ? (
              <IconHub className="h-5 w-5" />
            ) : (
              <SectionIcon id={item.id} className="h-5 w-5" />
            )}
            <span className="text-[10px] tracking-wide">{item.label}</span>
          </Link>
        ))}
      </nav>

      <CommandPalette />
    </div>
  )
}
