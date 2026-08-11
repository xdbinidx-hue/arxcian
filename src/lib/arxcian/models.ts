/**
 * Nimetyt mallivakiot arxcianin AI-kutsuille. Yksi paikka, jotta mallin vaihto
 * (esim. version päivitys) ei vaadi grep-hakua koko koodikannasta.
 */

/** Vapaamuotoinen tekstigenerointi, esim. /api/ai:n WhatsApp-viestit. */
export const MODEL_ASSISTANT = 'claude-sonnet-4-6'

/** Uutisartikkelien tiivistäminen, ks. lib/arxcian/news/summarize.ts. */
export const MODEL_NEWS_SUMMARY = 'claude-haiku-4-5'

/**
 * ElevenLabsin puhemalli, ks. lib/arxcian/tts.ts.
 *
 * Flash v2.5 on tarjonnan nopein ja halvin, ja juuri nopeus ratkaisee:
 * assistentin vastaus luetaan ääneen lause kerrallaan, joten mallin viive on
 * käyttäjälle kuuluva tauko eikä taustatyötä. Laatuero raskaampiin malleihin
 * (multilingual v2) on pienempi kuin viive-ero.
 */
export const TTS_MODEL = 'eleven_flash_v2_5'
