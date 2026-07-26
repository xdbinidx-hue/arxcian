import { SectionPlaceholder } from '@/components/arxcian/SectionPlaceholder'

export const metadata = { title: 'Trading · arxcian' }

export default function TradingPage() {
  return (
    <SectionPlaceholder
      id="trading"
      title="Trading"
      description="Markkinat, watchlist ja ICT"
      vaihe={2}
      tulossa={[
        'Watchlist: öljy, BTC, ETH, US500, NAS100, XAUUSD, DXY, EURUSD, GBPUSD, USDJPY',
        'Top 10 osaketta ja 5–10 ajankohtaista kryptoa',
        'Heatmap seuratuista instrumenteista ja sentimenttimittari',
        'YouTube-syöte ICT-kanaville',
        'Talouskalenteri: korkean vaikutuksen tapahtumat',
        'Hälytysten perusversio, säilytys päivän ja viikon ajan',
        'ICT session-kello, korrelaatiot ja COT-raportti (vaihe 5)',
      ]}
    />
  )
}
