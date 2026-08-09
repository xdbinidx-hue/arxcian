/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // RJ-Mobin sivuja siirretään vaiheittain /rj-mob/*-rakenteeseen.
      // permanent: false (307) toistaiseksi, kunnes rakenne on vakiintunut
      // — 308:aa ei voi enää perua selainten/hakukoneiden välimuistista.
      { source: '/tuotto', destination: '/rj-mob/tuotto', permanent: false },
      { source: '/trendit', destination: '/rj-mob/trendit', permanent: false },
      { source: '/runrate', destination: '/rj-mob/runrate', permanent: false },
      { source: '/etela', destination: '/rj-mob/etela', permanent: false },
      { source: '/tavoitteet', destination: '/rj-mob/tavoitteet', permanent: false },
      { source: '/kassamyynti', destination: '/rj-mob/kassamyynti', permanent: false },
      { source: '/tyovuoro', destination: '/rj-mob/tyovuoro', permanent: false },
      { source: '/tyovuorot', destination: '/rj-mob/tyovuorot', permanent: false },
    ]
  },
}
module.exports = nextConfig
