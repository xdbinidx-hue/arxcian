import { getIctVideos, ICT_CACHE_KEY } from '@/lib/arxcian/trading/ict'
import { readFetchStatus } from '@/lib/arxcian/fetchStatus'
import { Panel } from '@/components/arxcian/Panel'

/** Kellonaika, ja päivämäärä mukaan jos haku ei ole tältä päivältä. */
function fetchLabel(ms: number): string {
  const d = new Date(ms)
  const klo = d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
  const tanaan = new Date().toDateString() === d.toDateString()
  return tanaan ? klo : `${d.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })} ${klo}`
}

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

  // Vanhentuneisuus mitatusta hakutilasta, ei datan iästä pääteltynä — sama
  // periaate kuin hubin KANAVAT-paneelissa (ks. CLAUDE.md).
  const status = await readFetchStatus(ICT_CACHE_KEY)
  const stale =
    status !== null && (status.lastSuccess === null || status.lastSuccess < status.lastAttempt)

  return (
    <Panel
      title="ICT-kirjasto"
      meta={status?.lastSuccess ? fetchLabel(status.lastSuccess) : 'The Inner Circle Trader'}
    >
      {stale && status ? (
        <p className="mb-3 rounded-md border border-ax-down/30 bg-ax-down/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-ax-down">
          Data vanhentunut — haku epäonnistui {fetchLabel(status.lastAttempt)}.
          {status.lastSuccess ? ` Näytetään ${fetchLabel(status.lastSuccess)} haettu lista.` : ''}
        </p>
      ) : null}

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
