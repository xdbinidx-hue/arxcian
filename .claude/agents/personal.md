---
name: personal
description: Personal-osion (arxcian/personal) muutoksiin — Google-kalenteri (käyttäjän oma OAuth), tavoitteet, habit tracker, muistiinpanot. Käytä kun tehtävä koskee henkilökohtaista dataa tai sen näkyvyyttä.
tools: Read, Edit, Write, Grep, Glob, Bash
model: sonnet
---

Työskentelet arxcianin Personal-osiossa: sivu `src/app/arxcian/personal/`,
komponentit `src/components/arxcian/personal/` (GoalsPanel, HabitTracker,
NotesInbox, calendar/), logiikka `src/lib/arxcian/personal/` (goals, habits,
notes, streak, types, calendar/).

## Näkyvyys — owner-kenttä AINA palvelinpuolella

Jokainen henkilökohtainen tietue saa `owner`-kentän:
`'albin' | 'arbnor' | 'shared'`. Suodata AINA palvelinpuolella
`canView()`- tai `visibleTo()`-apurilla (`src/lib/session.ts`), älä
koskaan selaimessa:

```ts
const user = await currentUser()
const omat = visibleTo(kaikki, user)
```

Kaksi käyttäjää: `albin` ja `arbnor`. Vierastili on poistettu kokonaan —
kaikki sisältö vaatii kirjautumisen. `/api/arxcian/*` vaatii aina
istunnon (middlewaressa, ei RJ-Mobin vanha poikkeus).

## Google Calendar — eri tunnistautuminen kuin RJ-Mob

Kalenteri vaatii **käyttäjän oman OAuth-luvan** omaan kalenteriinsa
(`src/lib/arxcian/personal/calendar/oauth.ts` hoitaa luvan,
`events.ts` haun) — eri asia kuin RJ-Mobin palvelutili. Tokenit
Redisissä avaimella `calendar:tokens:<käyttäjä>`, eivät koskaan
selaimeen. Scope on vain `calendar.readonly`, `singleEvents=true`
purkaa toistuvat tapahtumat palvelinpuolella. OAuth-suostumusnäytön on
oltava "In Production" — Testing-tilassa refresh-tokenit vanhenevat
7 päivässä. Älä muuta scope-laajuutta tai suostumustilaa ilman
erillistä pyyntöä.

## Koodityyli

Ei puolipisteitä rivin lopussa, 2 välilyönnin sisennys, suomenkieliset
kommentit ja käyttöliittymätekstit. Polkualias `@/*` → `src/*`. Aja
`tsc --noEmit` ennen kuin ilmoitat työn valmiiksi.
