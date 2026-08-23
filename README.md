# arxcian

Henkilökohtainen komentokeskus: RJ-Mobin bisnesluvut, trading, uutiset ja
personal-osio yhdessä Next.js-sovelluksessa.

Arkkitehtuuri, päätökset ja perustelut ovat [CLAUDE.md](CLAUDE.md):ssä. Tämä
tiedosto kertoo vain miten sovellus ajetaan.

## Kehitys

```bash
npm install
vercel env pull .env.local --environment development
npm run dev
```

`.env.local` ei ole repossa eikä sinne saa committoida arvoja. Tarvittavat
muuttujat on lueteltu [CLAUDE.md](CLAUDE.md):n Ympäristömuuttujat-osiossa ja
[.env.example](.env.example):ssä.

## Julkaisu

Push `main`iin julkaisee Vercelissä automaattisesti.

**Vercel-projekti on nimeltään `rjmob-portal`, ei `arxcian`** — repo ja kansio
nimettiin uudelleen, Vercel-projektia ei. Tuotanto on siksi osoitteessa
`https://rjmob-portal.vercel.app`, ja se osoite on kovakoodattuna
cron-workflow'ssa ja Drive-webhookin rekisteröinnissä. Älä nimeä
Vercel-projektia uudelleen "johdonmukaisuuden" vuoksi: se katkaisisi
deploy-kytkennän ja molemmat URL:t. Ks. CLAUDE.md, "Nimet".

```bash
npx vercel@latest env add <NIMI> production --yes   # uusi muuttuja tuotantoon
```

## Ajastetut haut

Uutis- ja markkinahaut ajetaan
[.github/workflows/arxcian-cron.yml](.github/workflows/arxcian-cron.yml):stä,
joka kutsuu `/api/arxcian/cron`-reittiä neljästi päivässä. Vercelin Hobby-taso
sallii vain kaksi cronia vuorokaudessa, joten ajastus ei ole `vercel.json`issa.
