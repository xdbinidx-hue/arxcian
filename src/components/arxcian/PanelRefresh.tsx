'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { fetchLabel } from '@/lib/arxcian/time'
import type { PanelFetchState } from '@/lib/arxcian/panelStatus'

/**
 * Paneelin hakuaika ja virkistysnappi otsikkorivillä.
 *
 * **Miksi tämä on olemassa.** 19.8.2026 myyntiseurantataulukko päivitettiin
 * klo 21:23 ja hubin RJ-MOB-paneeli näytti vanhoja lukuja, koska
 * `rjmob:summary` päivittyy vain cron-ajoissa (8, 12, 16, 20). Mikään ei ollut
 * rikki, mutta paneeli ei kertonut milloin sen luvut oli haettu — vian
 * etsimiseen meni tunti. Nappi antaa keinon ajaa haku heti, aikaleima kertoo
 * milloin se olisi muuten seuraavan kerran tapahtunut.
 *
 * **Tuore ja vanhentunut eivät saa näyttää samalta.** Tuore hakuaika on
 * himmeä; vanhentunut on punainen ja saa varoitusmerkin. Vanhentuneisuus on
 * mitattua tietoa hakutilasta, ei datan iästä pääteltyä — ks.
 * [panelStatus.ts](../../lib/arxcian/panelStatus.ts).
 *
 * **Ajon tulos kerrotaan, myös nielty.** Cron-reitti palauttaa työn
 * `source`-kentän, ja `stale` tarkoittaa että haku kaatui ja luvut tulevat
 * vanhasta välimuistista. Se on eri asia kuin kaatunut ajo ja eri korjaus,
 * joten ne ovat eri viestejä — mutta kumpaakaan ei saa jättää kertomatta.
 */

/** Jäähy onnistuneen ajon jälkeen. Työt hakevat ulkoisista rajapinnoista. */
const JAAHY_MS = 20_000

type CronTulos = {
  ok?: boolean
  error?: string
  results?: { id: string; ok: boolean; error?: string; source?: string }[]
}

type Viesti = { sisalto: string; laji: 'virhe' | 'vanha' }

export function PanelRefresh({
  job,
  state,
}: {
  /** Cron-työn id, tai useampi jos paneelin sisältö syntyy monesta työstä */
  job: string | readonly string[]
  state: PanelFetchState
}) {
  const router = useRouter()
  const [ajossa, setAjossa] = useState(false)
  const [jaahylla, setJaahylla] = useState(false)
  const [viesti, setViesti] = useState<Viesti | null>(null)
  const [siirtymassa, aloitaSiirtyma] = useTransition()

  // Ajastin siivotaan irrotuksessa: paneeli katoaa DOM:sta router.refreshin
  // yhteydessä, ja jäänyt setState kirjoittaisi purettuun komponenttiin.
  const ajastin = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (ajastin.current) clearTimeout(ajastin.current)
  }, [])

  // Lukko refissä eikä pelkässä tilassa: `estetty` on renderöinnin hetken
  // arvo, ja kaksi klikkiä ennen kuin React on ehtinyt renderöidä uudelleen
  // näkisivät molemmat vanhan `false`n. Ref päivittyy heti.
  const lukko = useRef(false)

  const kiireinen = ajossa || siirtymassa
  const estetty = kiireinen || jaahylla

  const paivita = useCallback(async () => {
    // Kaksoisklikkaus ja jäähy tarkistetaan tässäkin eikä vain disabledissa:
    // näppäimistö ja pikatoisto ehtivät väliin ennen kuin tila on päivittynyt.
    if (estetty || lukko.current) return

    lukko.current = true
    setAjossa(true)
    setViesti(null)

    const idt = typeof job === 'string' ? [job] : job
    const virheet: string[] = []
    const vanhat: string[] = []

    try {
      // Peräkkäin eikä rinnakkain: työt hakevat ulkoisista rajapinnoista, ja
      // watchin kaksi listaa osuvat osin samoihin lähteisiin.
      for (const id of idt) {
        let tulos: CronTulos
        try {
          const vastaus = await fetch(`/api/arxcian/cron?job=${encodeURIComponent(id)}`, {
            cache: 'no-store',
          })

          // Jäsentymätön runko ei ole onnistuminen vaikka status olisi 200:
          // vastaus voi olla alustan virhesivu. Tyhjäksi nielty runko
          // näyttäisi käyttäjälle onnistuneelta ajolta.
          let runko: unknown
          try {
            runko = await vastaus.json()
          } catch {
            virheet.push(`${id}: vastausta ei voitu lukea (HTTP ${vastaus.status})`)
            continue
          }
          tulos = runko as CronTulos

          if (!vastaus.ok) {
            virheet.push(tulos.error || `HTTP ${vastaus.status}`)
            continue
          }
        } catch (e) {
          virheet.push(e instanceof Error ? e.message : String(e))
          continue
        }

        // Reitti vastaa 200:lla myös kun työ kaatui — tulos on rungossa.
        const rivi = tulos.results?.find(r => r.id === id)
        if (rivi?.error) {
          virheet.push(rivi.error)
        } else if (rivi?.source === 'stale') {
          vanhat.push(id)
        } else if (!rivi) {
          // Ajo väittää onnistuneensa mutta tästä työstä ei ole riviä.
          virheet.push(tulos.error || `${id}: ajo ei palauttanut tulosta`)
        }
      }
    } finally {
      setAjossa(false)
      lukko.current = false
    }

    if (virheet.length > 0) {
      setViesti({ sisalto: `Päivitys epäonnistui: ${virheet.join('; ')}`, laji: 'virhe' })
    } else if (vanhat.length > 0) {
      setViesti({
        sisalto: 'Lähde ei vastannut — näytetään edellisen onnistuneen haun luvut.',
        laji: 'vanha',
      })
    }

    // Jäähy myös epäonnistuneen ajon jälkeen: kaatuva ulkoinen lähde on juuri
    // se tilanne jossa nappia painellaan uudelleen ja uudelleen.
    setJaahylla(true)
    ajastin.current = setTimeout(() => setJaahylla(false), JAAHY_MS)

    // Palvelinkomponentit renderöidään uudelleen, jolloin aikaleima ja
    // paneelin sisältö päivittyvät samalla kertaa.
    aloitaSiirtyma(() => router.refresh())
  }, [estetty, job, router])

  const aika = state.fetchedAt !== null ? fetchLabel(state.fetchedAt) : null
  const yritys = state.attemptedAt !== null ? fetchLabel(state.attemptedAt) : null

  // Kolme tilaa eikä kaksi: osittainen vika on oma asiansa. Neljä viidestä
  // kanavasta kaatuneena data on aidosti haettu juuri äsken, mutta lista on
  // vajaa — sen näyttäminen tuoreena olisi yhtä väärin kuin vanhentuneena.
  const vajaa = !state.stale && state.failed.length > 0
  const lahteet = state.failed.length > 0 ? ` (${state.failed.join(', ')})` : ''

  const selite = state.stale
    ? `Viimeisin hakuyritys${yritys ? ` ${yritys}` : ''} epäonnistui${lahteet}.${
        aika ? ` Näytetään ${aika} haettu data.` : ''
      }`
    : vajaa
      ? `Haettu ${aika ?? '—'}, mutta osa lähteistä ei vastannut${lahteet}.`
      : aika
        ? `Haettu ${aika}.`
        : 'Hakuaikaa ei tiedetä — seuraava ajastettu haku kirjaa sen.'

  return (
    <>
      <span className="flex shrink-0 items-center gap-1.5">
        {aika || state.stale ? (
          <span
            title={selite}
            className={`font-mono text-[10px] tabular-nums tracking-wider ${
              state.stale ? 'text-ax-down' : vajaa ? 'text-ax-warn' : 'text-ax-faint'
            }`}
          >
            {state.stale ? '⚠ ' : ''}
            {aika ?? '—'}
          </span>
        ) : null}

        <button
          type="button"
          onClick={paivita}
          disabled={estetty}
          aria-busy={kiireinen}
          aria-label="Päivitä paneelin tiedot"
          title={
            kiireinen
              ? 'Päivitetään…'
              : jaahylla
                ? 'Odota hetki ennen seuraavaa päivitystä.'
                : `Päivitä nyt. ${selite}`
          }
          className={`-my-1 rounded-md px-1.5 py-1 text-[11px] leading-none transition-colors ${
            estetty
              ? 'cursor-not-allowed text-ax-faint/40'
              : 'text-ax-faint hover:bg-ax-accent/10 hover:text-ax-accent'
          }`}
        >
          <span aria-hidden="true" className={kiireinen ? 'ax-spin inline-block' : 'inline-block'}>
            ⟳
          </span>
        </button>
      </span>

      {/* basis-full: otsikkorivi on flex-wrap, joten viesti rivittyy koko
          leveydelle eikä purista aikaleimaa kapeassa paneelissa. */}
      {viesti ? (
        <p
          role={viesti.laji === 'virhe' ? 'alert' : 'status'}
          className={`basis-full rounded-md border px-2.5 py-1.5 text-[9px] leading-relaxed ${
            viesti.laji === 'virhe'
              ? 'border-ax-down/30 bg-ax-down/10 text-ax-down'
              : 'border-ax-warn/30 bg-ax-warn/10 text-ax-warn'
          }`}
        >
          {viesti.sisalto}
        </p>
      ) : null}
    </>
  )
}
