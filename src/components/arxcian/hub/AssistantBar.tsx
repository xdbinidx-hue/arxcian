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
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-end gap-3">
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
    <div aria-hidden="true" className="relative hidden h-[105px] w-[90px] md:block">
      <div className="absolute bottom-0 left-1/2 h-6 w-20 -translate-x-1/2 rounded-[50%] border border-ax-accent/30 shadow-[0_0_18px_rgb(var(--ax-accent)/0.2)]" />

      <div className="absolute bottom-3 left-1/2 h-[78px] w-[58px] -translate-x-1/2 rounded-[48%_48%_40%_45%] border border-ax-accent/35 bg-ax-accent/[0.025] shadow-[inset_0_0_20px_rgb(var(--ax-accent)/0.08),0_0_18px_rgb(var(--ax-accent)/0.12)] backdrop-blur-sm">
        <div className="ax-pulse absolute left-[20%] top-[37%] h-1.5 w-1.5 rounded-full bg-ax-accent shadow-[0_0_8px_rgb(var(--ax-accent)/1)]" />
        <div className="ax-pulse absolute right-[20%] top-[37%] h-1.5 w-1.5 rounded-full bg-ax-accent shadow-[0_0_8px_rgb(var(--ax-accent)/1)]" />

        <div className="absolute left-1/2 top-[52%] h-[18%] w-px -translate-x-1/2 rotate-6 bg-ax-accent/30" />
        <div className="absolute bottom-[22%] left-1/2 h-px w-[28%] -translate-x-1/2 bg-ax-accent/40" />
        <div className="absolute inset-[11%] rounded-[50%] border border-dashed border-ax-accent/20" />
      </div>
    </div>
  )
}
