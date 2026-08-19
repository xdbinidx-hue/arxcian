'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { marketEvents, type MarketEvent } from '@/lib/arxcian/trading/marketEvents'
import type { CalendarEvent, NotifySettings, TradingTime } from '@/lib/arxcian/trading/types'
import { playChime, showSystemNotification } from '@/lib/arxcian/notify'

/**
 * Markkinailmoitusten ajastin ja banneripino.
 *
 * Mountataan arxcianin layoutissa eikä Trading-sivulla: ilmoitus markkinan
 * avautumisesta on hyödyllinen nimenomaan silloin kun katse on jossain muualla
 * — hubissa, uutisissa tai RJ-Mobin luvuissa. Trading-sivulle rajattu ajastin
 * ilmoittaisi vain sille joka jo katsoo istuntopaneelia.
 *
 * Asetukset tulevat propseina palvelimelta eikä haeta täältä: layout lukee ne
 * kerran, jolloin sivunvaihto ei tee uutta kutsua. Asetuspaneeli kertoo
 * muutoksesta ikkunatapahtumalla, samalla tavalla kuin komentopaletti
 * avataan — sama kuvio, ei toista tilanhallintatapaa.
 */

export const MARKET_ALERTS_EVENT = 'arxcian:market-alerts-updated'

/**
 * Asetuspaneelin "Testaa" kulkee saman toimituksen läpi kuin oikea tapahtuma.
 * Erillinen testipolku näyttäisi bannerin silloinkin kun oikea ilmoitus ei
 * tulisi perille — eli juuri silloin kun testin pitäisi kertoa se.
 */
export const MARKET_ALERTS_TEST_EVENT = 'arxcian:market-alerts-test'

export type MarketAlertsUpdate = {
  settings: NotifySettings
  times: TradingTime[]
}

/**
 * Kalenteri ei kulje `MarketAlertsUpdate`ssa vaan pelkkänä propsina.
 *
 * Asetuspaneeli voi muuttaa asetuksia ja omia aikoja, muttei kalenteria — se
 * tulee cronin päivittämästä välimuistista ja vaihtuu neljästi vuorokaudessa.
 * Sen liittäminen samaan tapahtumaan tarkoittaisi että paneeli lähettäisi
 * kalenterikopion joka kytkimen napautuksella, tai pahempaa: unohtaisi sen ja
 * tyhjentäisi ajastimen kalenterin.
 */
type Props = MarketAlertsUpdate & { calendar: CalendarEvent[] }

/**
 * Viimeksi toimitetun ilmoituksen hetki. Selaimessa eikä palvelimella, koska
 * kyse on siitä mitä *tämä laite* on jo näyttänyt: sama tapahtuma kuuluu
 * ilmoittaa erikseen puhelimessa ja koneella.
 *
 * Yksi kasvava aikaleima eikä lista avaimista: kaikki tapahtumat tulevat
 * ilmoitushetken järjestyksessä, joten "tätä vanhemmat on jo hoidettu" on
 * täsmälleen sama tieto pienemmässä tilassa eikä vaadi siivousta.
 *
 * Merkki ei ole käyttäjäkohtainen. Jos Albin ja Arbnor käyttävät samaa
 * selainta, toisen istunnossa toimitettu ilmoitus estää saman hetken
 * ilmoituksen toiselle. Se on tietoinen kompromissi: vaihtoehto olisi
 * tallentaa tunnistetietoa selaimeen, mitä muutenkin vältetään.
 */
const MARKER_KEY = 'arxcian:market-alerts-delivered'

/**
 * Kuinka myöhässä ilmoitus vielä annetaan.
 *
 * Nukkunut laite tai suljettu välilehti tarkoittaa että tapahtumia on voinut
 * mennä ohi tunteja sitten. Ne ohitetaan, mutta merkki siirretään silti
 * eteenpäin — muuten ne annettaisiin yhtenä ryppäänä heti kun kone herää,
 * mikä olisi häiritsevää ja väärää tietoa yhtä aikaa.
 */
const CATCHUP_MS = 10 * 60 * 1000

const TICK_MS = 20_000
const BANNER_MS = 45_000

function readMarker(): number | null {
  try {
    const raw = window.localStorage.getItem(MARKER_KEY)
    const value = raw ? Number(raw) : NaN
    return Number.isFinite(value) ? value : null
  } catch {
    // Yksityinen selaustila voi estää localStoragen. Ilmoitukset toimivat
    // silloinkin, kaksoisilmoituksen esto vain rajoittuu tähän istuntoon.
    return null
  }
}

function writeMarker(value: number): void {
  try {
    window.localStorage.setItem(MARKER_KEY, String(value))
  } catch {
    /* ks. readMarker */
  }
}

export function MarketAlerts({
  settings: initialSettings,
  times: initialTimes,
  calendar,
}: Props) {
  const [settings, setSettings] = useState(initialSettings)
  const [times, setTimes] = useState(initialTimes)
  const [banners, setBanners] = useState<MarketEvent[]>([])

  // Ajastin lukee nämä refistä eikä sulkeumasta, jotta intervalli voidaan
  // asettaa kerran: uudelleenluonti joka asetusmuutoksella siirtäisi tikitystä
  // ja voisi hypätä juuri avaushetken yli.
  const settingsRef = useRef(settings)
  const timesRef = useRef(times)
  const calendarRef = useRef(calendar)
  settingsRef.current = settings
  timesRef.current = times
  calendarRef.current = calendar

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<MarketAlertsUpdate>).detail
      if (!detail) return
      setSettings(detail.settings)
      setTimes(detail.times)
    }
    window.addEventListener(MARKET_ALERTS_EVENT, onUpdate)
    return () => window.removeEventListener(MARKET_ALERTS_EVENT, onUpdate)
  }, [])

  const dismiss = useCallback((key: string) => {
    setBanners(current => current.filter(b => b.key !== key))
  }, [])

  /** Yksi toimituspolku sekä ajastimelle että testipainikkeelle. */
  const deliver = useCallback((events: MarketEvent[]) => {
    if (events.length === 0) return

    if (settingsRef.current.banner) {
      setBanners(current => [...events, ...current].slice(0, 4))
    }
    // Yksi ääni vaikka tapahtumia olisi useita: Lontoo ja oma killzone voivat
    // osua samaan minuuttiin, ja kaksi päällekkäistä merkkiääntä kuulostaisi
    // vialta eikä kahdelta ilmoitukselta.
    if (settingsRef.current.sound) {
      playChime()
    }
    if (settingsRef.current.push) {
      for (const event of events) {
        void showSystemNotification({ title: event.title, body: event.body, tag: event.key })
      }
    }
  }, [])

  useEffect(() => {
    const onTest = (event: Event) => {
      const detail = (event as CustomEvent<MarketEvent>).detail
      if (detail) deliver([detail])
    }
    window.addEventListener(MARKET_ALERTS_TEST_EVENT, onTest)
    return () => window.removeEventListener(MARKET_ALERTS_TEST_EVENT, onTest)
  }, [deliver])

  useEffect(() => {
    // Ensimmäisellä käynnistyksellä merkki asetetaan nykyhetkeen: ilman tätä
    // asennuksen jälkeinen ensimmäinen lataus antaisi kaikki kuluneen
    // vuorokauden tapahtumat kerralla.
    if (readMarker() === null) writeMarker(Date.now())

    const tick = () => {
      const now = Date.now()
      const marker = readMarker() ?? now
      const events = marketEvents(now, settingsRef.current, timesRef.current, calendarRef.current)
      const due = events.filter(e => e.notifyAt > marker && e.notifyAt <= now)
      if (due.length === 0) return

      // Merkki siirretään aina viimeisimpään erääntyneeseen, myös ohitettuihin.
      writeMarker(due[due.length - 1].notifyAt)

      deliver(due.filter(e => now - e.notifyAt <= CATCHUP_MS))
    }

    // Heti kerran ja sen jälkeen tasaisin välein: sivulle palaava käyttäjä saa
    // juuri erääntyneen ilmoituksen odottamatta seuraavaa tikkiä.
    tick()
    const timer = setInterval(tick, TICK_MS)

    // Taustavälilehdessä selain hidastaa ajastimet minuuttiin, joten näkyviin
    // palaava välilehti voi olla melkein minuutin jäljessä. Tarkistus
    // heräämisen yhteydessä kuroo sen umpeen.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [deliver])

  useEffect(() => {
    if (banners.length === 0) return
    const timer = setTimeout(() => setBanners(current => current.slice(0, -1)), BANNER_MS)
    return () => clearTimeout(timer)
  }, [banners])

  if (banners.length === 0) return null

  return (
    // Ylänauhan alapuolelle ja sen yläpuolelle pinossa: nauha on z-40, joten
    // banneri jää sen taakse pienemmällä arvolla juuri kapealla näytöllä.
    <div
      className="pointer-events-none fixed right-3 top-[calc(3.25rem+env(safe-area-inset-top))] z-50 flex w-[min(20rem,calc(100vw-1.5rem))] flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {banners.map(event => (
        <article
          key={event.key}
          className="ax-rise ax-glass pointer-events-auto rounded-2xl border border-ax-accent/30 p-3 shadow-[0_0_28px_rgb(var(--ax-accent)/0.14)]"
        >
          <div className="flex items-start gap-2.5">
            <span
              aria-hidden="true"
              className="ax-pulse mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ax-accent"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-snug text-ax-text">{event.title}</p>
              <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-ax-faint">
                {event.body}
              </p>
            </div>
            <button
              onClick={() => dismiss(event.key)}
              aria-label="Sulje ilmoitus"
              className="-mr-1 -mt-1 shrink-0 rounded p-1 text-[13px] leading-none text-ax-faint transition-colors hover:text-ax-text"
            >
              ×
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}
