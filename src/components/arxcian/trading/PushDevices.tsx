'use client'

import { useCallback, useEffect, useState } from 'react'
import { Panel } from '@/components/arxcian/Panel'
import { timeAgo } from '@/lib/arxcian/time'
import {
  currentSubscription,
  pushSupported,
  subscribeThisDevice,
  unsubscribeThisDevice,
} from '@/lib/arxcian/push/client'

type Device = {
  endpoint: string
  label: string
  createdAt?: number
  lastSentAt?: number | null
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

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/arxcian/push/subscribe')
      const data = await res.json()
      setPublicKey(data.publicKey ?? null)
      setDevices(data.devices ?? [])
    } catch {
      setError('Laitelistan haku epäonnistui.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    // Selaimen oma tilaus luetaan erikseen: palvelin tietää mitä laitteita on
    // olemassa, mutta vain selain tietää kumpi niistä on tämä.
    void currentSubscription().then(sub => setThisEndpoint(sub?.endpoint ?? null))
  }, [refresh])

  const enable = async () => {
    setError(null)
    setNotice(null)
    if (!publicKey) {
      return setError('VAPID-avain puuttuu palvelimelta — push ei ole vielä konfiguroitu.')
    }

    setBusy(true)
    try {
      const subscription = await subscribeThisDevice(publicKey)
      const res = await fetch('/api/arxcian/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Tallennus epäonnistui')

      setThisEndpoint(subscription.endpoint)
      await refresh()
      setNotice('Laite lisätty.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tilaus epäonnistui.')
    } finally {
      setBusy(false)
    }
  }

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
      if (!res.ok) return setError(data.error ?? 'Testi epäonnistui.')

      const { delivered, pruned, failed } = data.result
      setNotice(
        `Lähetetty ${delivered} laitteelle` +
          (pruned ? `, ${pruned} vanhentunutta poistettu` : '') +
          (failed ? `, ${failed} epäonnistui` : '') +
          '.',
      )
      if (pruned || failed) await refresh()
    } catch {
      setError('Testi epäonnistui.')
    } finally {
      setBusy(false)
    }
  }

  const supported = pushSupported()
  const enabledHere = Boolean(thisEndpoint && devices.some(d => d.endpoint === thisEndpoint))

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
              disabled={busy || enabledHere}
              className="rounded-md bg-ax-accent/15 px-3 py-1.5 text-[12px] font-medium text-ax-accent transition-colors hover:bg-ax-accent/25 disabled:opacity-40"
            >
              {enabledHere ? 'Tämä laite on käytössä' : 'Ota käyttöön tällä laitteella'}
            </button>
            <button
              onClick={test}
              disabled={busy || devices.length === 0}
              className="rounded-md border border-ax-line px-3 py-1.5 text-[12px] text-ax-dim transition-colors hover:border-ax-line-strong hover:text-ax-text disabled:opacity-40"
            >
              Testaa push
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

      {/* Kaksi rajoitusta jotka käyttäjä ei voi päätellä puuttuvasta
          ilmoituksesta: kehityksessä service workeria ei rekisteröidä
          lainkaan, ja ajastettu lähetys ei ole vielä kytketty. */}
      <p className="mt-3 text-[10px] leading-relaxed text-ax-faint">
        Push toimii vain tuotantoversiossa — kehityspalvelimella service workeria ei rekisteröidä.
        Ajastettu lähetys markkinoiden avautuessa ei ole vielä käytössä; toistaiseksi vain
        testipainike lähettää.
      </p>
    </Panel>
  )
}
