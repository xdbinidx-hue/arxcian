import { readCached } from '../cache'
import { cacheKeyFor } from './fetchNews'
import { CATEGORIES, type Article, type Category } from './types'

/**
 * Uusimmat artikkelit, yhtenä kokoomapaikkana sille kuviolle joka oli
 * kopioituna sekä hubin uutiskoosteessa että /arxcian/uutiset-sivulla:
 * hae kaikki kategoriat, yhdistä, järjestä tuoreimmasta vanhimpaan, poista
 * kaksoiskappaleet linkin (id:n) perusteella, palauta ensimmäiset n.
 *
 * Tyhjä tai puuttuva välimuisti ei kaada hakua — puuttuva kategoria näkyy
 * vain tyhjänä listana, samaan tapaan kuin readCached palauttaa jo muualla.
 */
export async function latestAcrossCategories(n: number, category?: Category): Promise<Article[]> {
  if (category) {
    const cached = await readCached<Article[]>(cacheKeyFor(category))
    return (cached?.data ?? [])
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
      .slice(0, n)
  }

  const lists = await Promise.all(
    CATEGORIES.map(async c => (await readCached<Article[]>(cacheKeyFor(c)))?.data ?? []),
  )

  // Sama artikkeli voi olla useassa kategoriassa (esim. Guardianin juttu
  // sekä maailma- että konfliktit-syötteessä). fetchNews poistaa
  // kaksoiskappaleet vain kategorian sisällä, joten tämä karsii ne myös
  // kategorioiden yli.
  const seen = new Set<string>()
  return lists
    .flat()
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    .filter(a => {
      if (seen.has(a.id)) return false
      seen.add(a.id)
      return true
    })
    .slice(0, n)
}
