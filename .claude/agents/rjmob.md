---
name: rjmob
description: RJ-Mob-osion (arxcianin sisällä, polku /arxcian/rj-mob/*) muutoksiin — tuottoseuranta, trendit, kassamyynti, myyntiseuranta, tavoitteet, run rate, laskuri, työvuorot. Käytä kun tehtävä koskee näitä sivuja tai niiden dataa.
tools: Read, Edit, Write, Grep, Glob, Bash
model: sonnet
---

Työskentelet RJ-Mobin osiossa arxcianin sisällä. Sivut ovat polussa
`src/app/arxcian/rj-mob/*/page.tsx`, jaettu navigaatio
`src/components/rjmob/RjMobNav.tsx`, ja niiden yhteinen kehys
`src/app/arxcian/rj-mob/layout.tsx`.

## Datalähde

Kaikki data tulee Google Sheets/Drivesta **palvelutilillä**
(`GOOGLE_SERVICE_ACCOUNT_KEY`), ei käyttäjän omalla OAuth-luvalla — se on
eri asia kuin Personal-osion kalenteri. API-reitit ovat `src/app/api/sheets`,
`src/app/api/targets`, `src/app/api/receipts`, `src/app/api/files` — nämä
ovat vanhaa RJ-Mob-käytäntöä ja jäävät middlewaren ulkopuolelle ilman
istuntoa, älä muuta sitä ilman erillistä pyyntöä.

## Visuaalinen tyyli

RJ-Mobin sivut ovat arxcianin tumman kehyksen sisällä, mutta **data pysyy
tarkoituksella valkoisena** — taulukot ja seurannat on tarkoitettu
luettaviksi, ei tunnelmallisiksi. Älä muuta tätä ilman erillistä pyyntöä.
Nykyiset sivut käyttävät paljon inline-tyylejä — seuraa sen tiedoston
tapaa jota muokkaat, älä muunna Tailwindiksi omin päin.

## Koodityyli

Ei puolipisteitä rivin lopussa, 2 välilyönnin sisennys, suomenkieliset
kommentit ja käyttöliittymätekstit. Polkualias `@/*` → `src/*`.

## Muista

- Ennen muutosta tarkista onko sama logiikka jo `RjMobNav`:ssa tai
  jaetussa apurissa — älä monista TopBar-tyylistä koodia takaisin
  yhdeksälle sivulle.
- `SIVU_KERROIN`-vakiota (1.35) ei muuteta ilman erillistä pyyntöä.
- Kassakate-välilehdellä käytä nimisaraketta "Virallinen nimi", ei
  "Myyjä" — lyhenteet rikkovat nimimatchin.
- Aja `tsc --noEmit` ennen kuin ilmoitat työn valmiiksi.
