/**
 * Nimetyt Claude-mallivakiot arxcianin AI-kutsuille. Yksi paikka, jotta
 * mallin vaihto (esim. version päivitys) ei vaadi grep-hakua koko koodikannasta.
 */

/** Vapaamuotoinen tekstigenerointi, esim. /api/ai:n WhatsApp-viestit. */
export const MODEL_ASSISTANT = 'claude-sonnet-4-6'

/** Uutisartikkelien tiivistäminen, ks. lib/arxcian/news/summarize.ts. */
export const MODEL_NEWS_SUMMARY = 'claude-haiku-4-5'
