import {
  getWeather,
  describeWeatherCode,
  pickSunDay,
  sunClock,
  daylightLabel,
  WEATHER_CACHE_KEY,
} from '@/lib/arxcian/weather'
import { todayISOHelsinki, nowMinutesHelsinki, clockToMinutes } from '@/lib/arxcian/time'
import { panelFetchState } from '@/lib/arxcian/panelStatus'
import { UI_REFRESH_JOBS } from '@/lib/arxcian/cronAccess'
import { Panel } from '@/components/arxcian/Panel'

/**
 * SÄÄ & AURINKO: Helsingin nykysää ja päivän valojakso samassa paneelissa.
 *
 * Uutiset-sivun WeatherWidget on tarkoituksella erillinen komponentti eikä
 * tätä jaeta sen kanssa: siellä on tilaa kuuden tunnin ennusteelle, tässä
 * hubin kapeassa sarakkeessa ei. Sama data, eri tiiviys.
 *
 * Aurinkopalkki näyttää missä kohtaa päivää ollaan. Yöllä palkkia ei
 * piirretä lainkaan — nollassa tai täydessä se väittäisi jotain päivästä
 * joka ei ole käynnissä.
 */
export async function SunWeather({ delay }: { delay?: number }) {
  let cached
  try {
    cached = await getWeather()
  } catch (e) {
    // getWeather heittää vain jos haku kaatuu EIKÄ välimuistissa ole mitään.
    // Virhe lokiin ja virkistysnappi jäljelle: ilman nappia paneeli on
    // umpikuja, ja ilman lokia vian syy katoaa kokonaan.
    console.error('[hub] sään haku epäonnistui', e)
    return (
      <Panel
        title="Sää & aurinko"
        delay={delay}
        refresh={{ job: UI_REFRESH_JOBS.saa, state: await panelFetchState(WEATHER_CACHE_KEY) }}
        empty="Sää ei ole juuri nyt saatavilla. Seuraava ajastettu haku yrittää uudelleen."
      />
    )
  }

  const status = await panelFetchState(WEATHER_CACHE_KEY, cached.fetchedAt)
  const { current, location, daily } = cached.data
  const { label, icon } = describeWeatherCode(current.weatherCode)
  const sun = pickSunDay(daily, todayISOHelsinki())

  const nowMin = nowMinutesHelsinki()
  const riseMin = sun ? clockToMinutes(sunClock(sun.sunrise)) : null
  const setMin = sun ? clockToMinutes(sunClock(sun.sunset)) : null
  const progress =
    riseMin !== null && setMin !== null && setMin > riseMin && nowMin > riseMin && nowMin < setMin
      ? ((nowMin - riseMin) / (setMin - riseMin)) * 100
      : null

  return (
    <Panel
      title="Sää & aurinko"
      meta={location.name}
      refresh={{ job: UI_REFRESH_JOBS.saa, state: status }}
      delay={delay}
    >
      <div className="flex items-center justify-between">
        <p className="flex items-baseline gap-2">
          <span className="text-3xl font-light tabular-nums text-ax-text">
            {Math.round(current.temperature)}°
          </span>
          <span className="text-[11px] text-ax-dim">
            tuntuu {Math.round(current.apparentTemperature)}°
          </span>
        </p>
        <div className="text-right">
          <div className="text-2xl leading-none">{icon}</div>
          <p className="mt-1 text-[10px] text-ax-dim">{label}</p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-4 font-mono text-[10px] text-ax-faint">
        <span>💨 {Math.round(current.windSpeed)} km/h</span>
        <span>💧 {current.precipitation.toFixed(1)} mm</span>
      </div>

      {sun ? (
        <div className="ax-glass-divide mt-3 border-t pt-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-ax-faint">
                Nousu
              </p>
              <p className="mt-0.5 font-mono text-[15px] tabular-nums text-ax-text">
                {sunClock(sun.sunrise)}
              </p>
            </div>

            <p className="pb-0.5 text-[10px] text-ax-dim">{daylightLabel(sun.daylightSeconds)}</p>

            <div className="text-right">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-ax-faint">
                Lasku
              </p>
              <p className="mt-0.5 font-mono text-[15px] tabular-nums text-ax-text">
                {sunClock(sun.sunset)}
              </p>
            </div>
          </div>

          {progress !== null ? (
            <div className="relative mt-2.5 h-px w-full bg-ax-line/20">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-ax-accent/30 to-ax-warn"
                style={{ width: `${progress}%` }}
              />
              <span
                aria-hidden="true"
                className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ax-warn shadow-[0_0_8px_rgb(var(--ax-warn)/0.9)]"
                style={{ left: `${progress}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  )
}
