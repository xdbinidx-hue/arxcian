import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { currentOwner } from '@/lib/session'
import { Shell } from '@/components/arxcian/Shell'
import { ServiceWorkerRegister } from '@/components/arxcian/ServiceWorkerRegister'

export const metadata: Metadata = {
  title: 'arxcian',
  description: 'Henkilökohtainen komentokeskus',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'arxcian',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  themeColor: '#05070a',
  // Sisältö ulottuu lovien alle, alapalkki käyttää safe-area-marginaalia
  viewportFit: 'cover',
}

export default async function ArxcianLayout({ children }: { children: React.ReactNode }) {
  // Middleware hoitaa suojauksen, tämä on toinen lukko palvelinpuolella.
  const user = await currentOwner()
  if (!user) redirect('/login')

  return (
    <div className="arxcian-root min-h-dvh antialiased">
      <Shell user={user}>{children}</Shell>
      <ServiceWorkerRegister />
    </div>
  )
}
