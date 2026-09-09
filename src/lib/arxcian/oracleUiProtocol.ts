import { NAV_TARGETS } from './assistant/actions.ts'

const WRITE_PROTOCOL = [
  {
    tool: 'create_note',
    input: { text: 'string, required, max 500 characters' },
  },
  {
    tool: 'create_goal',
    input: {
      title: 'string, required',
      area: 'tyo | henkilokohtainen | terveys, required',
      description: 'string, optional',
      targetDate: 'YYYY-MM-DD, optional',
    },
  },
  {
    tool: 'complete_habit_today',
    input: { title: 'existing habit title, required' },
  },
  {
    tool: 'create_alert',
    input: {
      symbol: 'watchlist symbol or display name, required',
      condition: 'above | below, required',
      threshold: 'number, required',
    },
  },
] as const

/**
 * Pyyntökohtainen lisäohje Hermekselle. Hermes tekee yhden malliajon ja
 * palauttaa mahdollisen selainvaikutuksen määrämuotoisena loppumerkintänä.
 * Varsinainen validointi ja kirjoitusehdotuksen tallennus tehdään Arxcianissa.
 */
export function oracleUiInstructions(): string {
  const targets = NAV_TARGETS.map(target => `${target.id} = ${target.label}`).join(', ')
  return [
    'Arxcianin käyttöliittymä lukee vastauksesi lopusta yhden koneellisen merkinnän.',
    'Kirjoita ensin normaali käyttäjälle tarkoitettu vastaus. Lisää aivan viimeiseksi omalle riville täsmälleen yksi merkintä muodossa:',
    '<arxcian-ui>{"action":null,"proposal":null}</arxcian-ui>',
    'action saa olla {"target":"tunniste"} vain jos käyttäjä pyytää avaamaan, näyttämään tai vaihtamaan näkymää. Muuten action on null.',
    `Sallitut navigointitunnisteet: ${targets}.`,
    'proposal saa olla yksi alla kuvatuista kirjoitusehdotuksista vain jos käyttäjä pyytää kyseistä kirjoitusta. Muuten proposal on null.',
    'Älä suorita näitä neljää kirjoitusta suoraan millään muulla työkalulla: Arxcian näyttää proposal-arvon käyttäjälle vahvistettavaksi ennen kirjoitusta.',
    `Sallitut proposal-arvot: ${JSON.stringify(WRITE_PROTOCOL)}.`,
    'Älä lisää merkintään muita avaimia. JSONin täytyy olla kelvollista ja samalla yhdellä rivillä.',
  ].join('\n')
}
