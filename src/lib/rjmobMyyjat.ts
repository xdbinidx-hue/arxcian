/**
 * `myyjat.md` — myyjät, nimikorjausaliakset ja tuntipalkat yhtenä listana.
 *
 * Tiedosto on Drivessä (`Arxcian / Infopaketti / myyjat.md`) ja se on
 * **Google Docs -dokumentti**, ei oikea tiedosto: sisältö luetaan
 * `drive.files.export`illa tekstiksi ja jäsennetään täällä. Jäsennys on
 * tarkoituksella erotettu Drive-yhteydestä, jotta se on testattavissa ilman
 * verkkoa — sama jako kuin työvuorojen `tyovuoroExcel`/`tyovuoroDrive`.
 *
 * Muoto on putkierotettu eikä sarkainsisennetty juuri siksi, että
 * `rj-mob_myyjät` opetti mitä käsin muotoillusta sisennyksestä seuraa: parien
 * tunnistus rivijärjestyksen varassa ei kestä ihmisen tekemää muotoilua.
 *
 * **Tämä ei ole vielä koodin lukema palkkalähde.** `TUNTIPALKAT`
 * ([rjmob.ts](src/lib/rjmob.ts)) on yhä se jota laskenta käyttää, koska
 * tiedoston myyjäriveiltä puuttuvat tuntipalkat (todettu 26.8.2026 — vain
 * päälliköiden 14 €/h on täytetty). Kun ne on täytetty, tämä moduuli on se
 * josta lähde vaihdetaan; siihen asti puuttuva palkka on varoitus eikä nolla.
 */

export type Rooli = 'päällikkö' | 'myyjä' | 'muu'

export type MyyjaRivi = {
  nimi: string
  /** Miten Winpos tai kassa kirjoittaa nimen. Tyhjä = nimi tulee aina oikein. */
  aliakset: string[]
  rooli: Rooli
  myymala: string | null
  /** `null` = ei täytetty. **Ei sama kuin 0**, joka tarkoittaa "ei tuntipalkkaa". */
  tuntipalkka: number | null
  /** Sulkeissa annettu syy, esim. "omistaja, ei tuntipalkkaa eikä bonusta". */
  palkkaHuomio: string | null
  poistunut: boolean
  paattyi: string | null
}

export type MyyjatTiedosto = {
  rivit: MyyjaRivi[]
  /** Puuttuvat palkat ja muut korjattavat kohdat. Tyhjä lista = tiedosto on täytetty. */
  varoitukset: string[]
}

/**
 * Mallirivit joita ei lueta dataksi. `## Muoto`-osion ja `## Poistuneet`
 * -osion otsikkorivit näyttävät oikeilta riveiltä mutta kuvaavat muotoa —
 * ilman tätä listaa "Koko nimi" päätyisi myyjäksi jolla ei ole palkkaa, eli
 * varoitukseksi jota kukaan ei voi korjata.
 */
const MALLIRIVIT = ['koko nimi']

const OSIOT: Record<string, { rooli: Rooli | null; poistunut: boolean } | undefined> = {
  päälliköt: { rooli: 'päällikkö', poistunut: false },
  paallikot: { rooli: 'päällikkö', poistunut: false },
  myyjät: { rooli: 'myyjä', poistunut: false },
  myyjat: { rooli: 'myyjä', poistunut: false },
  poistuneet: { rooli: null, poistunut: true },
}

function roolista(raw: string): Rooli {
  const r = raw.toLowerCase()
  if (r.includes('päällik') || r.includes('paallik')) return 'päällikkö'
  if (r.includes('myyjä') || r.includes('myyja')) return 'myyjä'
  return 'muu'
}

/**
 * Tuntipalkka ja sen mahdollinen sulkeissa oleva syy.
 *
 * Tyhjä kenttä on `null` eikä 0: "ei täytetty" ja "ei tuntipalkkaa" ovat eri
 * asioita, ja niiden sekoittaminen laskisi täyttämättömän myyjän palkaksi
 * nollan sen sijaan että kertoisi tiedon puuttuvan.
 */
function palkasta(raw: string): { tuntipalkka: number | null; palkkaHuomio: string | null } {
  const huomioM = raw.match(/\(([^)]*)\)/)
  const palkkaHuomio = huomioM ? huomioM[1].trim() : null
  const luku = raw.replace(/\([^)]*\)/g, '').replace(',', '.').replace(/[^0-9.]/g, '').trim()
  if (luku === '') return { tuntipalkka: null, palkkaHuomio }
  const n = Number(luku)
  return { tuntipalkka: Number.isFinite(n) ? n : null, palkkaHuomio }
}

/** Rivi on luettelokohta jos se alkaa viivalla, mahdollisen sisennyksen ja `\`-escapen jälkeen. */
function luettelorivi(rivi: string): string | null {
  const m = rivi.match(/^\s*\\?[-•*]\s+(.*)$/)
  return m ? m[1].trim() : null
}

function osionNimi(rivi: string): string | null {
  const m = rivi.match(/^\s*#{1,6}\s+(.*)$/)
  return m ? m[1].trim().toLowerCase() : null
}

export function parseMyyjat(teksti: string): MyyjatTiedosto {
  const rivit: MyyjaRivi[] = []
  const varoitukset: string[] = []
  let osio: { rooli: Rooli | null; poistunut: boolean } | null = null

  for (const raakarivi of teksti.split(/\r?\n/)) {
    const otsikko = osionNimi(raakarivi)
    if (otsikko !== null) {
      osio = OSIOT[otsikko.replace(/[^a-zäöå]/gi, '')] ?? null
      continue
    }
    if (!osio) continue

    const kohta = luettelorivi(raakarivi)
    if (kohta === null || !kohta.includes('|')) continue

    const kentat = kohta.split('|').map(k => k.trim())
    const nimi = kentat[0] ?? ''
    if (!nimi || MALLIRIVIT.includes(nimi.toLowerCase())) continue

    const { tuntipalkka, palkkaHuomio } = palkasta(kentat[4] ?? '')
    const paattyiRaw = kentat[5] ?? ''
    const paattyi = paattyiRaw.replace(/^päättyi\s*/i, '').trim() || null

    rivit.push({
      nimi,
      aliakset: (kentat[1] ?? '').split(',').map(a => a.trim()).filter(Boolean),
      rooli: osio.rooli ?? roolista(kentat[2] ?? ''),
      myymala: (kentat[3] ?? '').trim() || null,
      tuntipalkka,
      palkkaHuomio,
      poistunut: osio.poistunut,
      paattyi,
    })
  }

  if (rivit.length === 0) {
    // Tyhjä lista on virhe eikä tulos — sama päättely kuin watchin lähdelistalla.
    // Muuten väärin nimetty osio näyttäisi siltä ettei myyjiä ole.
    varoitukset.push('myyjat.md: yhtään myyjäriviä ei löytynyt — onko osioiden otsikot ennallaan?')
  }
  for (const r of rivit) {
    if (r.poistunut) continue
    if (r.tuntipalkka === null) varoitukset.push(`${r.nimi}: tuntipalkka puuttuu myyjat.md:stä`)
    if (!r.myymala) varoitukset.push(`${r.nimi}: myymälä puuttuu myyjat.md:stä`)
  }

  return { rivit, varoitukset }
}

export function tuntipalkatTiedostosta(t: MyyjatTiedosto): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of t.rivit) {
    if (r.tuntipalkka === null) continue
    out[r.nimi] = r.tuntipalkka
    for (const a of r.aliakset) out[a] = r.tuntipalkka
  }
  return out
}

/** Yksi rivi myyntiseurannan Kassamyynti-välilehden nimikorjaustaulusta (J → K). */
export type NimikorjausPari = { alias: string; nimi: string }

/**
 * Vertaa `myyjat.md`:n aliaksia Excelin nimikorjaustauluun.
 *
 * **Ei korjaa kumpaakaan automaattisesti**, vaan kertoo mikä nimi puuttuu
 * kummasta. Kaksi listaa erkanee ajan myötä, ja hiljainen automaattikorjaus
 * siirtäisi ylläpidon taulukosta koodiin — sama ansa kuin Kassamyynnin
 * kahdessa nimisarakkeessa, jossa yhden pään "korjaaminen" hävittäisi
 * kassaluvut kaikilta.
 */
export function vertaaNimikorjauksiin(t: MyyjatTiedosto, excel: NimikorjausPari[]): string[] {
  const varoitukset: string[] = []
  const norm = (s: string) => s.trim().toLowerCase()

  const mdAliakset = new Map<string, string>()
  for (const r of t.rivit) for (const a of r.aliakset) mdAliakset.set(norm(a), r.nimi)
  const mdNimet = new Set(t.rivit.map(r => norm(r.nimi)))

  for (const p of excel) {
    const md = mdAliakset.get(norm(p.alias))
    if (md === undefined) {
      varoitukset.push(`Excelin nimikorjaus "${p.alias}" → "${p.nimi}" puuttuu myyjat.md:stä`)
    } else if (norm(md) !== norm(p.nimi)) {
      varoitukset.push(`"${p.alias}" osoittaa Excelissä nimeen "${p.nimi}" mutta myyjat.md:ssä nimeen "${md}"`)
    }
  }

  const excelAliakset = new Set(excel.map(p => norm(p.alias)))
  for (const r of t.rivit) {
    for (const a of r.aliakset) {
      if (!excelAliakset.has(norm(a))) {
        varoitukset.push(`myyjat.md:n alias "${a}" (${r.nimi}) puuttuu Excelin nimikorjaustaulusta`)
      }
    }
  }

  for (const p of excel) {
    if (!mdNimet.has(norm(p.nimi))) {
      varoitukset.push(`Excelin nimikorjauksen kohde "${p.nimi}" ei ole myyjat.md:n listalla`)
    }
  }

  return varoitukset
}
