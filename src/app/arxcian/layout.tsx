import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { currentOwner } from '@/lib/session'
import { getNotifySettings, getTradingTimes } from '@/lib/arxcian/trading/notifyStore'
import { getCalendar } from '@/lib/arxcian/trading/calendar'
import { Shell } from '@/components/arxcian/Shell'
import { ServiceWorkerRegister } from '@/components/arxcian/ServiceWorkerRegister'
import { MarketAlerts } from '@/components/arxcian/trading/MarketAlerts'

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

  // Markkinailmoitukset luetaan layoutissa eikä Trading-sivulla: ajastin
  // kuuluu koko sovellukseen, koska ilmoitus avautuvasta istunnosta on
  // hyödyllinen nimenomaan silloin kun katse on jossain muualla.
  const [notifySettings, tradingTimes, calendar] = await Promise.all([
    getNotifySettings(user),
    getTradingTimes(user),
    // Pelkkä välimuistin luku, ei hakua — ks. calendar.ts:n rate limit.
    getCalendar(),
  ])

  return (
    <div className="arxcian-root min-h-dvh antialiased">
      <Shell user={user}>{children}</Shell>
      <MarketAlerts
        settings={notifySettings}
        times={tradingTimes}
        // Vain punaiset selaimeen: koko kalenteri on ~98 riviä ja
        // serialisoituisi jokaisella /arxcian/*-sivulla, vaikka vain High
        // päätyy koskaan ilmoitukseksi. Valuuttasuodatus jää selaimeen, koska
        // asetus voi vaihtua ilman sivun uudelleenlatausta.
        calendar={(calendar?.data ?? []).filter(e => e.impact === 'High')}
      />
      <ServiceWorkerRegister />
    </div>
  )
}
