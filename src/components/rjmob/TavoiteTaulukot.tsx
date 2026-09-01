'use client'

import { runRateTaso, type RunRateMittari } from '@/lib/rjmob'

/**
 * Uusmyynti- ja Kassamyynti-taulukot.
 *
 * Siirretty sellaisenaan Tavoitteet ja Run Rate -sivulta 1.9.2026, kun se
 * välilehti poistettiin ja sen kolme näkymää siirtyivät Myyntiseurantaan.
 * **Lukuja ei laskettu uudelleen** eikä sarakkeita muutettu — komponentti on
 * kuori, ja kassamyynnin ennuste tulee yhä samasta `runRateMittari`sta jota
 * sivu kutsuu, jotta "% tavoitteesta" on yksi kaava eikä kaksi.
 */

/**
 * Rivi `/api/targets`-reitiltä, siirretty sellaisenaan poistetulta Tavoitteet
 * ja Run Rate -sivulta. Kaikkia kenttiä ei lueta täällä — muoto on reitin
 * vastaus kokonaisuudessaan, jotta se pysyy yhtenä tunnistettavana tyyppinä.
 */
export interface TargetRow {
  nimi: string
  liittKpl: number; liittTavoite: number; liittRunrate: number; liittPerPaiva: number
  fsecKpl: number; fsecTavoite: number; fsecRunrate: number
  kassaKate: number; kassaTavoite: number; kassaRunrate: number
  kassaMyynti: number; kassaPalautus: number; kassaAlennus: number; kassaKuitit: number; kassaPerPaiva: number
  paivat: number; liittEur: number
  dnaUusmyynti: number; elisaUusmyynti: number; teliaUusmyynti: number
  uusmyyntiYhteensa: number; uusmyyntiPerPaiva: number; uusmyyntiRunrate: number
}

function fmt(n: number, dec = 0) {
  return n.toLocaleString('fi-FI', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

/**
 * % tavoitteesta -solu. Portaikko tulee jaettuna `runRateTaso`sta, jotta se
 * on sama luku samalla värillä myös run rate -taulukoissa ja hubissa.
 */
const RUNRATE_VARIT = {
  hyva: { bg: '#dcfce7', fg: '#3B6D11' },
  rajalla: { bg: '#fef9c3', fg: '#854F0B' },
  heikko: { bg: '#fee2e2', fg: '#A32D2D' },
  tuntematon: { bg: 'transparent', fg: '#bbb' },
}

function PctCell({ pct }: { pct: number | null }) {
  const v = RUNRATE_VARIT[runRateTaso(pct)]
  return (
    <td style={{padding:'8px 10px', textAlign:'center', background: v.bg, color: v.fg, fontWeight:600, fontSize:13}}>
      {pct === null ? '–' : `${fmt(pct)} %`}
    </td>
  )
}

const th = {padding:'8px 10px', fontSize:11, fontWeight:500, color:'#888', textAlign:'center' as const, borderBottom:'0.5px solid #eee', whiteSpace:'nowrap' as const, background:'#f8f8f8'}
const thL = {...th, textAlign:'left' as const}
const td = {padding:'8px 10px', fontSize:13, textAlign:'center' as const, borderBottom:'0.5px solid #f5f5f5'}
const tdL = {...td, textAlign:'left' as const, fontWeight:500}
const tot = {...td, fontWeight:600, background:'#f8f8f6', borderTop:'1px solid #ddd'}
const totL = {...tot, textAlign:'left' as const}

function Kehys({ otsikko, children }: { otsikko: string; children: React.ReactNode }) {
  return (
    <div style={{background:'white', border:'0.5px solid #eee', borderRadius:12, overflow:'hidden'}}>
      <div style={{padding:'12px 16px', borderBottom:'0.5px solid #eee'}}>
        <span style={{fontWeight:500, fontSize:14}}>{otsikko}</span>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%', borderCollapse:'collapse'}}>{children}</table>
      </div>
    </div>
  )
}

export function UusmyyntiTaulukko({ rivit, kuukausi }: { rivit: TargetRow[]; kuukausi: string }) {
  const totals = rivit.reduce((acc, r) => ({
    dna: acc.dna + r.dnaUusmyynti,
    elisa: acc.elisa + r.elisaUusmyynti,
    telia: acc.telia + r.teliaUusmyynti,
    yhteensa: acc.yhteensa + r.uusmyyntiYhteensa,
  }), { dna:0, elisa:0, telia:0, yhteensa:0 })

  return (
    <Kehys otsikko={`Uusmyynti — ${kuukausi}`}>
      <thead>
        <tr>
          <th style={thL}>Myyjä</th>
          <th style={th}>DNA</th>
          <th style={th}>Elisa</th>
          <th style={th}>Telia</th>
          <th style={th}>Uusmyynti yhteensä</th>
          <th style={th}>Liittymä / päivä</th>
        </tr>
      </thead>
      <tbody>
        {rivit.map((r, i) => (
          <tr key={r.nimi} style={{background: i % 2 === 0 ? 'white' : '#fafafa'}}>
            <td style={tdL}>{r.nimi}</td>
            <td style={td}>{fmt(r.dnaUusmyynti)}</td>
            <td style={td}>{fmt(r.elisaUusmyynti)}</td>
            <td style={td}>{fmt(r.teliaUusmyynti)}</td>
            <td style={{...td, fontWeight:500}}>{fmt(r.uusmyyntiYhteensa)}</td>
            <td style={{...td, color:'#185FA5', fontWeight:500}}>{fmt(r.uusmyyntiPerPaiva, 2)}</td>
          </tr>
        ))}
        <tr>
          <td style={totL}>Yhteensä</td>
          <td style={tot}>{fmt(totals.dna)}</td>
          <td style={tot}>{fmt(totals.elisa)}</td>
          <td style={tot}>{fmt(totals.telia)}</td>
          <td style={tot}>{fmt(totals.yhteensa)}</td>
          <td style={tot}></td>
        </tr>
      </tbody>
    </Kehys>
  )
}

/**
 * Kassamyynti myyjittäin. Tavoite, ennuste ja % tulevat `rr`-funktiolta,
 * jonka sivu rakentaa run raten työpäiväikkunoista — laskenta ei siis ole
 * täällä eikä sitä ole kahdessa paikassa.
 */
export function KassamyyntiTaulukko({ rivit, kuukausi, rr, rrYhteensa }: {
  rivit: TargetRow[]
  kuukausi: string
  rr: (r: TargetRow) => RunRateMittari
  rrYhteensa: RunRateMittari
}) {
  const totals = rivit.reduce((acc, r) => ({
    myynti: acc.myynti + r.kassaMyynti,
    palautus: acc.palautus + r.kassaPalautus,
    alennus: acc.alennus + r.kassaAlennus,
    kuitit: acc.kuitit + r.kassaKuitit,
    kate: acc.kate + r.kassaKate,
  }), { myynti:0, palautus:0, alennus:0, kuitit:0, kate:0 })

  return (
    <Kehys otsikko={`Kassamyynti — ${kuukausi}`}>
      <thead>
        <tr>
          <th style={thL}>Myyjä</th>
          <th style={th}>Myynti</th>
          <th style={th}>Palautus</th>
          <th style={th}>Alennus</th>
          <th style={th}>Kuitit</th>
          <th style={th}>Kassakate</th>
          <th style={th}>Kassa tavoite</th>
          <th style={th}>Kassa / päivä</th>
          <th style={th}>Ennuste</th>
          <th style={th}>% tavoitteesta</th>
        </tr>
      </thead>
      <tbody>
        {rivit.map((r, i) => {
          const m = rr(r)
          return (
            <tr key={r.nimi} style={{background: i % 2 === 0 ? 'white' : '#fafafa'}}>
              <td style={tdL}>{r.nimi}</td>
              <td style={td}>{fmt(r.kassaMyynti)} €</td>
              <td style={{...td, color:'#A32D2D'}}>{fmt(r.kassaPalautus)} €</td>
              <td style={{...td, color:'#A32D2D'}}>{fmt(r.kassaAlennus)} €</td>
              <td style={{...td, color:'#888'}}>{fmt(r.kassaKuitit)}</td>
              <td style={{...td, fontWeight:500}}>{fmt(r.kassaKate)} €</td>
              <td style={{...td, color:'#888'}}>{m.tavoite === null ? '–' : `${fmt(m.tavoite)} €`}</td>
              <td style={{...td, color:'#185FA5', fontWeight:500}}>{fmt(r.kassaPerPaiva, 2)} €</td>
              <td style={{...td, color:'#185FA5', fontWeight:500}}>{m.ennuste === null ? '–' : `${fmt(m.ennuste)} €`}</td>
              <PctCell pct={m.pct} />
            </tr>
          )
        })}
        <tr>
          <td style={totL}>Yhteensä</td>
          <td style={tot}>{fmt(totals.myynti)} €</td>
          <td style={{...tot, color:'#A32D2D'}}>{fmt(totals.palautus)} €</td>
          <td style={{...tot, color:'#A32D2D'}}>{fmt(totals.alennus)} €</td>
          <td style={{...tot, color:'#888'}}>{fmt(totals.kuitit)}</td>
          <td style={tot}>{fmt(totals.kate)} €</td>
          <td style={{...tot, color:'#888'}}>{rrYhteensa.tavoite === null ? '–' : `${fmt(rrYhteensa.tavoite)} €`}</td>
          <td style={tot}></td>
          <td style={{...tot, color:'#185FA5'}}>{rrYhteensa.ennuste === null ? '–' : `${fmt(rrYhteensa.ennuste)} €`}</td>
          <PctCell pct={rrYhteensa.pct} />
        </tr>
      </tbody>
    </Kehys>
  )
}
