'use client'

import { useEffect } from 'react'

/** Rekisteröi service workerin, jotta sovelluksen voi asentaa kotiruudulle. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // Kehityksessä rekisteröinti vain sotkisi Next.js:n hot reloadia.
    if (process.env.NODE_ENV !== 'production') return

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(err => {
      console.error('Service workerin rekisteröinti epäonnistui', err)
    })
  }, [])

  return null
}
