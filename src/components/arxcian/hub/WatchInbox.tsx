import { currentUser } from '@/lib/session'
import { readInbox } from '@/lib/arxcian/watch/inbox'
import { statusKeyFor } from '@/lib/arxcian/watch/watch'
import { panelFetchState } from '@/lib/arxcian/panelStatus'
import { UI_REFRESH_JOBS } from '@/lib/arxcian/cronAccess'
import { Panel } from '@/components/arxcian/Panel'
import { WatchInboxList } from './WatchInboxList'

/**
 * UUTTA: watchin löytämä uusi sisältö.
 *
 * Yksi paneeli kaikille listoille, koska inbox on yksi avain — hub näyttää
 * yhden merkin eikä osiokohtaisia. Rivit haetaan palvelimella ja suodatetaan
 * omistajuuden mukaan siellä; selain saa vain sen mitä käyttäjä saa nähdä.
 */

const MAX_ROWS = 6

export async function WatchInbox({ delay }: { delay?: number }) {
  const user = await currentUser()
  const items = user ? await readInbox(user) : []

  // Kaksi listaa, kaksi hakutilaa: postilaatikko on niin tuore kuin sen
  // huonompi lähde, eikä toisen kaatuminen saa näyttää terveeltä.
  const status = await panelFetchState([statusKeyFor('trading'), statusKeyFor('personal')])

  return (
    <Panel
      title="Uutta"
      delay={delay}
      refresh={{ job: UI_REFRESH_JOBS.watch, state: status }}
      meta={items.length > 0 ? String(items.length) : undefined}
      empty="Ei uutta sisältöä seuratuilla kanavilla."
    >
      {items.length > 0 ? <WatchInboxList items={items.slice(0, MAX_ROWS)} /> : null}
    </Panel>
  )
}
