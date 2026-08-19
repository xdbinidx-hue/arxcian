import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { soloOnlyEstetyt, uiRefreshJobIds, UI_REFRESH_JOBS } from './cronAccess.ts'

/**
 * Turvaraja: hubin virkistysnappi ei saa koskaan ajaa `soloOnly`-työtä.
 *
 * `winpos-import` kirjoittaa elävään Google Sheets -taulukkoon ja tyhjentää
 * Kassamyynti-alueen ennen kirjoitusta. Nappi kutsuu cron-reittiä kirjautuneen
 * käyttäjän oikeuksilla, joten pelkkä "napissa ei ole sitä id:tä" ei riitä —
 * osoiterivi ei kysy komponentilta lupaa.
 *
 * `cron.ts`:ää ei voi importata tänne (se tuo Googlen, Redisin ja istunnon
 * `@/`-aliaksen takaa), joten rekisteri luetaan lähdetekstistä. Jäsennys
 * nojaa rakenteeseen eikä muotoiluun: `soloOnly` kuuluu aina samaan
 * työolioon kuin sitä edeltävä `id`.
 *
 * Osa id:istä syntyy listasta (`watch-${lista}`, `news-${category}`), joten
 * kirjoitettu id on kuvio eikä nimi — `${…}` luetaan jokerimerkkinä.
 */

type Tyo = { kuvio: RegExp; teksti: string; soloOnly: boolean }

/** Poimii cron.ts:n JOBS-rekisteristä työ-id:t ja tiedon onko työ soloOnly. */
function lueTyot(): Tyo[] {
  const lahde = readFileSync(new URL('./cron.ts', import.meta.url), 'utf8')
  const osumat = [...lahde.matchAll(/\bid: [`'](.+?)[`'],/g)]

  return osumat.map((osuma, i) => {
    const alku = osuma.index + osuma[0].length
    const loppu = i + 1 < osumat.length ? osumat[i + 1].index : lahde.length
    const teksti = osuma[1]
    // Jako ensin, kuorrutus vasta sitten: jos `$` kuorrutettaisiin ensin,
    // `${lista}` ei enää tunnistuisi jokerimerkiksi.
    const kuvio = new RegExp(
      `^${teksti
        .split(/\$\{[^}]*\}/)
        .map(osa => osa.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.+')}$`,
    )
    return { kuvio, teksti, soloOnly: /\bsoloOnly: true\b/.test(lahde.slice(alku, loppu)) }
  })
}

test('cron.ts:n rekisteri saadaan luettua ja winpos-import on yhä soloOnly', () => {
  const tyot = lueTyot()

  // Jos jäsennys hajoaa, kaikki muut väitteet menisivät läpi tyhjällä
  // listalla. Siksi tämä ensin.
  assert.ok(tyot.length >= 10, `Rekisteristä löytyi vain ${tyot.length} työtä — jäsennys hajosi?`)

  const winpos = tyot.find(t => t.kuvio.test('winpos-import'))
  assert.ok(winpos, 'winpos-import puuttuu rekisteristä')
  assert.equal(winpos.soloOnly, true, 'winpos-import ei ole enää soloOnly')
})

test('jokainen virkistysnapin työ on olemassa eikä yksikään ole soloOnly', () => {
  const tyot = lueTyot()

  for (const id of uiRefreshJobIds()) {
    const tyo = tyot.find(t => t.kuvio.test(id))
    assert.ok(tyo, `Virkistysnappi osoittaa työhön jota ei ole: ${id}`)
    assert.equal(tyo.soloOnly, false, `Virkistysnappi ei saa ajaa soloOnly-työtä: ${id}`)
  }
})

test('UI_REFRESH_JOBS kattaa hubin cron-vetoiset paneelit', () => {
  // Ei pelkkä lukumäärä: jos joku poistaa paneelin kartasta, sen huomaa tästä
  // eikä vasta siitä että nappi katosi käyttöliittymästä.
  assert.deepEqual(Object.keys(UI_REFRESH_JOBS).sort(), [
    'kanavat',
    'markkinat',
    'rjmob',
    'rukousajat',
    'saa',
    'watch',
  ])
  // Viisi yhden työn paneelia + watchin kaksi listaa.
  assert.equal(uiRefreshJobIds().length, 7)
})

test('istunnolla ei aja soloOnly-työtä, CRON_SECRETilla ajaa', () => {
  const winpos = [{ id: 'winpos-import', soloOnly: true }]

  assert.deepEqual(
    soloOnlyEstetyt(winpos, 'user').map(j => j.id),
    ['winpos-import'],
    'kirjautunut käyttäjä pääsi ajamaan soloOnly-työn',
  )
  assert.deepEqual(soloOnlyEstetyt(winpos, 'cron'), [], 'CRON_SECRET ei pääse enää läpi')
})

test('tavallinen työ ja joukkoajo eivät esty kummallakaan tavalla', () => {
  const joukko = [{ id: 'hub-channels' }, { id: 'hub-weather' }, { id: 'rjmob-summary' }]

  assert.deepEqual(soloOnlyEstetyt(joukko, 'user'), [])
  assert.deepEqual(soloOnlyEstetyt(joukko, 'cron'), [])
})

test('sekalaisesta valinnasta estyy vain soloOnly-työ', () => {
  const sekainen = [{ id: 'hub-weather' }, { id: 'winpos-import', soloOnly: true }]

  assert.deepEqual(
    soloOnlyEstetyt(sekainen, 'user').map(j => j.id),
    ['winpos-import'],
  )
})

/**
 * Nieltyjen osavirheiden tulkinta — `cron.ts`:n `arvioi`-funktiot pähkinänkuoressa.
 *
 * Nämä kolme hakua palaavat normaalisti myös epäonnistuessaan: `refreshQuotes`
 * korvaa kaatuneen symbolin edellisellä kurssilla, `refreshRjMobSummaries`
 * jatkaa muihin kuukausiin, ja `fetchAndCache` palauttaa vanhentunutta dataa.
 * Sääntö on siksi kirjoitettu ulos ja testattu erikseen: jos se menee väärin,
 * paneeli näyttää tuoretta kellonaikaa vanhoille luvuille eikä sitä huomaa
 * mistään.
 */

/** trading-quotes: ok = saadut symbolit, eli nolla vasta kun kaikki kaatui. */
const kurssiArvio = (kaikki: number, failed: string[]) => ({
  ok: kaikki - failed.length,
  failed,
})

/** rjmob-summary: vain uusin kuukausi näkyy hubissa. */
const rjmobArvio = (newestFailed: boolean, failed: string[]) => ({
  ok: newestFailed ? 0 : 1,
  failed,
})

test('kurssit: yksi kaatunut symboli ei ole vanhentunut, kaikkien kaatuminen on', () => {
  assert.equal(kurssiArvio(6, []).ok, 6)
  assert.equal(kurssiArvio(6, ['EURUSD']).ok, 5, 'osavika ei saa nollata onnistumista')
  assert.deepEqual(kurssiArvio(6, ['EURUSD']).failed, ['EURUSD'], 'osavika on silti kerrottava')
  assert.equal(
    kurssiArvio(6, ['a', 'b', 'c', 'd', 'e', 'f']).ok,
    0,
    'Yahoo kokonaan nurin luetaan vanhentuneeksi',
  )
})

test('rjmob: vanhan kuukauden vika ei vanhenna hubin lukua, uusimman vika vanhentaa', () => {
  // Hub näyttää vain uusinta kuukautta, joten vanhan kuukauden vika olisi
  // hälytys luvusta jota paneeli ei näytä.
  assert.equal(rjmobArvio(false, ['2026-03']).ok, 1)
  assert.deepEqual(rjmobArvio(false, ['2026-03']).failed, ['2026-03'])

  // Uusimman kuukauden vika tarkoittaa ettei rjmob:summary päivittynyt.
  assert.equal(rjmobArvio(true, ['2026-08']).ok, 0)
})
