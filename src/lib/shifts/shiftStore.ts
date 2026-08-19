// Työvuorolistan KV-avaimet ja luku.
//
// Nämä ovat omassa moduulissaan eivätkä reittitiedostossa, koska Next
// sallii route.ts:stä vain käsittelijöiden ja tunnettujen asetusten viennin
// — ylimääräinen `export` kaataa tyypityksen käännöksessä.
import { kv } from '@/lib/arxcian/kv'
import type { DayInfo } from '@/lib/shiftSchedule'

/**
 * Luonnos ja vahvistettu lista ovat eri avaimissa.
 *
 * Aiemmin oli vain `shifts:<YYYY-MM>`, johon generointi kirjoitti suoraan —
 * jolloin uudelleengenerointi tuhosi käsin tehdyt korjaukset.
 *
 *   shifts:draft:<YYYY-MM>   generointi kirjoittaa VAIN tänne
 *   shifts:final:<YYYY-MM>   vahvistettu lista, ainoa totuus
 */
export type ShiftTila = 'draft' | 'final'

export const KUUKAUSI_MUOTO = /^\d{4}-\d{2}$/

export function keyFor(tila: ShiftTila, month: string) {
  return `shifts:${tila}:${month}`
}

/** Ennen luonnos/final-jakoa käytetty avain. */
export function legacyKeyFor(month: string) {
  return `shifts:${month}`
}

export function parseTila(arvo: string | null | undefined): ShiftTila | null {
  return arvo === 'draft' || arvo === 'final' ? arvo : null
}

/**
 * Lue lista. Puuttuva `final` täydentyy vanhasta `shifts:<YYYY-MM>`-avaimesta.
 *
 * Migraatio tehdään lukemalla eikä kertaskriptillä, ja **vanhaa avainta ei
 * poisteta**: jos jokin vielä lukee sitä, poisto veisi datan mukanaan.
 */
export async function lueLista(tila: ShiftTila, month: string): Promise<DayInfo[]> {
  const client = kv()
  const days = await client.get<DayInfo[]>(keyFor(tila, month))
  if (days && days.length > 0) return days
  if (tila === 'final') {
    const legacy = await client.get<DayInfo[]>(legacyKeyFor(month))
    if (legacy && legacy.length > 0) return legacy
  }
  return []
}

export async function tallennaLista(tila: ShiftTila, month: string, days: DayInfo[]) {
  await kv().set(keyFor(tila, month), days)
}
