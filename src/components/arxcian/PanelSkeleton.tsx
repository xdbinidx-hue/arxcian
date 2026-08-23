import { Panel } from './Panel'

/**
 * Paneelin latausasu Suspense-rajan `fallback`iksi.
 *
 * Sama `Panel`-kehys kuin oikealla sisällöllä, jotta paneeli ei hyppää
 * paikaltaan kun data saapuu — vain sisältö vaihtuu. Otsikko annetaan, koska
 * hubin ruudukko on tuttu ja tyhjä laatikko ilman otsikkoa on hetken
 * tunnistamaton.
 *
 * **Miksi hubin paneelit ovat Suspensen takana.** Sivu on `force-dynamic` ja
 * jokainen paneeli on oma `async`-komponenttinsa, joten ilman rajaa koko sivu
 * odottaa hitainta niistä. Se ei ole teoreettista: KANAVAT-paneelin
 * aikakatkaisu on 30 s ja YouTube estää Vercelin konesali-IP:n suunnilleen
 * päivittäin, jolloin yksi lähde jumitti koko komentokeskuksen. Oma raja per
 * paneeli tarkoittaa että hitaan lähteen viive maksaa vain sen paneelin.
 */
export function PanelSkeleton({ title, delay }: { title: string; delay?: number }) {
  return (
    <Panel title={title} delay={delay}>
      <div className="space-y-2" aria-hidden="true">
        <div className="ax-pulse h-3 w-2/3 rounded bg-ax-line/25" />
        <div className="ax-pulse h-3 w-1/2 rounded bg-ax-line/20" />
        <div className="ax-pulse h-3 w-5/6 rounded bg-ax-line/15" />
      </div>
      <span className="sr-only">Haetaan…</span>
    </Panel>
  )
}
