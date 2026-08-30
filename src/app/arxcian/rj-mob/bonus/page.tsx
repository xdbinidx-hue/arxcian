'use client'
import { useEffect, useRef, useState } from 'react'
import { RjMobNav } from '@/components/rjmob/RjMobNav'
import { saakoAjaaAutomaattisesti } from '@/lib/arxcian/autoRefresh'
import {
  MYYMALAT, MITTARIT, MITTARI_NIMI, MITTARI_YKSIKKO, PORRAS_SATA, PORRAS_SATAKAKSI,
  bonusmalliVoimassa, laskeKuukaudenBonukset, toteumatMyymalataulukosta, tasonMaksimi,
  ansaintakuukausi, BONUSMALLI_ALKAA,
  type Mittari, type MittariTulos, type Myymala, type MyymalaTavoite, type MyymalaToteuma,
} from '@/lib/rjmobBonus'
import {
  tavoitteetKuukaudelle, tavoiteIlmanTapahtumaa, onLukittu, muutosTeksti,
  normalisoiToteuma, onTapahtumakuukausi, type Normalisointi,
  type MuutosMerkinta, type TavoiteLahde,
} from '@/lib/rjmobBonusTavoitteet'

/**
 * Myymäläpäällikköbonus.
 *
 * Sivu näyttää **mistä bonus syntyy**, ei vain lopputulosta: kunkin mittarin
 * toteuma, tavoite, prosentti ja porras erikseen. Yksi euroluku ilman
 * prosentteja ei kertoisi päällikölle mitä pitäisi tehdä toisin, eikä Albin
 * näkisi kumpi mittari jäi rajan alle.
 *
 * Sama tiedostovalitsin kuin muilla RJ-Mobin sivuilla: bonus lasketaan siitä
 * myyntiseurantatiedostosta joka on valittuna, ja kuukausi tunnistetaan sen
 * nimestä samalla `vuosi × 100 + kuukausi` -säännöllä.
 */

interface DriveFile { id: string; name: string; mimeType: string }
type StoreRow = { liittKpl: number; fsecKpl: number; kassa: number }
interface DashData { kuukausi: string; stores?: Record<string, StoreRow>; error?: string }
interface TavoiteHaku {
  tavoitteet: Partial<Record<Myymala, MyymalaTavoite>> | null
  lahde: TavoiteLahde
  varoitukset: string[]
  tiedosto: string | null
  jaadytetty: string | null
  historia: MuutosMerkinta[]
}

const LAHDE_TEKSTI: Record<TavoiteLahde, string> = {
  lukittu: 'Tavoitteet jäädytetty kuun alussa',
  drive: 'Tavoitteet luettu Drive-taulukosta',
  koodi: 'Tavoitteet lukitusta kopiosta',
  puuttuu: 'Tavoitteita ei ole',
}

function fmt(n: number, dec = 0) {
  return n.toLocaleString('fi-FI', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function parsePrefix(name: string): number {
  const yearMatch = name.match(/(\d{4})/)
  const numMatch = name.match(/(\d{1,3})\./)
  const year = yearMatch ? Number(yearMatch[1]) : 0
  const month = numMatch ? Number(numMatch[1]) : 0
  return year * 100 + month
}

const KUUKAUDET = ['tammikuu','helmikuu','maaliskuu','huhtikuu','toukokuu','kesäkuu','heinäkuu','elokuu','syyskuu','lokakuu','marraskuu','joulukuu']

function kuukausiNimi(order: number): string {
  const kk = order % 100
  const nimi = KUUKAUDET[kk - 1] ?? '?'
  return `${nimi} ${Math.floor(order / 100)}`
}

function arvo(n: number, mittari: Mittari) {
  return MITTARI_YKSIKKO[mittari] === '€' ? `${fmt(n)} €` : fmt(n)
}

const VARIT = {
  ei: { teksti: '#A32D2D', tausta: '#fee2e2' },
  sata: { teksti: '#854F0B', tausta: '#fef9c3' },
  satakaksi: { teksti: '#3B6D11', tausta: '#dcfce7' },
} as const

/**
 * Automaattisen uudelleenhaun ikäraja ja jäähy, minuutteina.
 *
 * Puoli minuuttia on lyhyt tarkoituksella: tämän sivun lähde on taulukko jota
 * **ihminen juuri muokkasi ja jonka tuloksen hän haluaa nähdä heti perään** —
 * sama kriteeri jolla RJ-Mobin hubipaneeli sai oman automaattihakunsa. Jäähy
 * estää silti silmukan, jos Drive-haku kaatuu ja välilehti vilkkuu esiin ja
 * pois.
 */
const AUTO_IKARAJA_MIN = 0.5

const th = { padding: '8px 10px', fontSize: 11, fontWeight: 500, color: '#888', textAlign: 'center' as const, borderBottom: '0.5px solid #eee', whiteSpace: 'nowrap' as const, background: '#f8f8f8' }
const thL = { ...th, textAlign: 'left' as const }
const td = { padding: '8px 10px', fontSize: 13, textAlign: 'center' as const, borderBottom: '0.5px solid #f5f5f5' }
const tdL = { ...td, textAlign: 'left' as const, fontWeight: 500 }
const kortti = { background: 'white', border: '0.5px solid #eee', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }
const korttiOtsikko = { padding: '12px 16px', borderBottom: '0.5px solid #eee' }

/**
 * Yhden mittarin solu: toteuma/tavoite, prosentti ja bonus. Väri tulee
 * portaasta eikä prosentista, jotta solun sävy ja maksettu euro kertovat
 * saman asian.
 */
function MittariSolu({ m, edellinen, edellinenTapahtuma, normalisointi }: {
  m: MittariTulos
  edellinen: number | undefined
  /** Oliko edellinen kuukausi tälle myymälälle tapahtumakuukausi. */
  edellinenTapahtuma: boolean
  /** Vain tapahtumamyymälän liittymäsolulle. */
  normalisointi: Normalisointi | null
}) {
  if (m.porras === null) {
    return (
      <td style={{ ...td, background: '#fafafa', color: '#A32D2D', fontSize: 12 }}>
        <div>{arvo(m.toteuma, m.mittari)}</div>
        <div style={{ fontSize: 11, marginTop: 2 }}>tavoite puuttuu</div>
      </td>
    )
  }
  const v = VARIT[m.porras]
  return (
    <td style={{ ...td, background: v.tausta }}>
      <div style={{ fontSize: 12 }}>
        {arvo(m.toteuma, m.mittari)} <span style={{ color: '#999' }}>/ {arvo(m.tavoite ?? 0, m.mittari)}</span>
      </div>
      <div style={{ fontSize: 12, color: v.teksti, fontWeight: 600, marginTop: 2 }}>
        {fmt(m.pct ?? 0, 1)} % · {fmt(m.bonus)} €
      </div>
      {normalisointi && (
        <div style={{ fontSize: 10, color: normalisointi.mitattu ? '#555' : '#854F0B', marginTop: 2 }}>
          {normalisointi.mitattu
            ? `ilman tapahtumaa ${arvo(normalisointi.arvo, m.mittari)}`
            : 'ilman tapahtumaa: ei tiedossa'}
        </div>
      )}
      {edellinen !== undefined && (
        <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>
          ed. kk {arvo(edellinen, m.mittari)}{edellinenTapahtuma ? ' (tapahtumakuukausi)' : ''}
        </div>
      )}
    </td>
  )
}

export default function BonusPage() {
  const [files, setFiles] = useState<DriveFile[]>([])
  const [selectedFile, setSelectedFile] = useState('')
  const [stores, setStores] = useState<Record<string, StoreRow>>({})
  const [edelliset, setEdelliset] = useState<Partial<Record<Myymala, MyymalaToteuma>>>({})
  const [kuukausi, setKuukausi] = useState('')
  const [tavoiteHaku, setTavoiteHaku] = useState<TavoiteHaku | null>(null)
  // Kasvava leima joka pakottaa haun uusiksi ja ohittaa reittien CDN-välimuistin.
  const [paivitys, setPaivitys] = useState(0)
  const viimeHaku = useRef<number | null>(null)
  const viimeAutomaatti = useRef<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/files').then(r => r.json()).then(d => {
      const sheets = ((d.files ?? []).filter((f: DriveFile) => f.mimeType === 'application/vnd.google-apps.spreadsheet'))
        .sort((a: DriveFile, b: DriveFile) => parsePrefix(b.name) - parsePrefix(a.name))
      setFiles(sheets)
      if (sheets.length > 0) setSelectedFile(sheets[0].id)
    }).catch(() => setError('Tiedostolistan haku epäonnistui'))
  }, [])

  useEffect(() => {
    if (!selectedFile) return
    setLoading(true); setError(''); setEdelliset({})

    // `t`-parametri ohittaa reitin `s-maxage`-välimuistin kun haku on pyydetty
    // uudelleen: muuten juuri tallennettu taulukkomuutos ei näkyisi viiteen
    // minuuttiin, eikä nappi tekisi mitään näkyvää.
    const tuore = paivitys > 0 ? `&t=${paivitys}` : ''
    fetch(`/api/sheets?fileId=${selectedFile}${tuore}`)
      .then(r => r.json())
      .then((d: DashData) => {
        if (d.error) { setError(d.error); setStores({}); return }
        setStores(d.stores ?? {})
        setKuukausi(d.kuukausi ?? '')
      })
      .catch(() => setError('Myyntiseurannan haku epäonnistui'))
      .finally(() => { setLoading(false); viimeHaku.current = Date.now() })

    // Edellisen kuun toteuma on vertailuluku, ei laskennan syöte: epäonnistunut
    // haku jättää sen näyttämättä eikä kaada sivua.
    const idx = files.findIndex(f => f.id === selectedFile)
    const edellinen = idx >= 0 ? files[idx + 1] : undefined
    if (edellinen) {
      fetch(`/api/sheets?fileId=${edellinen.id}${tuore}`)
        .then(r => r.json())
        .then((d: DashData) => { if (!d.error && d.stores) setEdelliset(toteumatMyymalataulukosta(d.stores)) })
        .catch(() => {})
    }
  }, [selectedFile, files, paivitys])

  const valittu = files.find(f => f.id === selectedFile)
  const order = valittu ? parsePrefix(valittu.name) : 0
  const voimassa = bonusmalliVoimassa(order || null)
  // Lukittu koodikopio on varalähde siihen asti kun reitin vastaus saapuu, jotta
  // luvut eivät välähdä tyhjinä jokaisella kuukauden vaihdolla.
  const tavoitteet = tavoiteHaku?.tavoitteet ?? tavoitteetKuukaudelle(order)

  /**
   * Tavoitteet reitin kautta, koska Drive-taulukko on palvelinpuolen lähde.
   * Epäonnistunut haku ei tyhjennä näkymää — reitti pudottaa lähteeksi lukitun
   * kopion ja kertoo virheestä varoituksena.
   */
  useEffect(() => {
    setTavoiteHaku(null)
    if (!order || !bonusmalliVoimassa(order)) return
    let peruttu = false
    fetch(`/api/bonus-tavoitteet?kuukausi=${order}${paivitys > 0 ? `&t=${paivitys}` : ''}`)
      .then(r => r.json())
      .then((d: TavoiteHaku & { error?: string }) => {
        if (peruttu || d.error) return
        setTavoiteHaku(d)
      })
      .catch(() => {})
    return () => { peruttu = true }
  }, [order, paivitys])

  /**
   * Haku uusiksi kun välilehti palaa esiin. Taulukon muokkaus tapahtuu toisessa
   * välilehdessä, joten paluu tähän on juuri se hetki jolloin uusi luku
   * halutaan nähdä — ilman tätä sivu näyttäisi avaushetken lukuja niin kauan
   * kuin se pysyy auki.
   */
  useEffect(() => {
    const tarkista = () => {
      const nyt = Date.now()
      if (!saakoAjaaAutomaattisesti({
        nyt,
        ikarajaMin: AUTO_IKARAJA_MIN,
        fetchedAt: viimeHaku.current,
        edellinenAutomaatti: viimeAutomaatti.current,
        nakyvissa: document.visibilityState === 'visible',
      })) return
      viimeAutomaatti.current = nyt
      setPaivitys(nyt)
    }
    document.addEventListener('visibilitychange', tarkista)
    window.addEventListener('focus', tarkista)
    return () => {
      document.removeEventListener('visibilitychange', tarkista)
      window.removeEventListener('focus', tarkista)
    }
  }, [])

  const toteumat = toteumatMyymalataulukosta(stores)
  const kk = laskeKuukaudenBonukset(order, tavoitteet, toteumat)
  const muutokset = tavoiteHaku?.historia ?? []

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px 40px' }}>
      <RjMobNav />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: '16px 0' }}>
        <select
          value={selectedFile}
          onChange={e => setSelectedFile(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '0.5px solid #ddd', fontSize: 13, background: 'white' }}
        >
          {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button
          onClick={() => setPaivitys(Date.now())}
          disabled={loading}
          style={{
            padding: '8px 14px', borderRadius: 8, border: '0.5px solid #ddd', fontSize: 13,
            background: 'white', color: '#555', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1,
          }}
        >
          Päivitä
        </button>
        {loading && <span style={{ fontSize: 12, color: '#888' }}>Ladataan…</span>}
        {kuukausi && !loading && <span style={{ fontSize: 12, color: '#888' }}>{kuukausi}</span>}
      </div>

      {error && (
        <div style={{ ...kortti, padding: 16, color: '#A32D2D', fontSize: 13 }}>{error}</div>
      )}

      {!voimassa && order > 0 && (
        <div style={{ ...kortti, padding: 16, fontSize: 13, color: '#854F0B', background: '#fef9c3' }}>
          <strong>{kuukausiNimi(order)}</strong> lasketaan vanhalla päällikkömallilla — uusi
          myymäläpäällikköbonus on voimassa {kuukausiNimi(BONUSMALLI_ALKAA)}sta alkaen.
          Vanhoja kuukausia ei lasketa uudelleen tällä mallilla.
        </div>
      )}

      {!tavoitteet && voimassa && (
        <div style={{ ...kortti, padding: 16, fontSize: 13, color: '#A32D2D', background: '#fee2e2' }}>
          Kuukaudelle <strong>{kuukausiNimi(order)}</strong> ei ole lukittuja tavoitteita.
          Jokaisen mittarin bonus on 0 € — tavoitetta ei arvata eikä edellisen kuun
          lukua käytetä.
        </div>
      )}

      {voimassa && (
        <>
          <div style={kortti}>
            <div style={korttiOtsikko}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Myymäläpäällikköbonus · {kuukausiNimi(order)}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                Kolme mittaria maksavat itsenäisesti. Alle {PORRAS_SATA} % ei maksa mitään,
                {' '}{PORRAS_SATA}–{PORRAS_SATAKAKSI - 0.1} % pienen summan ja {PORRAS_SATAKAKSI} % tai yli ison —
                yli {PORRAS_SATAKAKSI} % ei maksa enempää.
                {tavoitteet && ` Tavoitteet ${onLukittu(order) ? 'lukittu' : 'ei vielä lukittu'}.`}
                {tavoiteHaku && ` ${LAHDE_TEKSTI[tavoiteHaku.lahde]}${tavoiteHaku.tiedosto ? ` (${tavoiteHaku.tiedosto})` : ''}.`}
                {tavoiteHaku?.jaadytetty && ` Jäädytetty ${tavoiteHaku.jaadytetty.slice(0, 10)}.`}
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thL}>Myymälä</th>
                    <th style={th}>Taso</th>
                    <th style={thL}>Päällikkö</th>
                    {MITTARIT.map(m => <th key={m} style={th}>{MITTARI_NIMI[m]}</th>)}
                    <th style={th}>Yhteensä</th>
                    <th style={th}>Maksetaan</th>
                  </tr>
                </thead>
                <tbody>
                  {kk.myymalat.map(b => {
                    const ed = edelliset[b.myymala]
                    const tavoite = tavoitteet?.[b.myymala]
                    const tapahtuma = (tavoite?.tapahtumaLiittymat ?? 0) > 0
                    const edTapahtuma = onTapahtumakuukausi(ansaintakuukausi(order), b.myymala)
                    return (
                      <tr key={b.myymala}>
                        <td style={tdL}>{b.myymala}</td>
                        <td style={{ ...td, color: '#888', fontSize: 12 }}>{b.taso}</td>
                        <td style={{ ...tdL, fontWeight: 400, fontSize: 12 }}>{b.paallikko}</td>
                        {b.mittarit.map(m => (
                          <MittariSolu
                            key={m.mittari}
                            m={m}
                            edellinen={ed ? ed[m.mittari] : undefined}
                            edellinenTapahtuma={edTapahtuma}
                            normalisointi={tapahtuma && m.mittari === 'liittymat'
                              ? normalisoiToteuma(m.toteuma, tavoite)
                              : null}
                          />
                        ))}
                        <td style={{ ...td, fontWeight: 600 }}>
                          {fmt(b.teoreettinen)} €
                          <div style={{ fontSize: 10, color: '#aaa', fontWeight: 400, marginTop: 2 }}>
                            max {fmt(tasonMaksimi(b.taso))} €
                          </div>
                        </td>
                        <td style={{ ...td, fontWeight: 600, color: b.maksetaan ? '#111' : '#aaa' }}>
                          {b.maksetaan ? `${fmt(b.maksettava)} €` : '—'}
                          {!b.maksetaan && (
                            <div style={{ fontSize: 10, color: '#aaa', fontWeight: 400, marginTop: 2 }}>omistaja</div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  <tr style={{ background: '#fafafa' }}>
                    <td style={{ ...tdL, fontWeight: 600 }} colSpan={3}>Yhteensä</td>
                    {MITTARIT.map(m => (
                      <td key={m} style={{ ...td, color: '#888', fontSize: 12 }}>
                        {fmt(kk.myymalat.filter(b => b.maksetaan).reduce((s, b) => s + (b.mittarit.find(x => x.mittari === m)?.bonus ?? 0), 0))} €
                      </td>
                    ))}
                    <td style={td} />
                    <td style={{ ...td, fontWeight: 700 }}>{fmt(kk.maksettavaYhteensa)} €</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {tavoiteHaku && tavoiteHaku.varoitukset.length > 0 && (
            <div style={{ ...kortti, padding: '12px 16px', fontSize: 13, color: '#854F0B', background: '#fef9c3' }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Tavoitteista huomautettavaa</div>
              {tavoiteHaku.varoitukset.map((v, i) => <div key={i} style={{ marginBottom: 3 }}>· {v}</div>)}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div style={{ ...kortti, marginBottom: 0, padding: 16 }}>
              <div style={{ fontSize: 11, color: '#888' }}>Maksettava yhteensä</div>
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{fmt(kk.maksettavaYhteensa)} €</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                {fmt(kk.maksimi > 0 ? (kk.maksettavaYhteensa / kk.maksimi) * 100 : 0)} % maksimista ({fmt(kk.maksimi)} €)
              </div>
            </div>
            <div style={{ ...kortti, marginBottom: 0, padding: 16 }}>
              <div style={{ fontSize: 11, color: '#888' }}>Kulu sivukuluineen</div>
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{fmt(kk.kuluYhteensa, 2)} €</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>kerroin 1,35</div>
            </div>
            <div style={{ ...kortti, marginBottom: 0, padding: 16 }}>
              <div style={{ fontSize: 11, color: '#888' }}>Kirjautuu kuluksi</div>
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{kuukausiNimi(kk.maksuOrder)}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                maksukuukaudelle, ei ansaintakuukaudelle
              </div>
            </div>
          </div>

          {tavoitteet && MYYMALAT.some(m => (tavoitteet[m.myymala]?.tapahtumaLiittymat ?? 0) > 0) && (
            <div style={kortti}>
              <div style={korttiOtsikko}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Tapahtumat</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                  Bonus lasketaan aina koko lukitusta tavoitetta vasten — normalisoitu luku
                  kertoo vain mistä iso liittymämäärä tulee, jottei tapahtumakuukautta
                  verrata arkikuukauteen suoraan. Toteuman normalisointi vaatii että
                  tapahtuman <strong>toteutunut</strong> myynti on kirjattu tavoitetaulukkoon
                  sarakkeeseen &quot;Tapahtuma toteuma&quot;: tapahtuman tavoitteen vähentäminen
                  olettaisi tapahtuman osuneen suunnitelmaansa, ja juuri sen selvittämiseksi
                  luku katsotaan.
                </div>
              </div>
              <div style={{ padding: '12px 16px', fontSize: 13 }}>
                {MYYMALAT.filter(m => (tavoitteet[m.myymala]?.tapahtumaLiittymat ?? 0) > 0).map(m => {
                  const t = tavoitteet[m.myymala]!
                  return (
                    <div key={m.myymala} style={{ marginBottom: 6 }}>
                      <strong>{m.myymala}</strong>: tavoite {fmt(t.liittymat ?? 0)} kpl, josta
                      {' '}{fmt(t.tapahtumaLiittymat ?? 0)} kpl tapahtumasta →
                      normaali myymälämyynti {fmt(tavoiteIlmanTapahtumaa(t) ?? 0)} kpl
                      {t.tapahtumaToteuma !== undefined
                        ? ` · tapahtuma toteutui ${fmt(t.tapahtumaToteuma)} kpl`
                        : ' · tapahtuman toteumaa ei ole kirjattu'}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {muutokset.length > 0 && (
            <div style={kortti}>
              <div style={korttiOtsikko}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Tavoitteen muutokset jäädytyksen jälkeen</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                  Drive-taulukkoa on muutettu kuukauden alkamisen jälkeen. Bonus lasketaan yhä
                  jäädytetystä tavoitteesta — muutos on kirjattu tähän eikä otettu käyttöön.
                </div>
              </div>
              <div style={{ padding: '12px 16px', fontSize: 13 }}>
                {muutokset.map((m, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>{muutosTeksti(m)}</div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
