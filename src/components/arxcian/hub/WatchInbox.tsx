import { currentUser } from '@/lib/session'
import { readInbox } from '@/lib/arxcian/watch/inbox'
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

  return (
    <Panel
      title="Uutta"
      delay={delay}
      meta={items.length > 0 ? String(items.length) : undefined}
      empty="Ei uutta sisältöä seuratuilla kanavilla."
    >
      {items.length > 0 ? <WatchInboxList items={items.slice(0, MAX_ROWS)} /> : null}
    </Panel>
  )
}
