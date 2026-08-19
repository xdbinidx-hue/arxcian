/**
 * Cron-reitin työkohtainen pääsysääntö — erotettu [cron.ts](cron.ts):stä
 * puhtaaksi, jotta se voidaan testata ilman Redisiä, Googlea ja istuntoa.
 *
 * `authorizeCron` vastaa siihen **pääseekö** kutsuja reitille. Tämä vastaa
 * siihen **mitä** hän saa sillä ajaa, ja ne ovat eri kysymyksiä: kirjautunut
 * käyttäjä saa käynnistää haun käsin, mutta ei sellaista työtä joka kirjoittaa
 * elävään taulukkoon.
 */

/** Se osa `CronJob`ista jonka pääsysääntö tarvitsee. */
export type JobAccess = {
  id: string
  soloOnly?: boolean
}

/**
 * Palauttaa ne valituista töistä joita istunnolla ei saa ajaa. Tyhjä = ajo saa jatkua.
 *
 * **Miksi tämä on olemassa.** Hubin paneeleissa on virkistysnappi, joka
 * kutsuu cron-reittiä kirjautuneen käyttäjän oikeuksilla. `winpos-import` on
 * `soloOnly`: se tekee `values.clear`in Kassamyynti-alueeseen ennen
 * kirjoitusta, eli alue on hetken tyhjä ja rinnakkainen lukija välimuistittaisi
 * nollat. Sitä ei saa voida käynnistää **cron-reitin kautta** napista eikä
 * käsin kirjoitetusta osoitteesta, joten esto on palvelimella eikä
 * komponentissa.
 *
 * Tämä ei sulje `/api/winpos/import`ia, joka on oma reittinsä eikä tunne
 * `soloOnly`ta lainkaan — se on Winpos-sivun oma toiminto ja vaatii istunnon.
 * Rajaus koskee ajastettujen töiden reittiä, ei kaikkea tuontia.
 *
 * `CRON_SECRET` pääsee läpi: GitHub-workflow ajaa tuonnin omana vaiheenaan
 * ennen joukkoajoa, ks. .github/workflows/arxcian-cron.yml.
 *
 * Joukkoajo ei koskaan sisällä `soloOnly`-töitä (`jobsFor` suodattaa ne),
 * joten tämä osuu käytännössä vain `?job=<id>`-muotoon.
 */
export function soloOnlyEstetyt(
  jobs: readonly JobAccess[],
  via: 'cron' | 'user',
): readonly JobAccess[] {
  if (via === 'cron') return []
  return jobs.filter(job => job.soloOnly === true)
}

/**
 * Työt jotka hubin paneelien virkistysnappi saa ajaa.
 *
 * Lista on tässä eikä komponenteissa, jotta testi ja käyttöliittymä katsovat
 * samaa totuutta. `cronAccess.test.mts` tarkistaa tästä listasta ettei
 * yksikään id osoita `soloOnly`-työhön eikä olemattomaan työhön.
 *
 * **Tämä ei ole turvaraja vaan kartta.** Varsinainen esto on `soloOnlyEstetyt`,
 * joka ei katso tätä listaa lainkaan — muuten listaan lipsahtanut id avaisi
 * reitin.
 */
export const UI_REFRESH_JOBS = {
  rjmob: 'rjmob-summary',
  kanavat: 'hub-channels',
  saa: 'hub-weather',
  rukousajat: 'hub-prayer',
  markkinat: 'trading-quotes',
  watch: ['watch-trading', 'watch-personal'],
} as const

/** Kaikki virkistysnapin työ-id:t yhtenä listana. */
export function uiRefreshJobIds(): string[] {
  return Object.values(UI_REFRESH_JOBS).flatMap(v => (typeof v === 'string' ? [v] : [...v]))
}
