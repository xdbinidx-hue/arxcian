'use client'

import { useCallback, useState } from 'react'

/**
 * Epäonnistuneen tallennuksen näyttäminen Personalin paneeleissa.
 *
 * Kaikki neljä paneelia tekivät saman asian: `if (data.goals) setGoals(...)`
 * ja ei mitään jos kenttä puuttui. Palvelin vastaa nyt törmäykseen 409:llä ja
 * Redis-virheeseen 503:lla, mutta se ei auta jos selain heittää vastauksen
 * pois — siksi tämä on yksi mekanismi eikä neljä kopiota.
 */
export function useStoreError() {
  const [virhe, setVirhe] = useState<string | null>(null)

  /**
   * Lähettää pyynnön ja poimii listan vastauksesta, tai nostaa virheen näkyviin.
   *
   * **Myös `fetch` itse on kääreen sisällä.** Aiemmin vain `res.json()` oli
   * suojattu, jolloin verkon katketessa poikkeus lensi käsittelijästä ulos:
   * optimistinen poisto oli jo tehty, peruutusta ei koskaan ajettu, ja rivi
   * katosi näkymästä vaikka se oli palvelimella tallella — ilman virhettä.
   *
   * Viesti tulee ensisijaisesti palvelimelta: törmäys (409) korjaantuu sivun
   * päivityksellä ja Redis-virhe (503) ei, joten kiinteä teksti kertoisi
   * toisessa tapauksessa väärin. Rungoton virhe (esim. 500) tunnistetaan
   * statuskoodista eikä sitä saa esittää yhteyskatkona — se olisi sama väärä
   * virheviesti jota CLAUDE.md varoittaa maksavan puoli tuntia.
   */
  const laheta = useCallback(
    async <T,>(url: string, kentta: string, init?: RequestInit): Promise<T[] | null> => {
      try {
        const res = await fetch(url, init)
        const data = (await res.json().catch(() => null)) as Record<string, unknown> | null

        const lista = data?.[kentta]
        if (Array.isArray(lista)) {
          setVirhe(null)
          return lista as T[]
        }

        const viesti = data && typeof data.error === 'string' ? data.error : null
        setVirhe(viesti ?? `Tallennus epäonnistui (${res.status}).`)
        return null
      } catch {
        setVirhe('Yhteys katkesi. Tallennus ei mennyt läpi.')
        return null
      }
    },
    [],
  )

  return { virhe, setVirhe, laheta }
}

export function StoreError({ virhe, onSulje }: { virhe: string | null; onSulje: () => void }) {
  if (!virhe) return null

  return (
    <div className="mb-4 flex items-start justify-between gap-2 rounded-md border border-ax-down/50 px-3 py-2">
      <p className="text-[12px] text-ax-down">{virhe}</p>
      <button onClick={onSulje} className="shrink-0 text-[12px] text-ax-faint hover:text-ax-text">
        Sulje
      </button>
    </div>
  )
}
