import Link from 'next/link'
import { readCached } from '@/lib/arxcian/cache'
import { readFetchStatus } from '@/lib/arxcian/fetchStatus'
import { CHANNELS_CACHE_KEY, type ChannelVideo } from '@/lib/arxcian/channels'
import { Panel } from '@/components/arxcian/Panel'

/**
 * KANAVAT: seurattujen YouTube-kanavien tuoreimmat videot.
 *
 * Luetaan vain välimuistista, ei haeta. Sivulataus ei saa odottaa viittä
 * YouTube-syötettä — cron pitää avaimen lämpimänä (ks. cron.ts:n
 * hub-channels). Sama periaate kuin muillakin ulkoisilla lähteillä
 * CLAUDE.md:n mukaan.
 *
 * Pikkukuvat tulevat YouTuben omalta palvelimelta suoraan <img>-tagilla eikä
 * next/imagen kautta: kuvat ovat pieniä ja vaihtuvat tunnin välein, joten
 * optimoinnista ei olisi hyötyä mutta remotePatterns-määrittely olisi yksi
 * ylläpidettävä asia lisää.
 *
 * **Vanhentuneisuus näytetään, ei piiloteta.** Paneeli näytti aiemmin
 * välimuistin sisällön kertomatta milloin se haettiin, joten viikon vanha
 * lista näytti täsmälleen samalta kuin tunnin vanha — ja kun YouTube esti
 * haun, vika näkyi vain lokissa. Otsikkorivillä on nyt hakuaika, ja jos
 * viimeisin yritys epäonnistui, sen kertoo erillinen rivi. Tieto tulee
 * mitatusta hakutilasta (fetchStatus.ts) eikä datan iästä pääteltynä.
 */

const MAX_ROWS = 5

/** Kellonaika, ja päivämäärä mukaan jos haku ei ole tältä päivältä. */
function fetchLabel(ms: number): string {
  const d = new Date(ms)
  const klo = d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
  const tanaan = new Date().toDateString() === d.toDateString()
  return tanaan ? klo : `${d.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })} ${klo}`
}

/** "2 h sitten" — karkea ja luettava, ei minuutin tarkkuutta. */
function ageLabel(publishedAt: number | null): string {
  if (!publishedAt) return ''

  const hours = Math.floor((Date.now() - publishedAt) / 3_600_000)
  if (hours < 1) return 'juuri nyt'
  if (hours < 24) return `${hours} h sitten`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'eilen'
  if (days < 7) return `${days} pv sitten`

  return `${Math.floor(days / 7)} vk sitten`
}

export async function Channels({ delay }: { delay?: number }) {
  const [cached, status] = await Promise.all([
    readCached<ChannelVideo[]>(CHANNELS_CACHE_KEY),
    readFetchStatus(CHANNELS_CACHE_KEY),
  ])
  const videos = (cached?.data ?? []).slice(0, MAX_ROWS)

  // Viimeisin yritys epäonnistui jos sen jälkeen ei ole onnistuttu. Vertailu
  // on tarkka tieto hakutilasta, ei arvio datan iästä: ajojen väli on yön yli
  // laillisesti 12 h, joten ikäraja joko hälyttäisi turhaan tai vaikenisi.
  const stale =
    status !== null && (status.lastSuccess === null || status.lastSuccess < status.lastAttempt)

  const fetchedAt = status?.lastSuccess ?? cached?.fetchedAt ?? null

  return (
    <Panel
      title="Kanavat"
      delay={delay}
      meta={fetchedAt ? fetchLabel(fetchedAt) : undefined}
      empty={
        stale && status
          ? `Videoita ei saatu haettua — viimeisin yritys ${fetchLabel(status.lastAttempt)} epäonnistui.`
          : 'Ei vielä videoita — haetaan seuraavassa ajastetussa ajossa.'
      }
    >
      {videos.length > 0 ? (
        <>
        {stale ? (
          <p className="mb-2.5 rounded-md border border-ax-down/30 bg-ax-down/10 px-2.5 py-1.5 text-[9px] leading-relaxed text-ax-down">
            Data vanhentunut — haku epäonnistui{' '}
            {status && status.lastAttempt ? fetchLabel(status.lastAttempt) : ''}
            {status && status.failed.length > 0 ? ` (${status.failed.join(', ')})` : ''}.
            {fetchedAt ? ` Näytetään ${fetchLabel(fetchedAt)} haettu lista.` : ''}
          </p>
        ) : null}

        <ul>
          {videos.map(video => (
            <li key={video.id} className="ax-glass-divide border-b last:border-none">
              <a
                href={video.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex gap-3 py-2.5 transition-opacity hover:opacity-80"
              >
                <span className="relative h-9 w-14 shrink-0 overflow-hidden rounded-md border border-ax-line/15 bg-black/40">
                  {video.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={video.thumbnail}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] text-ax-down">
                    ▶
                  </span>
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] text-ax-text">{video.channel}</span>
                  <span className="block truncate text-[9px] text-ax-faint">{video.title}</span>
                </span>

                <span className="shrink-0 self-center font-mono text-[8px] text-ax-faint">
                  {ageLabel(video.publishedAt)}
                </span>
              </a>
            </li>
          ))}
        </ul>

        <Link
          href="/arxcian/trading"
          className="mt-3 inline-flex items-center gap-1 text-[10px] text-ax-accent transition-colors hover:text-ax-text"
        >
          Näytä kaikki kanavat →
        </Link>
        </>
      ) : null}
    </Panel>
  )
}
