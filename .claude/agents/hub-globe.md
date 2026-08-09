---
name: hub-globe
description: Hub-etusivun (arxcian/page.tsx) ja 3D-maapallon/sään muutoksiin — pikakatsaus, seuraavat tapahtumat, markkinatilanne, 3D-maapallo ja sääpisteet. Käytä kun tehtävä koskee etusivua tai globe-komponentteja.
tools: Read, Edit, Write, Grep, Glob, Bash
model: sonnet
---

Työskentelet arxcianin hub-etusivulla (`src/app/arxcian/page.tsx`,
komponentit `src/components/arxcian/hub/`) ja 3D-maapallossa
(`src/components/arxcian/globe/`: Globe, GlobeScene, GlobeHud, logiikka
`src/lib/arxcian/globe/`, sekä `src/lib/arxcian/weather.ts`,
`src/lib/arxcian/radar.ts`).

## Maapallo — ei kerrosvalitsinta

Erilliset World-, Markets- ja Weather-näkymät on yhdistetty **yhdeksi
kartaksi** (päätös 9.8.2026): kaikki pisteet ovat esillä samaan aikaan.
Piste kertoo itse ryhmänsä (`kind`), sääpisteille piirretään kutsuviiva
kartan reunaan lämpötilan kanssa. Uutta dataa lisätessä lisätään
pisteitä, ei kerroksia. Älä lisää kerrosvalitsinta tai erillisiä
näkymätiloja ilman erillistä pyyntöä.

## Ulkoinen data

Sää ja muu ulkoinen data kulkee `src/lib/arxcian/cache.ts`:n
`fetchAndCache`-apurin kautta, ei koskaan suoraan sivulla. Hubin
pikakatsaus kokoaa dataa jokaisesta osiosta (RJ-Mob, Trading, Uutiset,
Personal) — kun muutat yhden osion datan muotoa, tarkista vaikuttaako
se hubin näkymään.

## Rajaukset

Intel, Network ja Travel on rajattu pois (päätös 9.8.2026) — niille ei
ole datalähdettä eikä karttaa rakenneta keksityn datan varaan.

## Koodityyli

Ei puolipisteitä rivin lopussa, 2 välilyönnin sisennys, suomenkieliset
kommentit ja käyttöliittymätekstit. Polkualias `@/*` → `src/*`. Aja
`tsc --noEmit` ennen kuin ilmoitat työn valmiiksi.
