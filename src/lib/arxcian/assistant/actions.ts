import type Anthropic from '@anthropic-ai/sdk'
import { HUB_HREF, RJMOB_PAGES, SECTIONS } from '../nav.ts'

/**
 * Avustajan ohjaustyökalut: toimet jotka tapahtuvat **selaimessa**, eivät
 * palvelimella.
 *
 * Kolmas työkalulaji lukemisen (tools.ts) ja kirjoittamisen (proposals.ts)
 * rinnalle. Ero on suorituspaikassa: lukutyökalu palauttaa dataa ja
 * kirjoitustyökalu tallentaa ehdotuksen, mutta navigointia ei voi tehdä
 * palvelimella lainkaan — reitittimen omistaa selain. Palvelin siis vain
 * tarkistaa kohteen ja lähettää tapahtuman virrassa; CommandPalette suorittaa.
 *
 * **Navigointi ei tuota vahvistuskorttia**, samasta syystä kuin set_language:
 * vahvistus on tietueen luontia varten, jossa väärin kuultu puhe jäisi
 * listalle näyttämään oikealta. Näkymän vaihto ei jätä jälkeä mihinkään, se
 * näkyy heti, ja väärän osion voi perua sanomalla seuraavan lauseen.
 * Vahvistuskortti tekisi tavallisimmasta komennosta kaksivaiheisen.
 *
 * Kohde annetaan **tunnisteena, ei osoitteena.** Malli ei saa keksiä polkua:
 * keksitty osoite veisi 404-sivulle, ja avustaja kertoisi silti avanneensa
 * osion. Tunniste ratkaistaan tästä listasta, joka johdetaan samasta
 * nav.ts:stä kuin navigaatiopalkit — uusi sivu ilmestyy avustajalle samalla
 * kun se ilmestyy valikkoon.
 */

export type ActionTool = 'navigate'

export function isActionTool(name: string): name is ActionTool {
  return name === 'navigate'
}

export type NavTarget = {
  /** Mallin antama tunniste. */
  id: string
  /** Sama teksti jonka käyttäjä näkee valikossa — avustaja sanoo sen ääneen. */
  label: string
  href: string
}

/**
 * Kaikki kohteet joihin avustaja voi siirtyä.
 *
 * Hub, neljä osiota ja RJ-Mobin alasivut. RJ-Mobin sivut ovat mukana siksi,
 * että osion `href` osoittaa vain yhteen niistä: ilman niitä "näytä
 * kassamyynti" tarkoittaisi tuottoseurantaa, mikä on juuri sellainen hiljainen
 * väärä osuma jota ääniohjauksessa ei huomaa.
 */
export const NAV_TARGETS: readonly NavTarget[] = [
  { id: 'hub', label: 'Hub', href: HUB_HREF },
  ...SECTIONS.map(s => ({ id: s.id, label: s.label, href: s.href })),
  ...RJMOB_PAGES.map(p => ({
    id: `rjmob-${p.id}`,
    label: `RJ-Mob – ${p.label}`,
    href: p.href,
  })),
]

/** Työkalumäärittely mallille. Kuvaukseen kirjoitetaan myös suomenkieliset nimet,
 *  jotta malli osaa yhdistää puheessa kuullun nimen oikeaan tunnisteeseen. */
export const ACTION_TOOLS = [
  {
    name: 'navigate',
    description: [
      'Siirtää käyttäjän toiseen arxcianin näkymään. Näkymä vaihtuu heti eikä vaadi vahvistusta.',
      'Käytä tätä kun käyttäjä pyytää näyttämään, avaamaan tai siirtymään johonkin osioon.',
      'Älä käytä tätä kun käyttäjä vain kysyy tietoa — hae se lukutyökalulla ja vastaa sanallisesti.',
      'Kohteet:',
      NAV_TARGETS.map(t => `${t.id} = ${t.label}`).join(', '),
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          enum: NAV_TARGETS.map(t => t.id),
          description: 'Kohteen tunniste yllä olevasta listasta.',
        },
      },
      required: ['target'],
      additionalProperties: false,
    },
  },
] satisfies Anthropic.Messages.ToolUnion[]

export type NavResult = { ok: true; target: NavTarget } | { ok: false; error: string }

/**
 * Tarkistaa mallin antaman kohteen.
 *
 * Virheteksti menee mallille työkalun vastauksena (is_error), joten se kertoo
 * mitä olisi pitänyt antaa — malli voi korjata itsensä samalla kierroksella
 * sen sijaan että väittäisi käyttäjälle avanneensa jotain.
 */
export function resolveNavTarget(input: unknown): NavResult {
  if (typeof input !== 'object' || input === null || !('target' in input)) {
    return { ok: false, error: 'target puuttuu.' }
  }

  const { target } = input as { target: unknown }
  if (typeof target !== 'string') {
    return { ok: false, error: 'target on annettava merkkijonona.' }
  }

  const found = NAV_TARGETS.find(t => t.id === target)
  if (!found) {
    return {
      ok: false,
      error: `Tuntematon kohde "${target}". Sallitut: ${NAV_TARGETS.map(t => t.id).join(', ')}.`,
    }
  }

  return { ok: true, target: found }
}
