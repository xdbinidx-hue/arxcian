/**
 * RJ-Mobin kuukausiyhteenvedon välimuotti hubin paneelia varten.
 *
 * Tässä on tarkoituksella vain **tyyppi ja avain**, ei laskentaa.
 *
 * RJ-Mobin luvut syntyvät Google Sheetsin raakadatasta lib/rjmob.ts:n
 * sääntöjen läpi (sivukulukerroin, läpimenoprosentti, myyjäkohtaiset
 * kertoimet, nimien normalisointi), ja ne ovat oikeaa liiketoimintadataa
 * joita katsotaan päätöksenteossa. Väärin laskettu luku etusivulla on
 * pahempi kuin puuttuva luku, joten kirjoittajaa ei ole tehty arvaamalla
 * — se lisätään kun laskenta on käyty läpi yhdessä ja varmistettu
 * tuottoseurannan lukuja vastaan.
 *
 * Siihen asti hubin paneeli lukee tätä avainta, ei löydä sitä ja näyttää
 * rehellisen tyhjän tilan. Kun kirjoittaja tulee, paneeli alkaa toimia
 * ilman että sitä tarvitsee muuttaa.
 */

export const RJMOB_SUMMARY_KEY = 'rjmob:summary'

export type RjMobMetric = {
  /** Valmiiksi muotoiltu näytettävä arvo, esim. "342" tai "18,9k €" */
  display: string
  /** Muutos edelliseen kuukauteen prosentteina, tai null jos vertailua ei ole */
  changePercent: number | null
}

export type RjMobSummaryData = {
  /** Kuukauden nimi paneelin metatietoon, esim. "elokuu" */
  monthLabel: string
  metrics: {
    liittymat: RjMobMetric
    kassakate: RjMobMetric
    fsecure: RjMobMetric
  }
}
