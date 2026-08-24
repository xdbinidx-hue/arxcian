import Link from 'next/link'
import { Panel } from '@/components/arxcian/Panel'
import { readCached } from '@/lib/arxcian/cache'
import { RJMOB_SUMMARY_KEY, type RjMobSummaryData } from '@/lib/arxcian/rjmobSummary'
import { panelFetchState } from '@/lib/arxcian/panelStatus'
import { UI_REFRESH_JOBS } from '@/lib/arxcian/cronAccess'

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

/**
 * Minuutteina: tätä vanhemmat luvut haetaan itsestään kun paneeli avataan.
 *
 * Cron ajaa neljästi vuorokaudessa (8, 12, 16, 20), joten pelkän cronin
 * varassa juuri kirjattu myyntiseuranta näkyy hubissa vasta enimmillään
 * neljän tunnin päästä. Se oli oikea suunnittelu — sivulataus ei saa odottaa
 * Sheetsiä — mutta väärä oletus siitä milloin lukua katsotaan: taulukkoon
 * kirjannut ihminen katsoo hubia heti perään.
 *
 * 15 min on kompromissi kahden kustannuksen välillä. `rjmob-summary` on noin
 * viisi sekuntia ja kymmenkunta Sheets-kutsua, joten sitä ei voi ajaa joka
 * sivulatauksella; toisaalta vartin vanha luku ei ehdi olla väärässä siitä
 * mitä kuukaudesta on kertynyt. Sama luku toimii jäähynä, ks. PanelRefresh.
 */
const AUTO_MINUUTIT = 15

type Metric = {
  key: keyof RjMobSummaryData['metrics']
  label: string
  icon: string
}

/**
 * Tavoiteprosentin väri, tavoitteet_ja_runrate_ohjeen portaat: yli 80 vihreä,
 * 60–79 keltainen, 50–59 oranssi, alle 50 punainen.
 *
 * Arxcianin paletissa ei ole erillistä oranssia — se on tarkoituksella tiukka
 * ja kaikki värit tulevat `.arxcian-root`in muuttujista. Kaksi keskimmäistä
 * porrasta erotetaan siksi saman keltaisen kirkkaudella eikä uudella sävyllä.
 */
function targetColor(pct: number): string {
  if (pct >= 80) return 'text-ax-up'
  if (pct >= 60) return 'text-ax-warn'
  if (pct >= 50) return 'text-ax-warn/70'
  return 'text-ax-down'
}

const METRICS: readonly Metric[] = [
  { key: 'liittymat', label: 'Liittymät', icon: '▣' },
  { key: 'fsecure', label: 'F-Secure', icon: '◇' },
  { key: 'kassakate', label: 'Kassakate', icon: '€' },
]

export async function RjMobSummary({ delay }: { delay?: number }) {
  const cached = await readCached<RjMobSummaryData>(RJMOB_SUMMARY_KEY)
  const data = cached?.data

  // Hakuaika näkyviin: juuri tämä paneeli näytti 19.8.2026 vanhoja lukuja
  // päivitetystä taulukosta kertomatta siitä mitään.
  const status = await panelFetchState(RJMOB_SUMMARY_KEY, cached?.fetchedAt)

  return (
    <Panel
      title="RJ-Mob"
      meta={data?.monthLabel}
      refresh={{ job: UI_REFRESH_JOBS.rjmob, state: status, auto: AUTO_MINUUTIT }}
      delay={delay}
      empty="Kuukauden luvut haetaan seuraavassa ajastetussa ajossa."
    >
      {data ? (
        <>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ax-faint">
            Tämän kuun myyntiseuranta
          </p>

          {/* Ennusteen peruste näkyy paneelissa eikä pelkästään koodin
              kommentissa: "1157 kpl kuun loppuun" on pelkkä väite, jos
              lukija ei näe montako työpäivää sen takana on. */}
          {data.workdays && data.workdays.total > 0 && (
            <p className="mb-3 text-[11px] leading-snug text-ax-faint">
              {data.workdays.elapsed}/{data.workdays.total} työpäivää tehty.
              Ennuste kertoo mihin nykyisellä tahdilla päästään kuun loppuun.
            </p>
          )}

          <div className="divide-y divide-ax-line/10">
            {METRICS.map(metric => {
              const value = data.metrics[metric.key]

              return (
                <div key={metric.key} className="grid grid-cols-[34px_1fr_auto] gap-3 py-3">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-ax-accent/25 text-[13px] text-ax-accent"
                  >
                    {metric.icon}
                  </span>

                  <span>
                    <span className="block text-[11px] uppercase tracking-wide text-ax-faint">
                      {metric.label}
                    </span>
                    <span className="block whitespace-nowrap text-xl font-light tabular-nums text-ax-text">
                      {value.display}
                    </span>
                    {/* Tarkentava luku puuttuu vanhasta välimuistimerkinnästä,
                        joten rivi on rakennettava toimimaan ilman sitä.
                        Sama koko, paino ja väri kuin pääluvulla — provisio on
                        luku jota luetaan, ei alaviite. */}
                    {value.sub && (
                      <span className="block whitespace-nowrap text-xl font-light tabular-nums text-ax-text">
                        {value.sub}
                      </span>
                    )}
                  </span>

                  <span className="self-center text-right">
                    {value.runRate ? (
                      <>
                        <span className="block whitespace-nowrap text-lg font-light tabular-nums text-ax-accent">
                          {value.runRate}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-ax-faint">
                          kuun loppuun
                        </span>
                        {/* Prosentti vertaa **ennustetta** tavoitteeseen, kun
                            tavoitteet-sivun oma RR% vertaa toteumaa. Kaksi eri
                            kysymystä, joten kumpikin luku on oikein omassa
                            paikassaan — siksi selite sanoo "ennuste yltää". */}
                        {/* Rivit pidetään lyhyinä: paneeli on noin 200 px
                            leveä, ja pitkä selite levittää tämän sarakkeen
                            niin että vasemman puolen luku rivittyy ("648" /
                            "kpl"). Korkeutta on varaa, leveyttä ei. */}
                        {value.targetPercent !== null && value.targetPercent !== undefined && (
                          <>
                            <span
                              className={`mt-2 block text-[15px] font-medium tabular-nums ${targetColor(value.targetPercent)}`}
                            >
                              {value.targetPercent.toFixed(0)} % tavoitteesta
                            </span>
                            {value.target && (
                              <span className="block text-[10px] text-ax-faint">
                                tavoite {value.target}
                              </span>
                            )}
                          </>
                        )}
                      </>
                    ) : (
                      <span className="block text-[11px] text-ax-faint">—</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>

          <Link
            href="/arxcian/rj-mob/tuotto"
            className="mt-3 inline-block text-[12px] text-ax-faint transition-colors hover:text-ax-accent"
          >
            Koko tuottoseuranta →
          </Link>
        </>
      ) : null}
    </Panel>
  )
}
