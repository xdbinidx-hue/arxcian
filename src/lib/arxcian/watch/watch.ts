import { writeAttempt } from '../fetchStatus'
import { fetchWatchFeed } from './feed'
import { addToInbox } from './inbox'
import { diffAndMark } from './seen'
import { sourcesForList } from './sources'
import type { WatchItem, WatchList, WatchResult } from './types'

/**
 * Hae → erota uudet → aja listan toiminto.
 *
 * **Uutuus ja ilmoitus ovat eri asioita.** Tämä kertoo mikä on uutta; mitä
 * sille tehdään, on lähteen oma `toiminto`. Siksi ilmoituksen lähetystä ei
 * kirjoiteta tänne — inbox on ainoa kirjoituskohde, ja ulkoinen kanava on
 * myöhemmin oma lukijansa sen päällä.
 */

export function statusKeyFor(lista: WatchList): string {
  return `watch:${lista}`
}

/**
 * Ajaa yhden listan.
 *
 * Yhden lähteen kaatuminen ei vie muita mukanaan (`allSettled`), ja
 * kaatuneet raportoidaan nimeltä — sama periaate kuin kanavahaussa. Yhden
 * listan kaatuminen ei vie toista, koska listat ovat eri cron-töitä.
 */
export async function runWatch(lista: WatchList): Promise<WatchResult> {
  const { sources, from } = await sourcesForList(lista)

  if (sources.length === 0) {
    // Ei aktiivisia lähteitä. Tämä on eri asia kuin rikki lähdelista, jonka
    // sources.ts on jo raportoinut — tässä lista on ehjä mutta tyhjä.
    console.warn(`[watch] ${lista}: ei aktiivisia lähteitä (lista: ${from})`)
    await writeAttempt(statusKeyFor(lista), { ok: 0, failed: [] })
    return { lista, ok: 0, failed: [], uusia: 0, inboxiin: 0, sourcesFrom: from }
  }

  const settled = await Promise.allSettled(sources.map(s => fetchWatchFeed(s)))

  const items: WatchItem[] = []
  const failed: string[] = []
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      items.push(...result.value)
    } else {
      failed.push(sources[i].nimi)
      console.error(`[watch] ${lista}: lähde epäonnistui ${sources[i].nimi}`, result.reason)
    }
  })

  const ok = sources.length - failed.length
  await writeAttempt(statusKeyFor(lista), { ok, failed })

  // Kaikkien lähteiden kaatuessa ei merkitä mitään nähdyksi. Muuten katkos
  // söisi uutuudet: tunnisteita ei tullut, ja seuraavalla kierroksella ne
  // näyttäisivät vanhoilta vasta jos ne olisi ehditty merkitä. Tyhjä ajo on
  // turvallisin jättää kokonaan väliin.
  if (ok === 0) {
    console.error(`[watch] ${lista}: haku rikki — yksikään ${sources.length} lähteestä ei vastannut`)
    return { lista, ok: 0, failed, uusia: 0, inboxiin: 0, sourcesFrom: from }
  }

  const uudetIdt = await diffAndMark(lista, items.map(i => i.id))
  const uudet = items.filter(i => uudetIdt.includes(i.id))

  // Toiminto on lähdekohtainen, joten inboxiin menevät vain 'ilmoita'-rivit.
  // 'tiivista' on varattu uutisille, jotka siirretään watchin päälle vasta
  // erikseen — niiden oma putki tekee tiivistyksen yhä itse.
  const nimiToiminto = new Map(sources.map(s => [s.nimi, s.toiminto]))
  const ilmoitettavat = uudet.filter(i => nimiToiminto.get(i.source) === 'ilmoita')
  const inboxiin = await addToInbox(ilmoitettavat)

  console.log(
    `[watch] ${lista}: ${ok}/${sources.length} lähdettä, ${items.length} kohdetta, ${uudet.length} uutta, ${inboxiin} inboxiin (lista: ${from})`,
  )

  return { lista, ok, failed, uusia: uudet.length, inboxiin, sourcesFrom: from }
}
