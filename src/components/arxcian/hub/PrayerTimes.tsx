import {
  getPrayerTimes,
  nextPrayer,
  PRAYERS,
  PRAYER_CACHE_KEY,
  type PrayerDay,
} from '@/lib/arxcian/prayer'
import { todayISOHelsinki, nowMinutesHelsinki } from '@/lib/arxcian/time'
import { panelFetchState, TUNTEMATON, type PanelFetchState } from '@/lib/arxcian/panelStatus'
import { UI_REFRESH_JOBS } from '@/lib/arxcian/cronAccess'
import { Panel } from '@/components/arxcian/Panel'

/**
 * RUKOUSAJAT: päivän viisi rukousta Helsingin aikaan, maapallon alla.
 *
 * Vaakarivi eikä lista: viisi kellonaikaa mahtuu yhdelle riville kartan
 * levyisessä sarakkeessa, ja seuraava rukous erottuu silloin yhdellä
 * silmäyksellä ilman että paneeli vie pystytilaa maapallolta.
 *
 * Seuraavaa rukousta ei näytetä laskurina vaan korostuksena. Palvelimella
 * renderöity "2 h 14 min" jäätyisi siihen hetkeen jolloin sivu ladattiin ja
 * valehtelisi sitä pidempään mitä kauemmin välilehti on auki.
 */
export async function PrayerTimes({ delay }: { delay?: number }) {
  let days: PrayerDay[]
  let status: PanelFetchState = TUNTEMATON
  try {
    const cached = await getPrayerTimes()
    days = cached.data
    status = await panelFetchState(PRAYER_CACHE_KEY, cached.fetchedAt)
  } catch (e) {
    // getPrayerTimes heittää vain jos haku kaatuu EIKÄ välimuistissa ole
    // mitään. Hub-sivu ei saa kaatua siihen.
    console.error('[hub] rukousaikojen haku epäonnistui', e)
    return (
      <Panel
        title="Rukousajat"
        delay={delay}
        refresh={{ job: UI_REFRESH_JOBS.rukousajat, state: await panelFetchState(PRAYER_CACHE_KEY) }}
        empty="Rukousaikoja ei saatu haettua. Seuraava ajastettu haku yrittää uudelleen."
      />
    )
  }

  const today = todayISOHelsinki()
  const day = days.find(d => d.date === today)
  const next = nextPrayer(days, today, nowMinutesHelsinki())

  return (
    <Panel
      title="Rukousajat"
      meta={day?.hijri || 'Helsinki'}
      refresh={{ job: UI_REFRESH_JOBS.rukousajat, state: status }}
      delay={delay}
      empty="Ei aikoja tälle päivälle — seuraava ajastettu haku yrittää uudelleen."
    >
      {/* Yksi ainoa lapsilauseke, ei kahta peräkkäistä: Panel näyttää
          empty-tekstin vain kun children on nullish, ja kahdesta lapsesta
          syntyisi taulukko joka on aina totuusarvoltaan tosi — tyhjä tila
          jäisi kokonaan näyttämättä. */}
      {day ? (
        <>
        <div className="grid grid-cols-5 gap-2">
          {PRAYERS.map(prayer => {
            const isNext = next?.tomorrow === false && next.key === prayer.key
            return (
              <div
                key={prayer.key}
                className={`rounded-xl px-2 py-2 text-center transition-colors ${
                  isNext ? 'bg-ax-accent/10 ring-1 ring-inset ring-ax-accent/35' : ''
                }`}
              >
                <p
                  className={`font-mono text-[9px] uppercase tracking-[0.14em] ${
                    isNext ? 'text-ax-accent' : 'text-ax-faint'
                  }`}
                >
                  {prayer.label}
                </p>
                <p
                  className={`mt-1 font-mono text-[15px] tabular-nums ${
                    isNext ? 'text-ax-text' : 'text-ax-dim'
                  }`}
                >
                  {day.timings[prayer.key]}
                </p>
                <p className="mt-0.5 truncate text-[9px] text-ax-faint">{prayer.gloss}</p>
              </div>
            )
          })}
        </div>

        {next ? (
          <p className="mt-2 text-center text-[10px] text-ax-faint">
            {next.tomorrow
              ? `Päivän rukoukset ohi — huomenna Fajr ${next.time}`
              : `Seuraava: ${next.key} ${next.time}`}
          </p>
        ) : null}
        </>
      ) : null}
    </Panel>
  )
}
