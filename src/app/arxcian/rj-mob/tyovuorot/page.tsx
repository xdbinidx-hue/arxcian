'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DayInfo, Shift, StoreName, ShiftPlace, STORES, STORE_COLORS, STORE_SOLO_COLORS,
  EVENT_PLACE, EVENT_COLOR, PLACE_LETTER, onTapahtuma,
  ROSTER_COLUMNS, MANAGER_NAMES, hoursBetween, laskeVajeet, laskeTunnit,
} from '@/lib/shiftSchedule'
// Sama poissaolosääntö kuin Drive-lukijalla. Kirjoitus- ja lukupää eivät saa
// erota: solu jonka arxcian tallentaa poissaoloksi on luettava takaisin
// poissaolona seuraavassa generoinnissa.
import { onPoissaolo } from '@/lib/shifts/tyovuoroExcel'
import { RjMobNav } from '@/components/rjmob/RjMobNav'

const WEEKDAY_SHORT = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la']
const KUUKAUDET = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu',
  'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu']

type Tila = 'draft' | 'final'
type Lahde = { nimi?: string; mimeType?: string; muokattu?: string; valilehti?: string }

function fmtTime(t: string): string {
  return t.endsWith(':00') ? t.slice(0, -3) : t.replace(':', '.')
}

function dateLabel(day: DayInfo): string {
  const [, kk, pp] = day.date.split('-')
  return `${WEEKDAY_SHORT[day.weekday]} ${Number(pp)}.${Number(kk)}.`
}

function kuukausiOtsikko(month: string): string {
  const [v, kk] = month.split('-').map(Number)
  return `${KUUKAUDET[kk - 1][0].toUpperCase()}${KUUKAUDET[kk - 1].slice(1)} ${v}`
}

/** Kuukausivaihtoehdot: kuluva kuukausi ja kuusi seuraavaa. */
function kuukausiVaihtoehdot(): string[] {
  const nyt = new Date()
  const out: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(nyt.getFullYear(), nyt.getMonth() + i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

/** "10-16", "10.00-16.00" tai "10:00-16:00" → { start, end }. */
function parsiAika(teksti: string): { start: string; end: string } | null {
  const m = teksti.trim().match(/^(\d{1,2})([.:](\d{2}))?\s*[-–—]\s*(\d{1,2})([.:](\d{2}))?$/)
  if (!m) return null
  const start = `${m[1].padStart(2, '0')}:${m[3] ?? '00'}`
  const end = `${m[4].padStart(2, '0')}:${m[6] ?? '00'}`
  if (Number(m[1]) > 23 || Number(m[4]) > 23) return null
  if (hoursBetween(start, end) <= 0) return null
  return { start, end }
}

const td = {
  padding: '4px 5px', fontSize: 10, textAlign: 'center' as const,
  borderBottom: '0.5px solid #f0f0f0',
}
const lastTd = { ...td, borderRight: '1px solid #eee' }

/** Solun taustaväri: soolovuoro kirkkaalla, muuten myymälän oma sävy. */
function shiftColor(shift: Shift): string {
  if (onTapahtuma(shift.store)) return EVENT_COLOR
  return shift.solo ? STORE_SOLO_COLORS[shift.store] : STORE_COLORS[shift.store]
}

function ShiftCells({
  seller, day, muokattava, onEdit,
}: {
  seller: string; day: DayInfo; muokattava: boolean
  onEdit: (date: string, seller: string) => void
}) {
  const absence = day.absences[seller]
  const shift = day.shifts.find(s => s.seller === seller)
  const klikki = muokattava ? () => onEdit(day.date, seller) : undefined
  const cursor = muokattava ? 'pointer' : 'default'

  // Suljettu päivä (sunnuntai) on tyhjä muttei lukittu: tapahtuma tai
  // erikoisaukiolo voi vaatia vuoron, ja sen pitää olla merkittävissä käsin.
  // Generaattori ei koskaan sijoita sunnuntaille mitään, joten merkintä on
  // aina tietoinen. Rivi pysyy punasävyisenä, jotta poikkeus erottuu
  // normaalipäivästä — ja jos vuoro on merkitty, se näytetään kuten muutkin.
  if (day.closed && !shift) {
    return (
      <>
        <td onClick={klikki}
          title={muokattava ? 'Suljettu — klikkaa jos vuoro silti tarvitaan' : undefined}
          style={{ ...td, background: '#fef2f2', color: '#e5b4b4', cursor }}>—</td>
        <td style={{ ...td, background: '#fef2f2' }}></td>
        <td style={{ ...lastTd, background: '#fef2f2' }}></td>
      </>
    )
  }

  // Poissaolo näytetään vaikka vuoro olisi jostain syystä olemassa —
  // ristiriita on silloin näytettävä, ei piilotettava.
  if (absence && !shift) {
    return (
      <>
        <td onClick={klikki} style={{ ...td, background: '#f3f4f6', color: '#999', fontStyle: 'italic', cursor }}>{absence}</td>
        <td style={{ ...td, background: '#f3f4f6' }}></td>
        <td style={{ ...lastTd, background: '#f3f4f6' }}></td>
      </>
    )
  }

  if (!shift) {
    return (
      <>
        <td onClick={klikki} style={{ ...td, color: '#ddd', cursor }}>·</td>
        <td style={{ ...td, color: '#ddd' }}></td>
        <td style={{ ...lastTd, color: '#ddd' }}></td>
      </>
    )
  }

  const vari = shiftColor(shift)
  const solu = { ...td, background: vari, color: '#333', fontWeight: 500 }
  return (
    <>
      <td onClick={klikki} style={{ ...solu, whiteSpace: 'nowrap', cursor }} title={absence ? `Huom. merkitty poissaolevaksi: ${absence}` : shift.label}>
        {fmtTime(shift.start)}–{fmtTime(shift.end)}
      </td>
      <td style={solu}>{shift.hours}</td>
      <td style={{ ...solu, ...lastTd }}>{PLACE_LETTER[shift.store]}</td>
    </>
  )
}

export default function TyovuorotPage() {
  const vaihtoehdot = useMemo(kuukausiVaihtoehdot, [])
  const [month, setMonth] = useState(vaihtoehdot[0])
  const [tila, setTila] = useState<Tila>('draft')
  const [draft, setDraft] = useState<DayInfo[]>([])
  const [final, setFinal] = useState<DayInfo[]>([])
  const [lahde, setLahde] = useState<Lahde | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [ilmoitus, setIlmoitus] = useState('')
  const [muokkaus, setMuokkaus] = useState<{ date: string; seller: string } | null>(null)

  const lataa = useCallback(async () => {
    setLoading(true); setError(''); setIlmoitus(''); setLahde(null); setMuokkaus(null)
    try {
      const [d, f] = await Promise.all([
        fetch(`/api/shifts?month=${month}&tila=draft`).then(r => r.json()),
        fetch(`/api/shifts?month=${month}&tila=final`).then(r => r.json()),
      ])
      if (d.error || f.error) setError(d.error ?? f.error)
      setDraft(d.days ?? [])
      setFinal(f.days ?? [])
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }, [month])

  useEffect(() => { lataa() }, [lataa])

  const days = tila === 'draft' ? draft : final
  const vajeet = useMemo(() => laskeVajeet(days), [days])
  const { tunnit, vuorot } = useMemo(() => laskeTunnit(days), [days])

  const generoi = async () => {
    setBusy('Generoidaan...'); setError(''); setIlmoitus('')
    try {
      const res = await fetch(`/api/shifts/generoi?month=${month}`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok || d.error) { setError(d.error ?? 'Generointi epäonnistui'); setBusy(''); return }
      setDraft(d.days ?? [])
      setLahde(d.lahde ?? null)
      setTila('draft')
      setIlmoitus(`Luonnos generoitu lähteestä "${d.lahde?.nimi ?? '?'}". Vahvistettuun listaan ei koskettu.`)
    } catch (e) {
      setError(String(e))
    }
    setBusy('')
  }

  const tallennaLuonnos = async (uudet: DayInfo[]) => {
    setDraft(uudet)
    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, tila: 'draft', days: uudet }),
      })
      const d = await res.json()
      if (d.error) setError(d.error)
    } catch (e) {
      setError(String(e))
    }
  }

  /**
   * Solun tallennus. Aikakenttään kelpaa **joko kellonaikaväli tai poissaolo**
   * ("vapaa", "loma", "saikku") — ne ovat saman solun kaksi mahdollista
   * sisältöä sekä taulukossa että täällä, joten uusi arvo korvaa aina
   * molemmat. Tyhjä kenttä tyhjentää solun.
   *
   * Kumpi on kyseessä, ratkaistaan `onPoissaolo`lla eli **täsmälleen samalla
   * säännöllä jolla Drive-lukija lukee solun takaisin**. Jos päät erkanisivat,
   * tänne kirjoitettu "loma" luettaisiin seuraavassa generoinnissa joksikin
   * muuksi ja myyjä saisi vuoron poissaolostaan huolimatta.
   */
  const muokkaaSolu = (date: string, seller: string, aika: string, store: ShiftPlace | '') => {
    const teksti = aika.trim()
    const virheet: string[] = []

    const uudet = draft.map(day => {
      if (day.date !== date) return day
      const muut = day.shifts.filter(s => s.seller !== seller)
      const muutPoissa = Object.fromEntries(
        Object.entries(day.absences).filter(([nimi]) => nimi !== seller))

      if (!teksti) return { ...day, shifts: muut, absences: muutPoissa }

      if (onPoissaolo(teksti)) {
        return { ...day, shifts: muut, absences: { ...muutPoissa, [seller]: teksti } }
      }

      const parsittu = parsiAika(teksti)
      if (!parsittu) {
        // Esim. pelkkä "5" tai "10-": ei kellonaikaväli eikä poissaolo, koska
        // kirjaimia ei ole. Hiljainen ohitus jättäisi käyttäjän luulemaan että
        // merkintä meni perille.
        virheet.push(`"${teksti}" ei kelpaa: kirjoita kellonaikaväli (10-16) tai poissaolo (vapaa, loma, saikku).`)
        return day
      }
      if (!store) {
        virheet.push('Valitse myymälä (M/E/K) tai X, tai tyhjennä kenttä poistaaksesi vuoron.')
        return day
      }

      const vanha = day.shifts.find(s => s.seller === seller)
      const shift: Shift = {
        store, seller, start: parsittu.start, end: parsittu.end,
        hours: hoursBetween(parsittu.start, parsittu.end),
        label: vanha?.label ?? 'käsin',
        // Soolo on onnenpäivän myymäläkohtainen merkintä — tapahtumavuoro ei
        // voi olla soolo, ja `soloStores` sisältää vain myymälöitä.
        ...(!onTapahtuma(store) && day.soloStores.includes(store) ? { solo: true } : {}),
      }
      return { ...day, shifts: [...muut, shift], absences: muutPoissa }
    })

    if (virheet.length > 0) { setError(virheet[0]); return }
    setError('')
    tallennaLuonnos(uudet)
    setMuokkaus(null)
  }

  /** Kuiva-ajo: kertoo mitä Driveen kirjoitettaisiin kirjoittamatta mitään. */
  const kuivaAjo = async () => {
    if (draft.length === 0) { setError('Luonnos on tyhjä — generoi ensin.'); return }
    setBusy('Kuiva-ajo...'); setError(''); setIlmoitus('')
    try {
      const res = await fetch('/api/shifts/vahvista?kuiva=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, days: draft }),
      })
      const d = await res.json()
      if (!res.ok || d.error) setError(d.error ?? 'Kuiva-ajo epäonnistui')
      else setIlmoitus(`${d.viesti} Esikatselu: ${(d.drive?.esikatselu ?? []).slice(0, 3).join(' | ')}`)
    } catch (e) {
      setError(String(e))
    }
    setBusy('')
  }

  const vahvista = async () => {
    if (draft.length === 0) { setError('Luonnos on tyhjä — generoi ensin.'); return }
    if (final.length > 0
      && !confirm(`Kuukaudelle ${kuukausiOtsikko(month)} on jo vahvistettu lista. Korvataanko se luonnoksella?`)) return
    if (vajeet.length > 0
      && !confirm(`Luonnoksessa on ${vajeet.length} täyttämätöntä paikkaa. Vahvistetaanko silti?`)) return

    setBusy('Vahvistetaan...'); setError(''); setIlmoitus('')
    try {
      const res = await fetch('/api/shifts/vahvista', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, days: draft }),
      })
      const d = await res.json()
      if (!res.ok || d.error) { setError(d.error ?? 'Vahvistus epäonnistui'); setBusy(''); return }
      setFinal(draft)
      setTila('final')
      setIlmoitus(d.viesti ?? 'Vahvistettu.')
    } catch (e) {
      setError(String(e))
    }
    setBusy('')
  }

  const th = {
    padding: '6px 5px', fontSize: 10, fontWeight: 600, color: '#555',
    textAlign: 'center' as const, borderBottom: '1px solid #ddd',
    whiteSpace: 'nowrap' as const, background: '#f8f8f6',
  }

  const valilehtiTyyli = (aktiivinen: boolean) => ({
    padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
    border: 'none', borderBottom: aktiivinen ? '2px solid #185FA5' : '2px solid transparent',
    background: 'transparent', color: aktiivinen ? '#185FA5' : '#777',
  })

  return (
    <div>
      <RjMobNav activePage="/arxcian/rj-mob/tyovuorot" />
      <div style={{ maxWidth: 1500, margin: '0 auto', padding: '16px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontWeight: 500, fontSize: 16 }}>Työvuorot PK-seutu</div>
            <select value={month} onChange={e => setMonth(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '0.5px solid #ddd', fontSize: 13 }}>
              {vaihtoehdot.map(m => <option key={m} value={m}>{kuukausiOtsikko(m)}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={generoi} disabled={!!busy}
              style={{ padding: '9px 18px', borderRadius: 8, background: '#185FA5', color: 'white', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy === 'Generoidaan...' ? 'Generoidaan...' : 'Generoi luonnos'}
            </button>
            <button onClick={kuivaAjo} disabled={!!busy || draft.length === 0}
              title="Näyttää mitä Driveen kirjoitettaisiin, kirjoittamatta mitään"
              style={{ padding: '9px 14px', borderRadius: 8, background: 'white', color: '#555', border: '0.5px solid #ccc', fontSize: 13, fontWeight: 500, cursor: draft.length ? 'pointer' : 'not-allowed', opacity: busy ? 0.6 : 1 }}>
              {busy === 'Kuiva-ajo...' ? 'Tarkistetaan...' : 'Kuiva-ajo'}
            </button>
            <button onClick={vahvista} disabled={!!busy || draft.length === 0}
              style={{ padding: '9px 18px', borderRadius: 8, background: draft.length ? '#1a7f4b' : '#ccc', color: 'white', border: 'none', fontSize: 13, fontWeight: 500, cursor: draft.length ? 'pointer' : 'not-allowed', opacity: busy ? 0.6 : 1 }}>
              {busy === 'Vahvistetaan...' ? 'Vahvistetaan...' : 'Vahvista ja kirjoita Driveen'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #eee', marginBottom: 12 }}>
          <button onClick={() => { setTila('draft'); setMuokkaus(null) }} style={valilehtiTyyli(tila === 'draft')}>
            Generointi {draft.length > 0 && <span style={{ fontSize: 11, color: '#999' }}>({draft.length} pv)</span>}
          </button>
          <button onClick={() => { setTila('final'); setMuokkaus(null) }} style={valilehtiTyyli(tila === 'final')}>
            Työvuorot {final.length > 0 && <span style={{ fontSize: 11, color: '#999' }}>({final.length} pv)</span>}
          </button>
        </div>

        {error && <div style={{ background: '#FCEBEB', border: '0.5px solid #F09595', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13, color: '#A32D2D' }}><strong>Virhe:</strong> {error}</div>}
        {ilmoitus && <div style={{ background: '#EAF5EE', border: '0.5px solid #9CCFAF', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13, color: '#1a7f4b' }}>{ilmoitus}</div>}

        {lahde && tila === 'draft' && (
          <div style={{ fontSize: 11, color: '#777', marginBottom: 12 }}>
            Lähde: <strong>{lahde.nimi}</strong> · välilehti {lahde.valilehti} · tyyppi {lahde.mimeType} · muokattu {lahde.muokattu?.slice(0, 10)}
          </div>
        )}

        {/* Vaje on kerrottava näkyvästi: tyhjä solu jonka voi ohittaa
            vahingossa on vaarallisempi kuin varoitus jota ei voi ohittaa. */}
        {!loading && days.length > 0 && (
          vajeet.length > 0 ? (
            <div style={{ background: '#FFF6E5', border: '0.5px solid #E8B65A', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 12, color: '#8A5A00' }}>
              <strong>{vajeet.length} täyttämätöntä paikkaa</strong> — nämä päivät jäivät vajaiksi:
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                {vajeet.map(v => (
                  <span key={`${v.date}-${v.store}`} style={{ whiteSpace: 'nowrap' }}>
                    {WEEKDAY_SHORT[v.weekday]} {Number(v.date.slice(-2))}.{Number(v.date.slice(5, 7))}. {v.store} {v.saatu}/{v.tarve}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ background: '#EAF5EE', border: '0.5px solid #9CCFAF', borderRadius: 10, padding: 10, marginBottom: 12, fontSize: 12, color: '#1a7f4b' }}>
              Ei yhtään täyttämätöntä paikkaa.
            </div>
          )
        )}

        {!loading && days.length > 0 && (
          <div style={{ background: 'white', border: '0.5px solid #eee', borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 8 }}>Tunnit kuukaudessa</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
              {ROSTER_COLUMNS.map(seller => (
                <div key={seller} style={{ fontSize: 11, color: '#333', whiteSpace: 'nowrap' }}>
                  <span style={{ fontWeight: MANAGER_NAMES.includes(seller) ? 600 : 400 }}>{seller.split(' ')[0]}</span>
                  {' '}<strong>{tunnit[seller] ?? 0} h</strong>
                  <span style={{ color: '#999' }}> ({vuorot[seller] ?? 0})</span>
                </div>
              ))}
              <div style={{ fontSize: 11, color: '#185FA5', whiteSpace: 'nowrap' }}>
                Yhteensä <strong>{Object.values(tunnit).reduce((a, b) => a + b, 0)} h</strong>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12, flexWrap: 'wrap' }}>
          {STORES.map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: STORE_COLORS[s], display: 'inline-block' }}></span>
              {s}
            </div>
          ))}
          {STORES.map(s => (
            <div key={`op-${s}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: STORE_SOLO_COLORS[s], display: 'inline-block' }}></span>
              {s} OP
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: EVENT_COLOR, display: 'inline-block', border: '0.5px solid #ccc' }}></span>
            x — tapahtuma
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#f3f4f6', display: 'inline-block', border: '0.5px solid #ddd' }}></span>
            vapaa / loma
          </div>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 40, color: '#888', fontSize: 14 }}>Ladataan...</div>}

        {!loading && days.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: 40, color: '#888', fontSize: 14 }}>
            {tila === 'draft'
              ? 'Ei luonnosta — klikkaa "Generoi luonnos".'
              : 'Ei vahvistettua listaa tälle kuukaudelle.'}
          </div>
        )}

        {!loading && days.length > 0 && (
          <>
            {tila === 'draft' && (
              <div style={{ fontSize: 11, color: '#777', marginBottom: 6 }}>
                Klikkaa solua muokataksesi. Tyhjä aika poistaa vuoron. Muutokset tallentuvat luonnokseen automaattisesti.
              </div>
            )}
            <div style={{ background: 'white', border: '0.5px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: '#f8f8f6' }}>Pvm</th>
                      {ROSTER_COLUMNS.map(seller => (
                        <th key={seller} colSpan={3} style={{ ...th, borderRight: '1px solid #ddd' }}>{seller.split(' ')[0]}</th>
                      ))}
                      <th style={{ ...th, textAlign: 'left', minWidth: 180 }}>Tapahtumat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map(day => (
                      <tr key={day.date} style={{ background: day.closed ? '#fef2f2' : 'white' }}>
                        <td style={{ padding: '5px 8px', fontSize: 11, fontWeight: 600, color: day.closed ? '#c99' : '#333', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: day.closed ? '#fef2f2' : 'white' }}>
                          {dateLabel(day)}
                        </td>
                        {ROSTER_COLUMNS.map(seller => (
                          muokkaus && muokkaus.date === day.date && muokkaus.seller === seller ? (
                            <SoluMuokkain key={seller} day={day} seller={seller}
                              onSave={(aika, store) => muokkaaSolu(day.date, seller, aika, store)}
                              onCancel={() => setMuokkaus(null)} />
                          ) : (
                            <ShiftCells key={seller} seller={seller} day={day}
                              muokattava={tila === 'draft'}
                              onEdit={(date, s) => setMuokkaus({ date, seller: s })} />
                          )
                        ))}
                        <td style={{ padding: '5px 8px', fontSize: 10, color: '#185FA5' }}>
                          {day.note ?? ''}
                          {day.soloStores.length > 0 && (
                            <span style={{ fontWeight: 600 }}> · OP: {day.soloStores.join(', ')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  )
}

/** Yhden solun muokkain: aika tekstinä ja myymälä valintana. */
function SoluMuokkain({
  day, seller, onSave, onCancel,
}: {
  day: DayInfo; seller: string
  onSave: (aika: string, store: ShiftPlace | '') => void
  onCancel: () => void
}) {
  const nykyinen = day.shifts.find(s => s.seller === seller)
  // Vuoro ja poissaolo ovat saman solun kaksi sisältöä, joten kenttään
  // esitäytetään kumpi tahansa niistä joka solussa on.
  const nykyinenPoissa = day.absences[seller]
  const [aika, setAika] = useState(
    nykyinen ? `${fmtTime(nykyinen.start)}-${fmtTime(nykyinen.end)}` : (nykyinenPoissa ?? ''))
  const [store, setStore] = useState<ShiftPlace | ''>(nykyinen?.store ?? '')

  return (
    <td colSpan={3} style={{ ...lastTd, padding: 3, background: '#EEF5FC' }}>
      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        <input autoFocus value={aika} onChange={e => setAika(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onSave(aika, store)
            if (e.key === 'Escape') onCancel()
          }}
          placeholder="10-16 / vapaa"
          title="Kellonaikaväli (10-16) tai poissaolo (vapaa, loma, saikku). Tyhjä poistaa merkinnän."
          style={{ width: 74, fontSize: 10, padding: '2px 3px', border: '0.5px solid #bbb', borderRadius: 3 }} />
        <select value={store} onChange={e => setStore(e.target.value as ShiftPlace | '')}
          style={{ fontSize: 10, padding: '2px', border: '0.5px solid #bbb', borderRadius: 3 }}>
          <option value="">—</option>
          {STORES.map(s => <option key={s} value={s}>{PLACE_LETTER[s].toUpperCase()}</option>)}
          {/* Tapahtuma: myyjä on töissä muttei miehitä myymälää, joten
              hänen jälkeensä jäävä paikka näkyy vajeena. */}
          <option value={EVENT_PLACE}>X — tapahtuma</option>
        </select>
        <button onClick={() => onSave(aika, store)} title="Tallenna"
          style={{ fontSize: 10, padding: '2px 5px', border: 'none', borderRadius: 3, background: '#185FA5', color: 'white', cursor: 'pointer' }}>✓</button>
        <button onClick={onCancel} title="Peruuta"
          style={{ fontSize: 10, padding: '2px 5px', border: '0.5px solid #bbb', borderRadius: 3, background: 'white', cursor: 'pointer' }}>✕</button>
      </div>
    </td>
  )
}
