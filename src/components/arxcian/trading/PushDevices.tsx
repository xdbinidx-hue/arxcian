'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Panel } from '@/components/arxcian/Panel'
import { timeAgo } from '@/lib/arxcian/time'
import {
  currentSubscription,
  pushSupported,
  subscribeThisDevice,
  unsubscribeThisDevice,
} from '@/lib/arxcian/push/client'
// Vain tyyppinä: `import type` katoaa käännöksessä, joten `web-push` ei
// päädy selainniputukseen. Käsin kopioitu unioni ajautuisi erilleen juuri
// siinä kohtaa jossa avaintilan väärä tulkinta maksaa eniten.
import type { KeyState, VapidKeyCheck } from '@/lib/arxcian/push/send'

type Device = {
  endpoint: string
  label: string
  createdAt?: number
  lastSentAt?: number | null
  avainTila?: KeyState
}

type Diag = {
  avainpari: VapidKeyCheck
  subject: { arvo: string | null; kelpaa: boolean }
  sendUrl: string
  jonossa: { yhteensa: number; tulevat: number }
  qstash: { ok: boolean; error?: string }
  env: Record<string, boolean>
}

/**
 * Push-laitteiden hallinta.
 *
 * Oma paneelinsa eikä osa ilmoitusasetuksia, koska kyse on eri asiasta:
 * asetukset ovat käyttäjäkohtaisia ja koskevat kaikkia laitteita, tilaus on
 * laitekohtainen. Sama lista näyttää molemmat puhelimen ja koneen, ja
 * "tällä laitteella" -tila on vain yksi rivi siitä listasta.
 *
 * Kaikki tila haetaan rajapinnasta eikä tulla propseina: paneeli on
 * Trading-sivulla mutta koskee laitetta, ja palvelimella renderöity tilanne
 * olisi väärä heti kun toisella laitteella tehdään muutos.
 */
export function PushDevices() {
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [diag, setDiag] = useState<Diag | null>(null)

  // Automaattinen uudelleenliitos yritetään korkeintaan kerran latausta
  // kohti: jos tilaus ei onnistu, uudelleenyritys joka renderöinnillä olisi
  // silmukka jossa selain kysyy lupaa loputtomiin.
  const korjattu = useRef(false)

  /**
   * Laitelista palvelimelta ja tämän laitteen tilaus selaimesta.
   *
   * Molemmat samassa funktiossa, koska ne muuttuvat aina yhdessä: palvelin
   * tietää mitä laitteita on olemassa, mutta vain selain tietää kumpi niistä
   * on tämä. Erikseen haettuina kesken jäänyt uudelleentilaus jättäisi
   * näkymän tilaan jossa laite on listalla mutta selain ei tunne sitä.
   */
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/arxcian/push/subscribe')
      const data = await res.json()
      // Tilaa ei saa päivittää epäonnistuneesta vastauksesta: vanhentunut
      // istunto vastaa 401:llä, jolloin tyhjä `devices` näyttäisi siltä että
      // laitteet on poistettu ja puuttuva `publicKey` siltä että push on
      // konfiguroimatta. Kumpikin on väärä syy oikeaan oireeseen.
      if (!res.ok) throw new Error(data.error ?? 'Laitelistan haku epäonnistui.')

      setPublicKey(data.publicKey ?? null)
      setDevices(data.devices ?? [])
      // Onnistunut haku kumoaa aiemman virheen: muuten yksi ohimenevä
      // verkkokatko jäisi näkyviin ja peittäisi myöhemmän ilmoituksen,
      // koska näkymä näyttää virheen ilmoituksen sijaan.
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Laitelistan haku epäonnistui.')
    }

    // Omassa suojassaan, ei `finally`-lohkossa: `getRegistration` ja
    // `getSubscription` voivat hylätä, ja hylkäys `finally`ssä jättäisi
    // `setLoading(false)`:n ajamatta ja vuotaisi kutsujalle — jolloin
    // onnistunut tilaus näyttäisi epäonnistuneelta. Väärä virheviesti maksaa
    // saman kuin itse vika.
    try {
      setThisEndpoint((await currentSubscription())?.endpoint ?? null)
    } catch {
      setThisEndpoint(null)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const thisDevice = devices.find(d => d.endpoint === thisEndpoint) ?? null
  const enabledHere = Boolean(thisDevice)
  // Kolme tilaa luetaan nimeltä eikä poissulkemalla `nykyinen`: puuttuva
  // kenttä tarkoittaa "palvelin ei kertonut" — vanha versio uutta vasten tai
  // päinvastoin — eikä sitä saa tulkita vanhentuneeksi avaimeksi, koska
  // silloin jokainen sivun avaus tekisi turhan uudelleentilauskierroksen.
  const vanhentunut = thisDevice?.avainTila === 'vanha' || thisDevice?.avainTila === 'tuntematon'

  /**
   * Tilaa tämän laitteen — myös silloin kun selaimessa on jo tilaus.
   *
   * **Vanha tilaus perutaan aina**, ei vain kun palvelin kertoo sen olevan
   * vanhentunut: `pushManager.subscribe` hylkää uuden `applicationServerKey`n
   * `InvalidStateError`illa jos tilaus on jo voimassa toisella avaimella.
   * Ehdollinen peruutus jättäisi umpikujan, jossa palvelin on jo poistanut
   * rivin mutta selaimen tilaus elää — silloin listalla ei näy mitään
   * korjattavaa eikä "ota käyttöön" toimisi.
   *
   * Peruutettava päätepiste luetaan selaimesta eikä tilasta, koska se on
   * ainoa lähde joka tietää mitä siellä oikeasti on.
   */
  const liita = useCallback(
    async (avain: string) => {
      const edellinen = (await currentSubscription())?.endpoint ?? null
      if (edellinen) await unsubscribeThisDevice()

      const subscription = await subscribeThisDevice(avain)
      const res = await fetch('/api/arxcian/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Tallennus epäonnistui')

      // Uusi tilaus voi saada uuden päätepisteen, jolloin vanha rivi jäisi
      // listalle kuolleena ja jokainen lähetys epäonnistuisi siihen.
      if (edellinen && edellinen !== subscription.endpoint) {
        await fetch(`/api/arxcian/push/subscribe?endpoint=${encodeURIComponent(edellinen)}`, {
          method: 'DELETE',
        })
      }

      await refresh()
    },
    [refresh],
  )

  const enable = async () => {
    setError(null)
    setNotice(null)
    if (!publicKey) {
      return setError('VAPID-avain puuttuu palvelimelta — push ei ole vielä konfiguroitu.')
    }

    setBusy(true)
    try {
      await liita(publicKey)
      setNotice(enabledHere ? 'Laite liitettiin uudelleen.' : 'Laite lisätty.')
    } catch (e) {
      // Lista haetaan ennen virheen asettamista: vanha tilaus on jo peruttu,
      // joten näkymä olisi muuten väärässä — ja onnistunut haku nollaa
      // virheen, joten järjestys toisin päin pyyhkisi juuri asetetun viestin.
      await refresh()
      setError(e instanceof Error ? e.message : 'Tilaus epäonnistui.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Vanhaan avaimeen sidottu tilaus uusitaan itsestään.
   *
   * Ilmoituslupa on jo annettu eikä se liity VAPID-avaimeen, joten selain ei
   * kysy mitään — käyttäjän ei siis tarvitse tietää avaimista mitään eikä
   * poistaa ja antaa ilmoituslupia uudelleen. Riittää että sivu avataan.
   */
  useEffect(() => {
    if (korjattu.current || loading || busy) return
    if (!publicKey || !thisEndpoint || !vanhentunut) return

    korjattu.current = true
    setBusy(true)
    // Syy luetaan ennen liitosta: `refresh` päivittää tilan `nykyinen`ksi,
    // jolloin jälkikäteen luettuna kerrottaisiin väärä syy. Ja ne ovat eri
    // syyt — `vanha` on kirjattu ero nykyiseen avaimeen, `tuntematon` on
    // kirjaamaton rivi. Vain toinen tarkoittaa että avain oli väärä.
    const syy =
      thisDevice?.avainTila === 'vanha'
        ? 'oli tehty vanhalla avaimella'
        : 'oli tallennettu ennen kuin avain alettiin kirjata'

    void (async () => {
      try {
        await liita(publicKey)
        setNotice(`Tämän laitteen tilaus ${syy} — laite liitettiin uudelleen.`)
      } catch (e) {
        // Sama järjestys kuin `enable`ssä: haku ensin, viesti sen jälkeen.
        await refresh()
        setError(
          `Laitteen automaattinen uudelleenliitos epäonnistui: ${
            e instanceof Error ? e.message : 'tuntematon syy'
          }. Paina "Ota käyttöön tällä laitteella".`,
        )
      } finally {
        setBusy(false)
      }
    })()
  }, [busy, liita, loading, publicKey, refresh, thisDevice, thisEndpoint, vanhentunut])

  const remove = async (endpoint: string) => {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      // Jos poistettava on tämä laite, selaimen tilaus perutaan myös — muuten
      // seuraava "ota käyttöön" palauttaisi saman endpointin kysymättä lupaa,
      // ja käyttäjä luulisi ettei painike tee mitään.
      if (endpoint === thisEndpoint) {
        await unsubscribeThisDevice()
        setThisEndpoint(null)
      }
      await fetch(`/api/arxcian/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, {
        method: 'DELETE',
      })
      await refresh()
    } catch {
      setError('Poisto epäonnistui.')
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const res = await fetch('/api/arxcian/push/test', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        // Kuolleet tilaukset poistettiin vaikka lähetys epäonnistui, joten
        // lista on haettava uudelleen myös virhehaarassa. `prunedStale` ei voi
        // tänne osua: se edellyttää onnistunutta lähetystä samaan palveluun.
        if (data.result?.pruned) await refresh()
        return setError(data.error ?? 'Testi epäonnistui.')
      }

      const { delivered, pruned, prunedStale, failed } = data.result
      setNotice(
        `Lähetetty ${delivered} laitteelle` +
          (pruned ? `, ${pruned} kuollutta poistettu` : '') +
          (prunedStale ? `, ${prunedStale} vanhalla avaimella poistettu` : '') +
          (failed ? `, ${failed} epäonnistui` : '') +
          '.',
      )
      if (pruned || prunedStale || failed) await refresh()
    } catch {
      setError('Testi epäonnistui.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Diagnostiikka samasta lähteestä kuin reitti.
   *
   * Näytetään käyttöliittymässä eikä jätetä pelkäksi JSONiksi, koska
   * puhelimella reitin avaaminen käsin on juuri se este jonka takia vika jää
   * toteamatta silloin kun se on ajankohtainen.
   */
  const haeDiag = async () => {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/arxcian/push/diag')
      const data = await res.json()
      if (!res.ok) return setError(data.error ?? 'Diagnostiikka epäonnistui.')
      setDiag(data)
    } catch {
      setError('Diagnostiikka epäonnistui.')
    } finally {
      setBusy(false)
    }
  }

  const supported = pushSupported()

  return (
    <Panel title="Push-laitteet" meta={loading ? '…' : `${devices.length} kpl`}>
      {!supported ? (
        <p className="text-[11px] leading-relaxed text-ax-faint">
          Tämä selain ei tue push-ilmoituksia. iPhonella arxcian on lisättävä kotiruudulle (Jaa →
          Lisää Koti-valikkoon), minkä jälkeen ilmoitukset toimivat.
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              onClick={enable}
              disabled={busy || (enabledHere && !vanhentunut)}
              className="rounded-md bg-ax-accent/15 px-3 py-1.5 text-[12px] font-medium text-ax-accent transition-colors hover:bg-ax-accent/25 disabled:opacity-40"
            >
              {vanhentunut
                ? 'Liitä tämä laite uudelleen'
                : enabledHere
                  ? 'Tämä laite on käytössä'
                  : 'Ota käyttöön tällä laitteella'}
            </button>
            <button
              onClick={test}
              disabled={busy || devices.length === 0}
              className="rounded-md border border-ax-line px-3 py-1.5 text-[12px] text-ax-dim transition-colors hover:border-ax-line-strong hover:text-ax-text disabled:opacity-40"
            >
              Testaa push
            </button>
            <button
              onClick={haeDiag}
              disabled={busy}
              className="rounded-md border border-ax-line px-3 py-1.5 text-[12px] text-ax-dim transition-colors hover:border-ax-line-strong hover:text-ax-text disabled:opacity-40"
            >
              Diagnostiikka
            </button>
          </div>

          {devices.length === 0 ? (
            <p className="py-3 text-center text-[13px] text-ax-faint">
              Ei laitteita. Push tavoittaa vasta kun tämä on tehty vähintään yhdellä laitteella.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {devices.map(device => (
                <li
                  key={device.endpoint}
                  className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
                    device.endpoint === thisEndpoint ? 'border-ax-accent/40 bg-ax-accent/5' : 'border-ax-line'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      device.endpoint === thisEndpoint ? 'ax-pulse bg-ax-up' : 'bg-ax-faint'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] text-ax-text">
                      {device.label}
                      {device.endpoint === thisEndpoint && (
                        <span className="ml-1.5 text-[10px] text-ax-accent">tämä laite</span>
                      )}
                      {device.avainTila && device.avainTila !== 'nykyinen' && (
                        <span className="ml-1.5 text-[10px] text-ax-down">
                          {device.avainTila === 'vanha' ? 'vanha avain' : 'avain tuntematon'}
                        </span>
                      )}
                    </div>
                    <div className="truncate font-mono text-[10px] text-ax-faint">
                      {device.lastSentAt ? `viimeksi ${timeAgo(device.lastSentAt)}` : 'ei vielä lähetyksiä'}
                    </div>
                  </div>
                  <button
                    onClick={() => remove(device.endpoint)}
                    disabled={busy}
                    className="shrink-0 text-[10px] text-ax-faint transition-colors hover:text-ax-down disabled:opacity-40"
                  >
                    Poista
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {(error || notice) && (
        <p className={`mt-3 text-[11px] leading-relaxed ${error ? 'text-ax-down' : 'text-ax-up'}`}>
          {error ?? notice}
        </p>
      )}

      {diag && (
        <dl className="mt-3 space-y-1 rounded-md border border-ax-line px-3 py-2 font-mono text-[10px] text-ax-dim">
          <DiagRivi
            nimi="VAPID-avainpari"
            arvo={diag.avainpari}
            hyva={diag.avainpari === 'eheä'}
          />
          <DiagRivi
            nimi="subject"
            arvo={diag.subject.kelpaa ? (diag.subject.arvo ?? '—') : 'ei kelpaa'}
            hyva={diag.subject.kelpaa}
          />
          <DiagRivi
            nimi="QStash"
            arvo={diag.qstash.ok ? 'vastaa' : (diag.qstash.error ?? 'ei vastaa')}
            hyva={diag.qstash.ok}
          />
          <DiagRivi
            nimi="jonossa"
            arvo={`${diag.jonossa.tulevat} tulevaa / ${diag.jonossa.yhteensa}`}
            hyva={diag.jonossa.tulevat > 0}
          />
          <DiagRivi nimi="lähetysosoite" arvo={diag.sendUrl} hyva={diag.sendUrl.startsWith('https://')} />
        </dl>
      )}

      {/* Yksi rajoitus jota käyttäjä ei voi päätellä puuttuvasta
          ilmoituksesta: kehityksessä service workeria ei rekisteröidä
          lainkaan, joten push ei toimi paikallisesti. */}
      <p className="mt-3 text-[10px] leading-relaxed text-ax-faint">
        Push toimii vain tuotantoversiossa — kehityspalvelimella service workeria ei rekisteröidä.
        Vanhalla VAPID-avaimella tehty tilaus uusitaan automaattisesti kun tämä sivu avataan.
      </p>
    </Panel>
  )
}

function DiagRivi({ nimi, arvo, hyva }: { nimi: string; arvo: string; hyva: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-ax-faint">{nimi}</dt>
      <dd className={`min-w-0 flex-1 truncate text-right ${hyva ? 'text-ax-up' : 'text-ax-down'}`}>
        {arvo}
      </dd>
    </div>
  )
}
