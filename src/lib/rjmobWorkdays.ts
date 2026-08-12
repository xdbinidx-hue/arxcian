/**
 * Myymälän työpäivät: maanantai–lauantai ilman arkipyhiä.
 *
 * Sama laskenta oli kopioituna run rate- ja tavoitteet-sivuille, ja kopiot
 * olivat eri mieltä pyhistä — sivut näyttivät siis eri "kulunut %
 * kuukaudesta" samasta päivästä. Yksi lista, yksi funktio.
 *
 * Sunnuntait rajautuvat pois viikonpäivän perusteella, joten sunnuntaille
 * osuvaa pyhää ei tarvitse listata.
 *
 * Lista korjattiin siirron yhteydessä (todennettu viikonpäivistä):
 * - Pyhäinpäivä on lauantai välillä 31.10.–6.11., eli 2026 se on **31.10.**,
 *   ei 7.11. kuten run rate -sivun listassa luki.
 * - Juhannuspäivä on lauantai välillä 20.–26.6., aatto sitä edeltävä
 *   perjantai. 2025 ne ovat 20.–21.6., eivät 19.–20.6.
 * - Pääsiäislauantai ei ole Suomessa arkipyhä eivätkä myymälät ole kiinni,
 *   joten se ei vähennä työpäivää. Poistettu kaikilta vuosilta.
 */

/** Arkipyhät muodossa "vuosi-kuukausi-päivä", ilman etunollia. */
const PYHAT: Record<string, boolean> = {
  // 2025
  '2025-1-1': true, '2025-1-6': true, '2025-4-18': true, '2025-4-21': true,
  '2025-5-1': true, '2025-5-29': true, '2025-6-20': true, '2025-6-21': true,
  '2025-11-1': true, '2025-12-6': true, '2025-12-24': true, '2025-12-25': true,
  '2025-12-26': true,
  // 2026
  '2026-1-1': true, '2026-1-6': true, '2026-4-3': true, '2026-4-6': true,
  '2026-5-1': true, '2026-5-14': true, '2026-6-19': true, '2026-6-20': true,
  '2026-10-31': true, '2026-12-6': true, '2026-12-24': true, '2026-12-25': true,
  '2026-12-26': true,
  // 2027
  '2027-1-1': true, '2027-1-6': true, '2027-3-26': true, '2027-3-29': true,
  '2027-5-1': true, '2027-5-6': true, '2027-6-25': true, '2027-6-26': true,
  '2027-11-6': true, '2027-12-6': true, '2027-12-24': true, '2027-12-25': true,
  '2027-12-26': true,
}

/**
 * Työpäivien määrä kuukaudessa, tai kuukauden alusta `loppuPaiva`an asti.
 * `kuukausi` on 1-pohjainen (1 = tammikuu).
 */
export function laskeTyopaivat(vuosi: number, kuukausi: number, loppuPaiva?: number): number {
  const paiviaKuukaudessa = new Date(vuosi, kuukausi, 0).getDate()
  const loppu = loppuPaiva ?? paiviaKuukaudessa
  let count = 0
  for (let p = 1; p <= loppu; p++) {
    const viikonpaiva = new Date(vuosi, kuukausi - 1, p).getDay() // 0 = sunnuntai
    if (viikonpaiva !== 0 && !PYHAT[`${vuosi}-${kuukausi}-${p}`]) count++
  }
  return count
}

export type TyopaivaTilanne = {
  vuosi: number
  kuukausi: number
  paiva: number
  paiviaKuukaudessa: number
  tyopaiviaKulunut: number
  tyopaiviaYhteensa: number
  /** Kuinka suuri osa kuukauden työpäivistä on takana, prosentteina. */
  kulunutPct: number
}

/**
 * Kuukauden tilanne yhtenä oliona. Run rate -laskenta tarvitsee aina saman
 * neljän luvun ryppään, ja se laskettiin ennen erikseen joka sivulla.
 */
export function tyopaivaTilanne(now: Date = new Date()): TyopaivaTilanne {
  const vuosi = now.getFullYear()
  const kuukausi = now.getMonth() + 1
  const paiva = now.getDate()
  const tyopaiviaKulunut = laskeTyopaivat(vuosi, kuukausi, paiva)
  const tyopaiviaYhteensa = laskeTyopaivat(vuosi, kuukausi)

  return {
    vuosi,
    kuukausi,
    paiva,
    paiviaKuukaudessa: new Date(vuosi, kuukausi, 0).getDate(),
    tyopaiviaKulunut,
    tyopaiviaYhteensa,
    kulunutPct: tyopaiviaYhteensa > 0 ? (tyopaiviaKulunut / tyopaiviaYhteensa) * 100 : 0,
  }
}
