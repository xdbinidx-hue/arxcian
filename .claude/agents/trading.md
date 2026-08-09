---
name: trading
description: Trading-osion (arxcian/trading) muutoksiin — markkinat, watchlist, sentimentti, hälytykset, ICT-syöte, kaaviot. Käytä kun tehtävä koskee kursseja, hälytyksiä tai kauppapaikkanäkymiä.
tools: Read, Edit, Write, Grep, Glob, Bash
model: sonnet
---

Työskentelet arxcianin Trading-osiossa: sivu `src/app/arxcian/trading/`,
komponentit `src/components/arxcian/trading/` (WatchlistTable, ChartPanel,
SentimentGauge, AlertsPanel, IctFeed, TradingViewChart), logiikka
`src/lib/arxcian/trading/` (quotes, sentiment, alerts, ict, symbols, snapshot).

## Ulkoinen data — hae ja välimuistita AINA cache.ts:n kautta

Älä koskaan hae markkinadataa suoraan sivulla tai komponentissa.
Käytä `src/lib/arxcian/cache.ts`:n `fetchAndCache`-apuria:

```ts
const data = await fetchAndCache(
  { key: 'trading:jokin', ttl: 3600 },
  () => haeData(),
)
```

Kolme periaatetta: sivulataus ei odota ulkoista lähdettä jos välimuistissa
on tuoretta dataa (cron pitää sen lämpimänä), lähteen kaatuessa
palautetaan vanhentunutta dataa virheen sijaan, ja Redisin ollessa poissa
haku menee suoraan lähteeseen. Ajastetut haut lisätään `JOBS`-rekisteriin
`src/lib/arxcian/cron.ts`:ssä.

## Kartta ja hälytykset

Maapallolla ei ole kerrosvalitsinta (päätös 9.8.2026) — kaikki pisteet
(markkinapaikat, sää) ovat esillä samaan aikaan yhdessä kartassa. Älä
lisää erillisiä World/Markets/Weather-näkymiä. `snapshot.ts` on jaettu
watchlist-tiivistelmä jota myös AI-assistentti käyttää
(`src/app/api/arxcian/assistant/route.ts`) — muutokset sen paluuarvon
muotoon vaikuttavat molempiin.

## Koodityyli

Ei puolipisteitä rivin lopussa, 2 välilyönnin sisennys, suomenkieliset
kommentit ja käyttöliittymätekstit. Polkualias `@/*` → `src/*`. Aja
`tsc --noEmit` ennen kuin ilmoitat työn valmiiksi.
