import type { SectionId } from '@/lib/arxcian/nav'
import { SectionIcon } from './icons'
import { Panel } from './Panel'

type Props = {
  id: SectionId
  title: string
  description: string
  vaihe: number
  /** Mitä osioon on tulossa. Näytetään listana kunnes sisältö on rakennettu. */
  tulossa: string[]
}

/** Osion kehys ennen kuin varsinainen sisältö on rakennettu. */
export function SectionPlaceholder({ id, title, description, vaihe, tulossa }: Props) {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="ax-rise flex items-start gap-3 pb-6 pt-2">
        <SectionIcon id={id} className="mt-1 h-6 w-6 shrink-0 text-ax-accent" />
        <div>
          <h1 className="text-2xl font-light tracking-tight text-ax-text">{title}</h1>
          <p className="mt-1 text-[13px] text-ax-dim">{description}</p>
        </div>
      </header>

      <Panel title="Tulossa" meta={`vaihe ${vaihe}`} delay={0.08}>
        <ul className="space-y-2.5">
          {tulossa.map(item => (
            <li key={item} className="flex items-start gap-2.5 text-[13px] text-ax-dim">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ax-accent/60" />
              {item}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
