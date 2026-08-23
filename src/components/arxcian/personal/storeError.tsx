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
   * Poimii listan vastauksesta tai nostaa virheen näkyviin.
   *
   * Viesti tulee palvelimelta: törmäys korjaantuu sivun päivityksellä ja
   * Redis-virhe ei, joten kiinteä teksti kertoisi väärin toisessa tapauksessa.
   */
  const lue = useCallback(async <T,>(res: Response, kentta: string): Promise<T[] | null> => {
    try {
      const data = (await res.json()) as Record<string, unknown>
      const lista = data[kentta]
      if (Array.isArray(lista)) {
        setVirhe(null)
        return lista as T[]
      }
      setVirhe(typeof data.error === 'string' ? data.error : 'Tallennus epäonnistui.')
      return null
    } catch {
      setVirhe('Yhteys katkesi. Tallennus ei mennyt läpi.')
      return null
    }
  }, [])

  return { virhe, setVirhe, lue }
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
