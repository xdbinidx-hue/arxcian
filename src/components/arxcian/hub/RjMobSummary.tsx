import Link from 'next/link'
import { Panel } from '@/components/arxcian/Panel'
import { readCached } from '@/lib/arxcian/cache'
import { RJMOB_SUMMARY_KEY, type RjMobSummaryData } from '@/lib/arxcian/rjmobSummary'

/**
 * RJ-MOB: kuluvan kuukauden myyntiseuranta kolmena rivinä.
 *
 * Järjestys on myynnin oma järjestys eikä esteettinen valinta: liittymät
 * kappaleina ja provisiona, sitten F-Secure kappaleina, sitten kassakate.
 * Sama pari kuin tuottoseurannan liittymälaatta, jotta hubista ja sivulta
 * luettu luku on sama luku.
 *
 * Luetaan vain välimuistista. RJ-Mobin luvut syntyvät Google Sheetsistä
 * laskentalogiikan läpi (ks. lib/rjmob.ts), eikä hubin sivulataus saa odottaa
 * taulukkohakua — sama sääntö kuin muillakin ulkoisilla lähteillä.
 *
 * Kun avainta ei ole, paneeli kertoo sen suoraan eikä näytä nollia.
 * Nolla on oikea luku vasta kun se on laskettu; keksitty nolla on
 * pahempi kuin tyhjä tila, koska sen erottaminen todellisesta ei onnistu.
 */

type Metric = {
  key: keyof RjMobSummaryData['metrics']
  label: string
  icon: string
}

const METRICS: readonly Metric[] = [
  { key: 'liittymat', label: 'Liittymät', icon: '▣' },
  { key: 'fsecure', label: 'F-Secure', icon: '◇' },
  { key: 'kassakate', label: 'Kassakate', icon: '€' },
]

export async function RjMobSummary({ delay }: { delay?: number }) {
  const cached = await readCached<RjMobSummaryData>(RJMOB_SUMMARY_KEY)
  const data = cached?.data

  return (
    <Panel
      title="RJ-Mob"
      meta={data?.monthLabel}
      delay={delay}
      empty="Kuukauden luvut haetaan seuraavassa ajastetussa ajossa."
    >
      {data ? (
        <>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-ax-faint">
            Tämän kuun myyntiseuranta
          </p>

          {/* Ennusteen merkintä on paneelissa eikä pelkästään koodin
              kommentissa: nuoli ja prosentti näyttäisivät muuten toteumalta,
              vaikka ne vertaavat kuukauden loppuun projisoitua lukua. */}
          {data.projected && (
            <p className="mb-2 text-[9px] leading-snug text-ax-faint">
              Muutos vertaa kuukauden loppuun projisoitua ennustetta edelliseen
              kuukauteen. Isot luvut ovat toteutunut kertymä.
            </p>
          )}

          <div className="divide-y divide-ax-line/10">
            {METRICS.map(metric => {
              const value = data.metrics[metric.key]
              const up = value.changePercent !== null && value.changePercent >= 0

              return (
                <div key={metric.key} className="grid grid-cols-[34px_1fr_auto] gap-3 py-3">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-ax-accent/25 text-[13px] text-ax-accent"
                  >
                    {metric.icon}
                  </span>

                  <span>
                    <span className="block text-[9px] uppercase tracking-wide text-ax-faint">
                      {metric.label}
                    </span>
                    <span className="block text-xl font-light tabular-nums text-ax-text">
                      {value.display}
                    </span>
                    {/* Tarkentava luku puuttuu vanhasta välimuistimerkinnästä,
                        joten rivi on rakennettava toimimaan ilman sitä. */}
                    {value.sub && (
                      <span className="block font-mono text-[10px] tabular-nums text-ax-faint">
                        {value.sub}
                      </span>
                    )}
                  </span>

                  <span className="self-center text-right">
                    {value.changePercent !== null ? (
                      <>
                        <span
                          className={`block font-mono text-[10px] ${up ? 'text-ax-up' : 'text-ax-down'}`}
                        >
                          {up ? '↑' : '↓'} {Math.abs(value.changePercent).toFixed(0)}%
                        </span>
                        <span className="mt-1 block text-[7px] text-ax-faint">
                          vs. ed. kuukausi
                        </span>
                      </>
                    ) : (
                      <span className="block font-mono text-[10px] text-ax-faint">—</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>

          <Link
            href="/arxcian/rj-mob/tuotto"
            className="mt-3 inline-block text-[11px] text-ax-faint transition-colors hover:text-ax-accent"
          >
            Koko tuottoseuranta →
          </Link>
        </>
      ) : null}
    </Panel>
  )
}
