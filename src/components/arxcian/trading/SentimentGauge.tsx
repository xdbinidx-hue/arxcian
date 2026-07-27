import { getSentiment, describeSentiment } from '@/lib/arxcian/trading/sentiment'
import { Panel } from '@/components/arxcian/Panel'

const TONE_COLOR: Record<string, string> = {
  down: 'text-ax-down',
  warn: 'text-ax-warn',
  neutral: 'text-ax-dim',
  up: 'text-ax-up',
}

export async function SentimentGauge() {
  let data
  try {
    data = await getSentiment()
  } catch {
    return (
      <Panel title="Sentimentti" meta="Fear & Greed">
        <p className="py-4 text-center text-[13px] text-ax-faint">Ei saatavilla juuri nyt.</p>
      </Panel>
    )
  }

  const { value, classification } = data.data
  const { label, tone } = describeSentiment(classification)

  return (
    <Panel title="Sentimentti" meta="Crypto Fear & Greed">
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0">
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-ax-line" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray={`${(value / 100) * 97.4} 97.4`}
              strokeLinecap="round"
              className={TONE_COLOR[tone]}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`font-mono text-lg tabular-nums ${TONE_COLOR[tone]}`}>{value}</span>
          </div>
        </div>
        <div>
          <p className={`text-[15px] font-medium ${TONE_COLOR[tone]}`}>{label}</p>
          <p className="mt-0.5 text-[11px] text-ax-faint">Kryptomarkkinan tunnelma, 0–100</p>
        </div>
      </div>
    </Panel>
  )
}
