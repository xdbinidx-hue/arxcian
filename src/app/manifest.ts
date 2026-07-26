import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'arxcian',
    short_name: 'arxcian',
    description: 'Henkilökohtainen komentokeskus',
    // Kotiruudulta avautuu suoraan hubiin, mutta scope kattaa koko
    // sovelluksen jotta RJ-Mob aukeaa samassa ikkunassa eikä selaimessa.
    start_url: '/arxcian',
    scope: '/',
    display: 'standalone',
    background_color: '#05070a',
    theme_color: '#05070a',
    lang: 'fi',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
