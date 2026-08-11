/**
 * Rengasmittari. Kehä piirretään conic-gradientilla ja keskus kaiverretaan
 * pois maskilla — kaksi sisäkkäistä ympyrää olisi vaatinut taustavärin
 * arvaamista, ja lasipaneelin päällä se olisi näkynyt väärän värisenä
 * kiekkona. Maski jättää taustan aidosti läpi.
 *
 * Arvo pyöristetään ja rajataan 0–100:aan tässä eikä kutsujassa, jotta
 * yksikään kutsupaikka ei voi piirtää kehää yli täyden.
 */
export function ProgressRing({ value }: { value: number }) {
  const percent = Math.max(0, Math.min(100, Math.round(value)))

  return (
    <div
      role="img"
      aria-label={`${percent} prosenttia`}
      className="relative flex h-28 w-28 items-center justify-center rounded-full border border-ax-line/20 bg-black/20 shadow-[0_0_30px_rgb(var(--ax-accent)/0.08)]"
    >
      <div
        aria-hidden="true"
        className="absolute inset-2 rounded-full"
        style={{
          background: `conic-gradient(rgb(var(--ax-accent)) ${percent}%, rgb(var(--ax-accent) / 0.1) ${percent}% 100%)`,
          mask: 'radial-gradient(circle, transparent 56%, black 57%)',
          WebkitMask: 'radial-gradient(circle, transparent 56%, black 57%)',
        }}
      />
      <span className="text-2xl font-light tabular-nums text-ax-text">{percent}%</span>
    </div>
  )
}
