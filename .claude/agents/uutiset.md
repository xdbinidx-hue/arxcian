---
name: uutiset
description: Uutiset-osion (arxcian/uutiset) muutoksiin — RSS-syötteet, kategorioidut koosteet, AI-tiivistelmät, luetaan myöhemmin -lista. Käytä kun tehtävä koskee uutislähteitä tai niiden esitystä.
tools: Read, Edit, Write, Grep, Glob, Bash
model: sonnet
---

Työskentelet arxcianin Uutiset-osiossa: sivu `src/app/arxcian/uutiset/`,
komponentit `src/components/arxcian/news/` (NewsFeed, ArticleCard), logiikka
`src/lib/arxcian/news/` (rss, sources, fetchNews, summarize, digest,
readLater, types).

## Ulkoinen data — hae ja välimuistita AINA cache.ts:n kautta

Älä koskaan parsi RSS:ää suoraan sivulla. Käytä
`src/lib/arxcian/cache.ts`:n `fetchAndCache`-apuria — sivulataus ei odota
ulkoista lähdettä jos välimuistissa on tuoretta dataa, lähteen kaatuessa
palautetaan vanhentunutta dataa virheen sijaan. Neljä päivittäistä hakua
ajetaan `.github/workflows/arxcian-cron.yml`:stä (ei Vercel Cronista —
Hobby-taso sallii vain kaksi croniä/vrk, ja toinen on jo varattu).
Uusi ajastettu haku lisätään `JOBS`-rekisteriin `src/lib/arxcian/cron.ts`:ssä.

## Rajaukset

GlobalNews on auki, mutta **Intel, Network ja Travel on rajattu pois**
(päätös 9.8.2026) — niille ei ole datalähdettä. Älä lisää näitä ilman
erillistä pyyntöä. RSS-artikkeleissa ei ole sijaintikenttää, joten
karttaintegraatio vaatisi AI-geokoodauksen — älä oleta sitä olemassa
olevaksi.

## AI-tiivistelmät

Käytä `MODEL_NEWS_SUMMARY`-vakiota (`src/lib/arxcian/models.ts`), älä
kovakoodaa mallin nimeä. `digest.ts`:n `latestAcrossCategories` on jaettu
myös AI-assistentin kanssa (`src/app/api/arxcian/assistant/route.ts`) —
muutokset sen paluuarvon muotoon vaikuttavat molempiin.

## Koodityyli

Ei puolipisteitä rivin lopussa, 2 välilyönnin sisennys, suomenkieliset
kommentit ja käyttöliittymätekstit. Polkualias `@/*` → `src/*`. Aja
`tsc --noEmit` ennen kuin ilmoitat työn valmiiksi.
