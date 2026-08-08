import { getWeather, describeWeatherCode } from '@/lib/arxcian/weather'

export async function WeatherWidget() {
  let data
  try {
    data = await getWeather()
  } catch {
    return (
      <div className="rounded-2xl border border-ax-line bg-ax-panel/70 p-4 text-[13px] text-ax-faint">
        Sää ei ole juuri nyt saatavilla.
      </div>
    )
  }

  const { current, location, hourly } = data.data
  const { label, icon } = describeWeatherCode(current.weatherCode)
  const next6h = hourly.slice(0, 6)

  return (
    <div className="rounded-2xl border border-ax-line bg-ax-panel/70 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-ax-faint">{location.name}</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-light text-ax-text">{Math.round(current.temperature)}°</span>
            <span className="text-[12px] text-ax-dim">tuntuu {Math.round(current.apparentTemperature)}°</span>
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl leading-none">{icon}</div>
          <p className="mt-1 text-[11px] text-ax-dim">{label}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 border-t border-ax-line pt-3 text-[11px] text-ax-faint">
        <span>💨 {Math.round(current.windSpeed)} km/h</span>
        <span>💧 {current.precipitation.toFixed(1)} mm</span>
      </div>

      {next6h.length > 0 && (
        <div className="mt-3 flex justify-between gap-1 border-t border-ax-line pt-3">
          {next6h.map(h => (
            <div key={h.time} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-ax-faint">
                {new Date(h.time).toLocaleTimeString('fi-FI', { hour: '2-digit' })}
              </span>
              <span className="font-mono text-[12px] tabular-nums text-ax-dim">{Math.round(h.temperature)}°</span>
              {h.precipitationProbability > 0 && (
                <span className="text-[9px] text-ax-accent">{h.precipitationProbability}%</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
