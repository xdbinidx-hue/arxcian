// Palkkakulut myymälöittäin.
//
// ".ts"-päätteiset importit ovat tahallisia: moduuli on yksikkötestattu ja
// Noden ESM-resolveri ei osaa extensiotonta muotoa.
import { myymalaAvaimesta, sivukuluineen, MYYMALAT, type Myymala } from './rjmobBonus.ts'

/**
 * Myyjän kuukausikulu ja se, miten se jakautuu myymälöille.
 *
 * **Kohdistus tehdään tehdyistä tunneista, ei myyjän aluetiedosta.** Myyjät
 * kiertävät myymälöiden välillä ja `myyjat.md`:n alue kertoo vain missä päin
 * hän pääsääntöisesti on — aluepohjainen kohdistus laittaisi koko kuukauden
 * kulun yhdelle myymälälle vaikka tunnit olisivat kolmesta.
 *
 * Jako tehdään **valmiiseen työkuluun** eikä lasketa uudelleen myymälän
 * riveistä. F-Secure-leikkuri katsoo myyjän koko kuukauden F-Secure-määrää,
 * joten myymälä kerrallaan laskettuna leikkuri osuisi väärin: kolmessa
 * myymälässä työskennellyt myyjä voisi alittaa kuuden rajan jokaisessa
 * erikseen vaikka kuukausi ylittää sen.
 */
export type MyyjanKulu = {
  nimi: string
  /** Pohjapalkka ilman sivukuluja (tuntipalkka × palkalliset tunnit). */
  pohjapalkka: number
  provisiot: number
  /** Työkulu sivukuluineen. Omistajilla 0, Krenarilla ilman kerrointa. */
  tyokulu: number
}

export type MyymalanPalkkakulu = {
  myymala: Myymala
  tunnit: number
  pohjapalkka: number
  provisiot: number
  /** Myyjien työkulu sivukuluineen. */
  palkkakulu: number
  /** Päällikköbonus ilman sivukuluja. */
  bonus: number
  bonusKulu: number
  yhteensa: number
}

export type Palkkakulut = {
  myymalat: MyymalanPalkkakulu[]
  /**
   * Työkulu jota ei voitu kohdistaa: myyjällä on kuluja mutta ei tunteja
   * yhdessäkään myymälässä. Näkyy omana rivinään eikä jakaudu tasan — tasajako
   * olisi arvaus, ja arvattu kulu näyttäisi mitatulta.
   */
  kohdistamaton: { nimi: string; tyokulu: number }[]
  yhteensa: number
}

function sentteihin(n: number): number {
  return Math.round(n * 100) / 100
}

export function jaaPalkkakulut(
  myyjat: MyyjanKulu[],
  storeHours: Record<string, Record<string, number>>,
  bonusPerMyymala: Partial<Record<Myymala, number>> = {},
): Palkkakulut {
  // Myyjä -> myymälä -> tunnit. Avaimet normalisoidaan, jotta sama myymälä eri
  // kirjoitusasussa ("Helsinki, Malmi" / "K-Citymarket Malmi") ei jakaudu kahtia.
  const tunnit = new Map<string, Map<Myymala, number>>()
  for (const [avain, myyjatTunnit] of Object.entries(storeHours)) {
    const myymala = myymalaAvaimesta(avain)
    if (!myymala) continue
    for (const [nimi, h] of Object.entries(myyjatTunnit)) {
      if (!(h > 0)) continue
      const rivi = tunnit.get(nimi) ?? new Map<Myymala, number>()
      rivi.set(myymala, (rivi.get(myymala) ?? 0) + h)
      tunnit.set(nimi, rivi)
    }
  }

  const kertyma = new Map<Myymala, { tunnit: number; pohjapalkka: number; provisiot: number; palkkakulu: number }>()
  for (const { myymala } of MYYMALAT) {
    kertyma.set(myymala, { tunnit: 0, pohjapalkka: 0, provisiot: 0, palkkakulu: 0 })
  }

  const kohdistamaton: { nimi: string; tyokulu: number }[] = []

  for (const m of myyjat) {
    const omat = tunnit.get(m.nimi)
    const yhteensa = omat ? Array.from(omat.values()).reduce((s, h) => s + h, 0) : 0

    if (yhteensa <= 0) {
      if (m.tyokulu !== 0) kohdistamaton.push({ nimi: m.nimi, tyokulu: sentteihin(m.tyokulu) })
      continue
    }

    for (const [myymala, h] of Array.from(omat!.entries())) {
      const osuus = h / yhteensa
      const k = kertyma.get(myymala)!
      k.tunnit += h
      k.pohjapalkka += m.pohjapalkka * osuus
      k.provisiot += m.provisiot * osuus
      k.palkkakulu += m.tyokulu * osuus
    }
  }

  const myymalat: MyymalanPalkkakulu[] = MYYMALAT.map(({ myymala }) => {
    const k = kertyma.get(myymala)!
    const bonus = bonusPerMyymala[myymala] ?? 0
    const bonusKulu = sivukuluineen(bonus)
    const palkkakulu = sentteihin(k.palkkakulu)
    return {
      myymala,
      tunnit: sentteihin(k.tunnit),
      pohjapalkka: sentteihin(k.pohjapalkka),
      provisiot: sentteihin(k.provisiot),
      palkkakulu,
      bonus,
      bonusKulu,
      yhteensa: sentteihin(palkkakulu + bonusKulu),
    }
  })

  return {
    myymalat,
    kohdistamaton,
    yhteensa: sentteihin(
      myymalat.reduce((s, m) => s + m.yhteensa, 0) + kohdistamaton.reduce((s, m) => s + m.tyokulu, 0),
    ),
  }
}
