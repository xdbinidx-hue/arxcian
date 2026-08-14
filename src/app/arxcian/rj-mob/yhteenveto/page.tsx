import { RjMobNav } from '@/components/rjmob/RjMobNav'
import { getRjMobInsights, type Huomio, type Mittari, type MyyjaTila, type TehoTila, type Vertailu } from '@/lib/arxcian/rjmobInsights'

/**
 * RJ-Mobin tilanneyhteenveto.
 *
 * Palvelinkomponentti eikä `'use client'` + tiedostovalitsin kuten muut
 * RJ-Mobin sivut: yhteenveto koskee aina uusinta kuukautta, joten valitsimelle
 * ei ole käyttöä, ja palvelimella data saadaan välimuistista ilman että selain
 * tekee ensin tyhjän sivulatauksen ja sitten hakupyynnön.
 *
 * Sivu ei koskaan hae Drivestä itse — `getRjMobInsights` lukee välimuistin,
 * jonka cron-työ `rjmob-insights` pitää lämpimänä.
 */

export const dynamic = 'force-dynamic'

const VARIT = {
  korkea: { teksti: '#ef4444', tausta: '#fee2e2' },
  keskitaso: { teksti: '#f97316', tausta: '#ffedd5' },
  matala: { teksti: '#eab308', tausta: '#fef9c3' },
  hyva: { teksti: '#22c55e', tausta: '#dcfce7' },
} as const

/** Tehon tila samoihin väreihin kuin huomioiden vakavuus. */
const TEHO_VARI: Record<TehoTila, { teksti: string; tausta: string } | null> = {
  alle: VARIT.korkea,
  rajalla: VARIT.matala,
  yli: VARIT.hyva,
  'ei-arviota': null,
}

const TEHO_TEKSTI: Record<TehoTila, string> = {
  alle: 'alle tehojen',
  rajalla: 'rajalla',
  yli: 'yli tehojen',
  'ei-arviota': '—',
}

function fmt(n: number, dec = 0) {
  return n.toLocaleString('fi-FI', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function arvo(n: number, yksikko: 'kpl' | 'eur') {
  return yksikko === 'eur' ? `${fmt(n)} €` : fmt(n)
}

/** Vauhtiero etumerkillä: +12 pp / −24 pp. */
function eroTeksti(pp: number) {
  const merkki = pp >= 0 ? '+' : '−'
  return `${merkki}${fmt(Math.abs(pp))} pp`
}

const th = { padding: '8px 10px', fontSize: 11, fontWeight: 500, color: '#888', textAlign: 'center' as const, borderBottom: '0.5px solid #eee', whiteSpace: 'nowrap' as const, background: '#f8f8f8' }
const thL = { ...th, textAlign: 'left' as const }
const td = { padding: '8px 10px', fontSize: 13, textAlign: 'center' as const, borderBottom: '0.5px solid #f5f5f5' }
const tdL = { ...td, textAlign: 'left' as const, fontWeight: 500 }
const kortti = { background: 'white', border: '0.5px solid #eee', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }
const korttiOtsikko = { padding: '12px 16px', borderBottom: '0.5px solid #eee' }

function Merkki({ vakavuus, teksti }: { vakavuus: keyof typeof VARIT; teksti: string }) {
  const v = VARIT[vakavuus]
  return (
    <span style={{ background: v.tausta, color: v.teksti, borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {teksti}
    </span>
  )
}

/** Yksi tavoitemittari solussa: toteuma/tavoite ylärivillä, vauhti alarivillä. */
function MittariSolu({ mittari }: { mittari: Mittari | undefined }) {
  if (!mittari) return <td style={{ ...td, color: '#bbb' }}>—</td>

  const vari = mittari.tila === 'selvasti-jaljessa' ? VARIT.korkea
    : mittari.tila === 'jaljessa' ? VARIT.keskitaso
    : mittari.tila === 'edella' ? VARIT.hyva
    : null

  return (
    <td style={{ ...td, background: vari?.tausta ?? 'transparent' }}>
      <div style={{ fontSize: 12 }}>
        {arvo(mittari.toteuma, mittari.yksikko)} <span style={{ color: '#aaa' }}>/ {arvo(mittari.tavoite, mittari.yksikko)}</span>
      </div>
      <div style={{ fontSize: 11, color: vari?.teksti ?? '#888', fontWeight: vari ? 600 : 400, marginTop: 2 }}>
        {fmt(mittari.saavutusPct)} % · {eroTeksti(mittari.vauhtiEro)}
      </div>
    </td>
  )
}

/** Myymälä- ja yritystason solu: toteuma ja ennuste vs. edellinen kuukausi. */
function VertailuSolu({ vertailu }: { vertailu: Vertailu }) {
  const vari = vertailu.tila === 'jaljessa' ? VARIT.keskitaso
    : vertailu.tila === 'edella' ? VARIT.hyva
    : null

  return (
    <td style={{ ...td, background: vari?.tausta ?? 'transparent' }}>
      <div style={{ fontSize: 12 }}>{arvo(vertailu.toteuma, vertailu.yksikko)}</div>
      <div style={{ fontSize: 11, color: vari?.teksti ?? '#888', fontWeight: vari ? 600 : 400, marginTop: 2 }}>
        {vertailu.muutosPct !== null
          ? <>ennuste {arvo(vertailu.ennuste, vertailu.yksikko)} · {vertailu.muutosPct >= 0 ? '+' : '−'}{fmt(Math.abs(vertailu.muutosPct))} %</>
          : <>ennuste {arvo(vertailu.ennuste, vertailu.yksikko)}</>}
      </div>
    </td>
  )
}

function TehoSolu({ teho, tila }: { teho: number; tila: TehoTila }) {
  const vari = TEHO_VARI[tila]
  if (!vari) {
    return <td style={{ ...td, color: '#bbb' }}>—</td>
  }
  return (
    <td style={{ ...td, background: vari.tausta, color: vari.teksti, fontWeight: 600 }}>
      {fmt(teho, 2)} €/h
    </td>
  )
}

function mittariLajilla(myyja: MyyjaTila, laji: Mittari['laji']) {
  return myyja.mittarit.find(m => m.laji === laji)
}

function HuomioRivi({ huomio }: { huomio: Huomio }) {
  const v = VARIT[huomio.vakavuus]
  const nimi = huomio.vakavuus === 'korkea' ? 'Vaatii huomiota'
    : huomio.vakavuus === 'keskitaso' ? 'Seurattava'
    : huomio.vakavuus === 'matala' ? 'Rajalla'
    : 'Hyvä'

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '10px 16px', borderBottom: '0.5px solid #f5f5f5', borderLeft: `3px solid ${v.teksti}` }}>
      <Merkki vakavuus={huomio.vakavuus} teksti={nimi} />
      <span style={{ fontSize: 13, lineHeight: 1.5 }}>{huomio.teksti}</span>
    </div>
  )
}

export default async function YhteenvetoPage() {
  let insights
  let lahde: 'network' | 'cache' | 'stale' | null = null
  let virhe: string | null = null

  try {
    const haettu = await getRjMobInsights()
    insights = haettu.data
    lahde = haettu.source
  } catch (e) {
    virhe = e instanceof Error ? e.message : String(e)
  }

  return (
    <div>
      <RjMobNav activePage="/arxcian/rj-mob/yhteenveto" />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>

        {virhe && (
          <div style={{ ...kortti, padding: '16px', fontSize: 13, color: '#A32D2D' }}>
            Yhteenvetoa ei saatu: {virhe}
            <div style={{ color: '#888', marginTop: 6 }}>
              Luvut haetaan seuraavassa ajastetussa ajossa, tai käsin reitiltä
              <code style={{ margin: '0 4px' }}>/api/arxcian/cron?job=rjmob-insights</code>.
            </div>
          </div>
        )}

        {insights && (
          <>
            {/* Tilannerivi */}
            <div style={{ background: '#E6F1FB', borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', gap: 24, fontSize: 13, color: '#185FA5', flexWrap: 'wrap' }}>
              <span><strong>{insights.kuukausi}</strong></span>
              <span>📅 Päivä {insights.paiva}/{insights.paiviaKuukaudessa}</span>
              <span>🏪 {insights.tyopaiviaKulunut}/{insights.tyopaiviaYhteensa} työpäivää (ma–la, ei pyhiä)</span>
              <span>📈 Kulunut {fmt(insights.kulunutPct)} % kuukaudesta</span>
              {!insights.kuukausiKesken && <span>✔︎ Kuukausi päättynyt</span>}
            </div>

            {/* Varaumat: nämä muuttavat sitä mitä listalta puuttuu, joten ne
                kuuluvat sivulle eivätkä pelkästään koodin kommenttiin. */}
            {(!insights.vauhtiLuotettava || insights.tavoitteetPuuttuvat || lahde === 'stale') && (
              <div style={{ ...kortti, padding: '10px 16px', fontSize: 12, color: '#854F0B', background: '#fef9c3', border: 'none' }}>
                {!insights.vauhtiLuotettava && (
                  <div>Kuukaudesta on kulunut vasta {insights.tyopaiviaKulunut} työpäivää — vauhtiarvioita ei näytetä ennen viittä, koska yksi päivä heiluttaisi ennustetta kymmeniä prosentteja. Teho ja kannattavuus näkyvät silti.</div>
                )}
                {insights.tavoitteetPuuttuvat && (
                  <div>Tavoitteet-välilehteä ei löytynyt tästä taulukosta — tavoitepohjaiset huomiot puuttuvat, teho ja kuukausivertailu eivät.</div>
                )}
                {lahde === 'stale' && (
                  <div>Näytetään edellinen onnistunut haku: tuorein haku Drivestä ei onnistunut.</div>
                )}
              </div>
            )}

            {/* HUOMIOT */}
            <div style={kortti}>
              <div style={korttiOtsikko}>
                <span style={{ fontWeight: 500, fontSize: 14 }}>Huomiot</span>
                <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>
                  {insights.huomiot.length > 0 ? `${insights.huomiot.length} kpl, vakavin ensin` : 'ei poikkeamia'}
                </span>
              </div>
              {insights.huomiot.length > 0 ? (
                insights.huomiot.map((h, i) => <HuomioRivi key={`${h.kohde}-${h.laji}-${i}`} huomio={h} />)
              ) : (
                <div style={{ padding: '16px', fontSize: 13, color: '#888' }}>
                  Ei poikkeamia: kaikki myyjät ja myymälät ovat tehoissa ja tavoitevauhdissa.
                </div>
              )}
            </div>

            {/* MYYJÄT */}
            <div style={kortti}>
              <div style={korttiOtsikko}>
                <span style={{ fontWeight: 500, fontSize: 14 }}>Myyjät</span>
                <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>
                  heikoin teho ensin · mittarisolussa toteuma / tavoite ja alla saavutus-% sekä ero kuukauden kuluneeseen osuuteen
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thL}>Myyjä</th>
                      <th style={th}>Teho</th>
                      <th style={th}>Tila</th>
                      <th style={th}>Tunnit</th>
                      <th style={th}>Työpäivät</th>
                      <th style={th}>Liittymät</th>
                      <th style={th}>F-Secure</th>
                      <th style={th}>Kassakate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.myyjat.map(m => (
                      <tr key={m.nimi}>
                        <td style={tdL}>
                          {m.nimi}
                          {m.tappiollinen && (
                            <span style={{ marginLeft: 6 }}>
                              <Merkki vakavuus="korkea" teksti="kulut > tuotto" />
                            </span>
                          )}
                          {m.fsecLeikkuri && (
                            <span style={{ marginLeft: 6 }}>
                              <Merkki vakavuus="keskitaso" teksti={`F-Sec ${fmt(m.fsecKpl)} kpl · −${fmt(m.fsecLeikkuriEur)} €`} />
                            </span>
                          )}
                        </td>
                        <TehoSolu teho={m.teho} tila={m.tehoTila} />
                        <td style={{ ...td, fontSize: 11, color: '#888' }}>
                          {m.tyyppi !== 'owner' ? TEHO_TEKSTI[m.tehoTila] : 'ei arvioida'}
                        </td>
                        <td style={td}>{fmt(m.tunnit)}</td>
                        <td style={{ ...td, fontSize: 11, color: m.vertailukelpoinen ? '#1a1a1a' : '#f97316' }}>
                          {m.vertailuSyy ?? fmt(m.paivat)}
                        </td>
                        <MittariSolu mittari={mittariLajilla(m, 'liittymat')} />
                        <MittariSolu mittari={mittariLajilla(m, 'fsecure')} />
                        <MittariSolu mittari={mittariLajilla(m, 'kassakate')} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* MYYMÄLÄT */}
            <div style={kortti}>
              <div style={korttiOtsikko}>
                <span style={{ fontWeight: 500, fontSize: 14 }}>Myymälät</span>
                <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>
                  tavoitteet ovat myyjäkohtaisia, joten myymälän vauhti mitataan edelliseen kuukauteen
                  {insights.edellinenKuukausi ? ` (${insights.edellinenKuukausi})` : ''}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thL}>Myymälä</th>
                      <th style={th}>Teho</th>
                      <th style={th}>Tila</th>
                      <th style={th}>Tunnit</th>
                      <th style={th}>Liittymät</th>
                      <th style={th}>F-Secure</th>
                      <th style={th}>Kassakate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.myymalat.map(my => (
                      <tr key={my.nimi}>
                        <td style={tdL}>{my.nimi}</td>
                        <TehoSolu teho={my.teho} tila={my.tehoTila} />
                        <td style={{ ...td, fontSize: 11, color: '#888' }}>{TEHO_TEKSTI[my.tehoTila]}</td>
                        <td style={td}>{fmt(my.tunnit)}</td>
                        {my.vertailut.map(v => <VertailuSolu key={v.laji} vertailu={v} />)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* KOKO YRITYS */}
            <div style={kortti}>
              <div style={korttiOtsikko}>
                <span style={{ fontWeight: 500, fontSize: 14 }}>Koko RJ-Mob</span>
                <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>
                  samat kentät jotka hubin RJ-Mob-paneeli näyttää
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thL}>Mittari</th>
                      <th style={th}>Kertymä</th>
                      <th style={th}>Ennuste kuun loppuun</th>
                      <th style={th}>Edellinen kuukausi</th>
                      <th style={th}>Muutos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.yritys.map(v => {
                      const vari = v.tila === 'jaljessa' ? VARIT.keskitaso : v.tila === 'edella' ? VARIT.hyva : null
                      return (
                        <tr key={v.laji}>
                          <td style={tdL}>{v.label}</td>
                          <td style={td}>{arvo(v.toteuma, v.yksikko)}</td>
                          <td style={td}>{arvo(v.ennuste, v.yksikko)}</td>
                          <td style={{ ...td, color: '#888' }}>{v.edellinen !== null ? arvo(v.edellinen, v.yksikko) : '—'}</td>
                          <td style={{ ...td, background: vari?.tausta ?? 'transparent', color: vari?.teksti ?? '#888', fontWeight: vari ? 600 : 400 }}>
                            {v.muutosPct !== null ? `${v.muutosPct >= 0 ? '+' : '−'}${fmt(Math.abs(v.muutosPct))} %` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 16px', fontSize: 11, color: '#888', borderTop: '0.5px solid #f5f5f5', lineHeight: 1.6 }}>
                Ennuste on kertymä projisoituna kuukauden loppuun kuluneilla työpäivillä, ei toteuma.
                <br />
                Kassaprovisio on eri suure kuin myymälärivien kassakate, noin kymmenesosa siitä — siksi
                se on nimetty tässä eri tavalla eikä lukuja voi laskea yhteen.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
