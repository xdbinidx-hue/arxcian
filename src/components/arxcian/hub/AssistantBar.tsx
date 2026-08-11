'use client'

import { OPEN_PALETTE_EVENT } from '@/components/arxcian/CommandPalette'

/**
 * Hubin alapalkki: digitaalinen pää ja kutsu avustajalle.
 *
 * Tämä ei ole oma hakukenttänsä vaan **painike joka avaa CommandPaletten**.
 * Kaksi erillistä kenttää samalle asialle olisi kahdenlaista tilaa, kaksi
 * eri näppäinkäsittelyä ja kaksi paikkaa jossa kysymys voi olla kesken —
 * eikä käyttäjälle mitään hyötyä. Paletissa on jo haku, assistentti,
 * puheentunnistus ja vastauksen toisto.
 *
 * Ulkoasu jäljittelee tekstikenttää, mutta elementti on button: se kertoo
 * ruudunlukijalle mitä painallus tekee, eikä lupaa kirjoitusmahdollisuutta
 * jota tässä ei ole.
 */
export function AssistantBar({ name }: { name: string }) {
  const open = () => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))

  return (
    // Mobiilissa palkki nostetaan alanavigaation ja mikrofonimerkin yläpuolelle:
    // bottom-4 jäisi kokonaan alapalkin taakse, eikä sitä pystyisi painamaan.
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-end gap-3 lg:bottom-4">
      <RobotHead />

      <button
        type="button"
        onClick={open}
        className="ax-glass pointer-events-auto flex h-12 w-[320px] max-w-[70vw] items-center gap-3 rounded-2xl px-4 text-left transition-colors hover:bg-ax-panel-hi"
      >
        <span aria-hidden="true" className="text-lg text-ax-accent">
          ⌕
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-ax-dim">
          Kerro mitä tarvitset{name ? `, ${name}` : ''}
        </span>
        <kbd className="shrink-0 rounded border border-ax-line px-1.5 py-0.5 font-mono text-[10px] text-ax-faint">
          ⌘K
        </kbd>
      </button>
    </div>
  )
}

/**
 * Digitaalinen pää. Puhdasta CSS:ää: ei kuvatiedostoa, ei kirjastoa — sama
 * periaate kuin ikoneissa (ks. scripts/generate-icons.mjs). Piilotetaan
 * kapealla näytöllä, jossa palkki tarvitsee koko leveyden.
 */
function RobotHead() {
  return (
    <div aria-hidden="true" className="relative hidden h-[128px] w-[104px] md:block">
      {/* Jalusta: kaksi sisäkkäistä ellipsiä, jotta pää näyttää seisovan
          samalla projektorikehällä kuin maapallo sen yläpuolella. */}
      <div className="absolute bottom-0 left-1/2 h-7 w-24 -translate-x-1/2 rounded-[50%] border border-ax-accent/45 shadow-[0_0_22px_rgb(var(--ax-accent)/0.3)]" />
      <div className="absolute bottom-1.5 left-1/2 h-4 w-14 -translate-x-1/2 rounded-[50%] border border-ax-accent/25" />

      <div className="absolute bottom-4 left-1/2 h-[96px] w-[72px] -translate-x-1/2 rounded-[48%_48%_40%_45%] border border-ax-accent/55 bg-ax-accent/[0.05] shadow-[inset_0_0_26px_rgb(var(--ax-accent)/0.16),0_0_28px_rgb(var(--ax-accent)/0.25)] backdrop-blur-sm">
        <span className="ax-pulse absolute left-[20%] top-[37%] h-2 w-2 rounded-full bg-ax-accent shadow-[0_0_10px_rgb(var(--ax-accent)/1),0_0_20px_rgb(var(--ax-accent)/0.6)]" />
        <span className="ax-pulse absolute right-[20%] top-[37%] h-2 w-2 rounded-full bg-ax-accent shadow-[0_0_10px_rgb(var(--ax-accent)/1),0_0_20px_rgb(var(--ax-accent)/0.6)]" />

        <span className="absolute left-1/2 top-[52%] h-[16%] w-px -translate-x-1/2 rotate-6 bg-ax-accent/45" />
        <span className="absolute bottom-[22%] left-1/2 h-px w-[30%] -translate-x-1/2 bg-ax-accent/55" />

        {/* Rautalankaverkko: yksi katkoviivakehä riittää digitaaliseen
            vaikutelmaan. Toinen pystysuora ellipsi teki päästä kypärän. */}
        <span className="absolute inset-[10%] rounded-[50%] border border-dashed border-ax-accent/25" />
      </div>
    </div>
  )
}
