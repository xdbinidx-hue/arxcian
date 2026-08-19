import Link from 'next/link'
import { readCached } from '@/lib/arxcian/cache'
import { panelFetchState } from '@/lib/arxcian/panelStatus'
import { UI_REFRESH_JOBS } from '@/lib/arxcian/cronAccess'
import { fetchLabel } from '@/lib/arxcian/time'
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
 * haun, vika näkyi vain lokissa. Hakuaika ja virkistysnappi tulevat nyt
 * Panelin `refresh`-propista, jotta jokainen paneeli näyttää saman tiedon
 * samalla tavalla. Tieto tulee mitatusta hakutilasta (fetchStatus.ts) eikä
 * datan iästä pääteltynä.
 *
 * Kanavakohtainen "osa kanavista ei vastannut" -palkki jää tänne: se on
 * lähdelistan tietoa, jota jaettu kehys ei tunne.
 */

const MAX_ROWS = 5

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
  const cached = await readCached<ChannelVideo[]>(CHANNELS_CACHE_KEY)
  const videos = (cached?.data ?? []).slice(0, MAX_ROWS)
  const status = await panelFetchState(CHANNELS_CACHE_KEY, cached?.fetchedAt)

  // Osittainenkin epäonnistuminen on kerrottava. Neljä viidestä kanavasta
  // kaatuneena lista näyttäisi muuten aivan terveeltä, koska kaatuneiden
  // kohdalle jää edellisen ajon video — se on oikea valinta datalle mutta
  // väärä ainoana signaalina.
  const { stale, failed, fetchedAt, attemptedAt } = status

  return (
    <Panel
      title="Kanavat"
      delay={delay}
      refresh={{ job: UI_REFRESH_JOBS.kanavat, state: status }}
      empty={
        stale && attemptedAt
          ? `Videoita ei saatu haettua — viimeisin yritys ${fetchLabel(attemptedAt)} epäonnistui.`
          : 'Ei vielä videoita — haetaan seuraavassa ajastetussa ajossa.'
      }
    >
      {videos.length > 0 ? (
        <>
          {failed.length > 0 ? (
            <p className="mb-2.5 rounded-md border border-ax-down/30 bg-ax-down/10 px-2.5 py-1.5 text-[9px] leading-relaxed text-ax-down">
              {stale ? 'Data vanhentunut — haku epäonnistui ' : 'Osa kanavista ei vastannut '}
              {attemptedAt ? fetchLabel(attemptedAt) : ''} ({failed.join(', ')}).
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
