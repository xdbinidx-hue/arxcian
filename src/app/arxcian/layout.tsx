import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentOwner } from '@/lib/session'
import { Shell } from '@/components/arxcian/Shell'

export const metadata: Metadata = {
  title: 'arxcian',
  description: 'Henkilökohtainen komentokeskus',
}

export default async function ArxcianLayout({ children }: { children: React.ReactNode }) {
  // Middleware hoitaa suojauksen, tämä on toinen lukko palvelinpuolella.
  const user = await currentOwner()
  if (!user) redirect('/login')

  return (
    <div className="arxcian-root min-h-dvh antialiased">
      <Shell user={user}>{children}</Shell>
    </div>
  )
}
