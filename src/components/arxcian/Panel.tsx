import type { ReactNode } from 'react'
import { PanelRefresh } from './PanelRefresh'
import type { PanelFetchState } from '@/lib/arxcian/panelStatus'

/** Paneelin datan hakuaika ja se cron-työ jolla sen saa ajettua uudelleen. */
export type PanelRefreshProps = {
  /** Cron-työn id, tai useampi jos paneelin sisältö syntyy monesta työstä */
  job: string | readonly string[]
  state: PanelFetchState
  /**
   * Minuutteina: tätä vanhempi data haetaan itsestään paneelin auetessa.
   *
   * **Valinnainen tarkoituksella, älä laita tätä joka paneeliin.** Jokainen
   * automaattinen paneeli on yksi ulkoinen haku lisää jokaista hubin avausta
   * kohti, ja hubissa on kuusi virkistettävää paneelia. Kolmella niistä
   * ajovälin mittainen viive on lisäksi *päätetty* eikä siedetty: sään ja
   * rukousaikojen TTL nostettiin ajovälin mittaiseksi 23.8.2026, ja
   * kanavahaku kaatuu YouTuben IP-estoon suunnilleen päivittäin 30 s
   * aikakatkaisulla.
   *
   * RJ-Mob on eri tapaus, ja siksi toistaiseksi ainoa: sen lähde on taulukko
   * jota ihminen muokkaa ja jonka tuloksen hän haluaa nähdä heti perään.
   */
  auto?: number
}

type PanelProps = {
  title: string
  /** Pieni lisätieto otsikkorivin oikeassa reunassa */
  meta?: string
  /** Toiminto otsikkorivin oikeaan reunaan, esim. "+ Lisää uusi". Korvaa metan. */
  action?: ReactNode
  /**
   * Hakuaika ja virkistysnappi otsikkorivin oikeaan reunaan.
   *
   * Ei korvaa metaa eikä actionia vaan asettuu niiden viereen — paneelin oma
   * lisätieto ja datan hakuaika ovat eri asioita, eikä toisen näyttäminen saa
   * piilottaa toista. Jätä pois paneeleista joiden data ei tule ajastetusta
   * hausta; älä keksi työtä jota ei ole.
   */
  refresh?: PanelRefreshProps
  /** Näytetään kun sisältöä ei vielä ole */
  empty?: string
  children?: ReactNode
  className?: string
  /** Porrastettu esiintuloanimaatio, sekunteina */
  delay?: number
}

/**
 * Paneelikehys. Sama kehys käytössä nyt tyhjänä ja myöhemmin
 * oikealla sisällöllä, jotta osioiden lisäys ei muuta ulkoasua.
 *
 * Kaikki hubin paneelit kulkevat tämän läpi, joten ilme muuttuu yhdestä
 * paikasta — HUD-tyylitys tehtiin tänne eikä seitsemään komponenttiin. Sama
 * peruste koskee hakuaikaa ja virkistysnappia: ne ovat `refresh`-propissa
 * yhtenä toteutuksena, ei kahdeksana.
 *
 * Yläreunan valojuova on oma elementtinsä eikä .ax-glassin reunaviiva:
 * se kirkastuu keskeltä ja häipyy päistä, mikä lukeutuu lasin särmän
 * heijastukseksi tasaisen viivan sijaan. Otsikkorivin oikeassa reunassa
 * on joko meta-teksti tai himmeä ••• -merkki, jotta rivi ei jää
 * epätasapainoon silloin kun metatietoa ei ole.
 *
 * **Otsikkorivi rivittyy.** `flex-wrap` on tässä siksi, että virkistyksen
 * virheviesti asettuu omalle rivilleen (`basis-full`) sen sijaan että
 * puristaisi aikaleiman ja metan lukukelvottomaksi kapeassa paneelissa.
 * Meta katkaistaan kolmella pisteellä ja virkistysryhmä on `shrink-0`, joten
 * nappi ja kellonaika pysyvät kokonaisina myös 300 px:n sarakkeessa.
 */
export function Panel({
  title,
  meta,
  action,
  refresh,
  empty,
  children,
  className = '',
  delay = 0,
}: PanelProps) {
  // ••• on täytemerkki tyhjälle oikealle reunalle, ei koriste: se näytetään
  // vain kun rivillä ei ole mitään muuta.
  const tyhjaOikea = !action && !meta && !refresh

  return (
    <section
      className={`ax-rise ax-glass relative overflow-hidden rounded-2xl ${className}`}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ax-accent/45 to-transparent"
      />

      <header className="ax-glass-divide flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-2.5">
        <h2 className="text-[13px] font-light uppercase tracking-[0.1em] text-ax-text">{title}</h2>

        {/* Oikea reuna yhtenä ryhmänä: metatieto ja hakuaika pysyvät vierekkäin
            eivätkä hajaudu rivin päihin justify-betweenin takia. Virkistyksen
            virheviesti rivittyy tämän alle, koska se on ryhmän sisällä
            basis-full. */}
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-2">
          {action ? (
            action
          ) : meta ? (
            <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-wider text-ax-faint">
              {meta}
            </span>
          ) : null}

          {refresh ? (
            <PanelRefresh job={refresh.job} state={refresh.state} auto={refresh.auto} />
          ) : null}

          {tyhjaOikea ? (
            <span aria-hidden="true" className="text-[10px] tracking-[0.3em] text-ax-accent/60">
              •••
            </span>
          ) : null}
        </div>
      </header>

      <div className="p-4">
        {children ?? (
          <p className="py-6 text-center text-[13px] leading-relaxed text-ax-faint">
            {empty ?? 'Ei vielä dataa.'}
          </p>
        )}
      </div>
    </section>
  )
}
