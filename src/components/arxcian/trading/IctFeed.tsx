import { getIctVideos } from '@/lib/arxcian/trading/ict'
import { Panel } from '@/components/arxcian/Panel'

function timeAgo(ms: number | null): string {
  if (!ms) return ''
  const diffH = Math.round((Date.now() - ms) / 3_600_000)
  if (diffH < 24) return `${diffH} h sitten`
  return `${Math.round(diffH / 24)} vrk sitten`
}

export async function IctFeed() {
  let videos
  try {
    const result = await getIctVideos()
    videos = result.data.slice(0, 6)
  } catch {
    videos = null
  }

  return (
    <Panel title="ICT-kirjasto" meta="The Inner Circle Trader">
      {!videos || videos.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-ax-faint">Ei videoita saatavilla.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map(v => (
            <a
              key={v.id}
              href={v.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group overflow-hidden rounded-md border border-ax-line"
            >
              {v.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover" />
              )}
              <div className="p-2.5">
                <p className="line-clamp-2 text-[12px] leading-snug text-ax-text group-hover:text-ax-accent">
                  {v.title}
                </p>
                <p className="mt-1 text-[10px] text-ax-faint">{timeAgo(v.publishedAt)}</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </Panel>
  )
}
