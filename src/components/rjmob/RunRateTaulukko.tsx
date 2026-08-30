'use client'

import { Fragment } from 'react'
import { runRateTaso, type RunRateMittari } from '@/lib/rjmob'

/**
 * Run rate -taulukko: tavoite, toteuma, ennuste ja % tavoitteesta jokaiselle
 * kolmelle mittarille.
 *
 * Yksi komponentti kahdelle sivulle (Myyntiseuranta ja Tavoitteet ja Run
 * Rate) ja kahdelle tasolle (myymälä ja myyjä). Sarakejärjestys on osa
 * määrittelyä eikä tyyliseikka — **Tavoite | Toteuma | Ennuste | %** —, ja
 * kahtena kopiona se ajautuisi erilleen ensimmäisen muutoksen kohdalla.
 *
 * Prosentti on **ennusteen** osuus tavoitteesta, ei toteuman. Vanha
 * "kuukaudesta kulunut %" -vertailu ei siksi ole enää väriraja: ennuste
 * huomioi ajan kulumisen jo itse.
 */

export type RunRateRivi = {
  nimi: string
  /** Rivin oma työpäiväikkuna. Myymälöillä sama kaikilla, myyjillä omansa. */
  ikkuna?: { paattyneet: number; kaikki: number } | null
  liittymat: RunRateMittari
  fsecure: RunRateMittari
  kassakate: RunRateMittari
}

const MITTARIT: { avain: 'liittymat' | 'fsecure' | 'kassakate'; otsikko: string; yksikko: 'kpl' | '€' }[] = [
  { avain: 'liittymat', otsikko: 'Liittymät (kpl)', yksikko: 'kpl' },
  { avain: 'fsecure', otsikko: 'F-Secure (kpl)', yksikko: 'kpl' },
  { avain: 'kassakate', otsikko: 'Kassakate (€, alv 0)', yksikko: '€' },
]

/**
 * Väriportaikko. Tekstiväri on aina tumma myös täytetyssä solussa: kirkas
 * `#eab308` jäisi keltaisen täytön päällä 1,8:1 kontrastiin, ja "rajalla" on
 * juuri se tila johon suurin osa riveistä osuu. Sama valinta kuin
 * teholuvuissa.
 */
const VARIT = {
  hyva: { bg: '#dcfce7', fg: '#3B6D11' },
  rajalla: { bg: '#fef9c3', fg: '#854F0B' },
  heikko: { bg: '#fee2e2', fg: '#A32D2D' },
  tuntematon: { bg: 'transparent', fg: '#bbb' },
}

function fmt(n: number, dec = 0) {
  return n.toLocaleString('fi-FI', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

/** Puuttuva luku on viiva eikä nolla — nolla näyttäisi mitatulta tulokselta. */
function arvo(n: number | null, yksikko: 'kpl' | '€'): string {
  if (n === null) return '–'
  return yksikko === '€' ? `${fmt(n)} €` : fmt(n)
}

const th = {
  padding: '6px 8px', fontSize: 11, fontWeight: 500, color: '#888',
  textAlign: 'right' as const, borderBottom: '1px solid #ddd',
  whiteSpace: 'nowrap' as const, background: '#f8f8f6',
}
const thL = { ...th, textAlign: 'left' as const }
const thRyhma = {
  ...th, textAlign: 'center' as const, borderLeft: '1px solid #e5e5e5',
  fontWeight: 600, color: '#555',
}
const td = {
  padding: '7px 8px', fontSize: 12, textAlign: 'right' as const,
  borderBottom: '0.5px solid #f0f0f0', whiteSpace: 'nowrap' as const,
}
const tdL = { ...td, textAlign: 'left' as const, fontWeight: 500 }
const tot = { ...td, fontWeight: 600, background: '#f8f8f6', borderTop: '1px solid #ddd' }
const totL = { ...tot, textAlign: 'left' as const }

function PctSolu({ pct, pohja }: { pct: number | null; pohja: typeof td }) {
  const v = VARIT[runRateTaso(pct)]
  return (
    <td style={{ ...pohja, background: v.bg, color: v.fg, fontWeight: 600 }}>
      {pct === null ? '–' : `${fmt(pct)} %`}
    </td>
  )
}

function MittariSolut({ m, yksikko, pohja }: { m: RunRateMittari; yksikko: 'kpl' | '€'; pohja: typeof td }) {
  return (
    <>
      <td style={{ ...pohja, color: '#888', borderLeft: '1px solid #e5e5e5' }}>{arvo(m.tavoite, yksikko)}</td>
      <td style={pohja}>{arvo(m.toteuma, yksikko)}</td>
      <td style={{ ...pohja, color: '#185FA5', fontWeight: 500 }}>{arvo(m.ennuste, yksikko)}</td>
      <PctSolu pct={m.pct} pohja={pohja} />
    </>
  )
}

export function RunRateTaulukko({
  otsikko, sarakeOtsikko, rivit, yhteensa, ikkuna, naytaIkkunaSarake = false, tyhjaViesti,
}: {
  otsikko: string
  /** Ensimmäisen sarakkeen otsikko, esim. "Myymälä" tai "Myyjä". */
  sarakeOtsikko: string
  rivit: RunRateRivi[]
  /** Yhteensä-rivi. Jätetään pois kun summa ei ole mielekäs. */
  yhteensa?: Omit<RunRateRivi, 'nimi' | 'ikkuna'> | null
  /** Taulukon tason työpäiväikkuna otsikkoriville. */
  ikkuna: { paattyneet: number; kaikki: number }
  /** Näytä rivikohtainen työpäiväsarake (myyjätaulukko). */
  naytaIkkunaSarake?: boolean
  /** Näytetään taulukon sijaan kun rivejä ei ole. */
  tyhjaViesti?: string
}) {
  return (
    <div style={{ background: 'white', border: '0.5px solid #eee', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #eee', display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 500, fontSize: 14 }}>{otsikko}</span>
        <span style={{ fontSize: 12, color: '#888' }}>
          {ikkuna.paattyneet}/{ikkuna.kaikki} työpäivää
        </span>
      </div>

      {rivit.length === 0 && tyhjaViesti
        ? <div style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 13 }}>{tyhjaViesti}</div>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thL} rowSpan={2}>{sarakeOtsikko}</th>
                  {naytaIkkunaSarake && <th style={th} rowSpan={2}>Työpäivät</th>}
                  {MITTARIT.map(m => <th key={m.avain} style={thRyhma} colSpan={4}>{m.otsikko}</th>)}
                </tr>
                <tr>
                  {MITTARIT.map(m => (
                    <Fragment key={m.avain}>
                      <th style={{ ...th, borderLeft: '1px solid #e5e5e5' }}>Tavoite</th>
                      <th style={th}>Toteuma</th>
                      <th style={th}>Ennuste</th>
                      <th style={th}>% tavoitteesta</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rivit.map((r, i) => (
                  <tr key={r.nimi} style={{ background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={tdL}>{r.nimi}</td>
                    {naytaIkkunaSarake && (
                      <td style={{ ...td, color: '#888' }}>
                        {r.ikkuna ? `${r.ikkuna.paattyneet}/${r.ikkuna.kaikki}` : '–'}
                      </td>
                    )}
                    {MITTARIT.map(m => (
                      <MittariSolut key={m.avain} m={r[m.avain]} yksikko={m.yksikko} pohja={td} />
                    ))}
                  </tr>
                ))}
                {yhteensa && (
                  <tr>
                    <td style={totL}>Yhteensä</td>
                    {naytaIkkunaSarake && <td style={tot} />}
                    {MITTARIT.map(m => (
                      <MittariSolut key={m.avain} m={yhteensa[m.avain]} yksikko={m.yksikko} pohja={tot} />
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}
