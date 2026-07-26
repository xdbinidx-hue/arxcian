'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconLogout } from './icons'

/** Kirjautunut käyttäjä ja uloskirjautuminen — tarvitaan Albinin ja Arbnorin vaihtoon. */
export function UserBadge({ user }: { user: string }) {
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  const logout = async () => {
    setBusy(true)
    await fetch('/api/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[11px] uppercase tracking-[0.14em] text-ax-dim sm:inline">
        {user}
      </span>
      <button
        onClick={logout}
        disabled={busy}
        title="Kirjaudu ulos"
        aria-label="Kirjaudu ulos"
        className="rounded-md border border-ax-line p-1.5 text-ax-faint transition-colors hover:border-ax-line-strong hover:text-ax-text disabled:opacity-40"
      >
        <IconLogout className="h-4 w-4" />
      </button>
    </div>
  )
}
