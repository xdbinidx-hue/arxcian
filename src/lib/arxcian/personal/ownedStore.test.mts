// Kilpaileva kirjoitus Personalin jaettuun avaimeen.
//
// Tämä on se vika jonka takia ownedStore.ts on olemassa: kaksi käyttäjää, yksi
// avain, luku-muokkaa-kirjoita. Testi väärentää kilpailijan joka ehtii väliin
// luvun ja kirjoituksen välissä — ilman versiotarkistusta toinen lisäys katoaa.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runMutate, StoreWriteError, type StoreBackend, type WriteOutcome } from './ownedStore.ts'

type Rivi = { id: string; owner: 'albin' | 'arbnor' | 'shared' }

/**
 * Muistinvarainen varasto versiolla. `viiveella` ajetaan kerran heti luvun
 * jälkeen — se on kilpaileva kirjoittaja.
 */
function backend(alku: Rivi[] = []) {
  let items = [...alku]
  let version = 0
  let kirjoituksia = 0
  let valissa: (() => void) | null = null

  const b: StoreBackend<Rivi> = {
    async read() {
      const tila = { items: [...items], version: String(version) }
      if (valissa) {
        const f = valissa
        valissa = null
        f()
      }
      return tila
    },
    async write(expected, next): Promise<WriteOutcome> {
      if (expected !== String(version)) return 'conflict'
      items = [...next]
      version += 1
      kirjoituksia += 1
      return 'ok'
    },
  }

  return {
    b,
    nykyiset: () => items,
    kirjoituksia: () => kirjoituksia,
    /** Kilpailija joka kirjoittaa suoraan varastoon luvun jälkeen. */
    kilpailija(rivi: Rivi) {
      valissa = () => {
        items = [rivi, ...items]
        version += 1
      }
    },
  }
}

test('kilpaileva kirjoitus ei hukkaa toisen käyttäjän lisäystä', () => {
  const s = backend([{ id: 'vanha', owner: 'shared' }])
  // Arbnor ehtii väliin heti kun Albinin muutos on lukenut listan.
  s.kilpailija({ id: 'arbnorin', owner: 'arbnor' })

  return runMutate('testi', s.b, current => [{ id: 'albinin', owner: 'albin' }, ...current]).then(tulos => {
    const idt = tulos.map(r => r.id)
    // Molempien lisäykset ovat tallessa — ennen korjausta 'arbnorin' katosi.
    assert.ok(idt.includes('albinin'), 'Albinin lisäys puuttuu')
    assert.ok(idt.includes('arbnorin'), 'Arbnorin lisäys hukkui')
    assert.ok(idt.includes('vanha'))
    assert.deepEqual(
      s.nykyiset().map(r => r.id),
      idt,
    )
  })
})

test('törmäämätön kirjoitus menee läpi yhdellä yrityksellä', async () => {
  const s = backend([])
  await runMutate('testi', s.b, current => [{ id: 'a', owner: 'albin' }, ...current])
  assert.equal(s.kirjoituksia(), 1)
  assert.deepEqual(s.nykyiset().map(r => r.id), ['a'])
})

test('null-muutos ei kirjoita mitään', async () => {
  const s = backend([{ id: 'a', owner: 'albin' }])
  const tulos = await runMutate('testi', s.b, () => null)
  assert.equal(s.kirjoituksia(), 0)
  assert.deepEqual(tulos.map(r => r.id), ['a'])
})

test('muutosfunktio näkee kilpailijan kirjoituksen uudella yrityksellä', async () => {
  const s = backend([])
  s.kilpailija({ id: 'kilpailija', owner: 'arbnor' })

  const nahdyt: string[][] = []
  await runMutate('testi', s.b, current => {
    nahdyt.push(current.map(r => r.id))
    return [{ id: 'oma', owner: 'albin' }, ...current]
  })

  // Ensimmäinen yritys näki tyhjän listan, toinen jo kilpailijan rivin —
  // omistajuustarkistus tehdään siis aina tuoreesta tilasta.
  assert.deepEqual(nahdyt[0], [])
  assert.deepEqual(nahdyt[1], ['kilpailija'])
})

test('loputon törmäys heittää eikä palauta hiljaa vanhaa listaa', async () => {
  let version = 0
  const b: StoreBackend<Rivi> = {
    async read() {
      version += 1 // versio muuttuu joka luvun jälkeen -> kirjoitus ei osu koskaan
      return { items: [{ id: 'pysyy', owner: 'shared' }], version: String(version) }
    },
    async write(): Promise<WriteOutcome> {
      return 'conflict'
    },
  }

  // Ennen korjausta tämä palautti listan ilman käyttäjän lisäystä ja reitti
  // vastasi 200 OK — juuri se hiljainen epäonnistuminen jota ownedStore estää.
  await assert.rejects(
    () => runMutate('testi', b, current => [{ id: 'uusi', owner: 'albin' }, ...current]),
    (e: unknown) => e instanceof StoreWriteError && e.reason === 'conflict',
  )
})

test('kova virhe heittää heti eikä kuluta yrityksiä', async () => {
  let lukuja = 0
  const b: StoreBackend<Rivi> = {
    async read() {
      lukuja += 1
      return { items: [], version: '0' }
    },
    async write(): Promise<WriteOutcome> {
      return 'error'
    },
  }

  await assert.rejects(
    () => runMutate('testi', b, () => [{ id: 'uusi', owner: 'albin' }]),
    (e: unknown) => e instanceof StoreWriteError && e.reason === 'error',
  )
  // Rikkinäinen Redis ei parane yrittämällä uudelleen.
  assert.equal(lukuja, 1)
})

test('lukuvirhe kulkee läpi eikä muutu tyhjäksi listaksi', async () => {
  const b: StoreBackend<Rivi> = {
    async read() {
      throw new Error('Redis alhaalla')
    },
    async write(): Promise<WriteOutcome> {
      return 'ok'
    },
  }

  // Tyhjä lista lukuvirheen tilalla johtaisi siihen että ensimmäinen kirjoitus
  // korvaa koko olemassa olevan listan yhdellä rivillä.
  await assert.rejects(
    () => runMutate('testi', b, current => [{ id: 'uusi', owner: 'albin' }, ...current]),
    /Redis alhaalla/,
  )
})
