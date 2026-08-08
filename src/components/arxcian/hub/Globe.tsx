'use client'

import dynamic from 'next/dynamic'

/**
 * Maapallon kääre. Varsinainen three.js-toteutus ladataan dynaamisesti ja
 * vasta selaimessa (ssr: false), jottei ~600 kB kirjastoa ole mukana
 * ensilatauksen bundlessa — arxcian on PWA jota käytetään puhelimella.
 *
 * Latauksen ajan näytetään samankokoinen hehkuva paikanvaraaja, jottei
 * sivun asettelu hyppää kun maapallo ilmestyy.
 */
const GlobeScene = dynamic(() => import('./GlobeScene'), {
  ssr: false,
  loading: () => (
    <div className="aspect-square animate-pulse rounded-full bg-ax-accent/5" aria-hidden="true" />
  ),
})

export function Globe({ className = '' }: { className?: string }) {
  return <GlobeScene className={className} />
}
