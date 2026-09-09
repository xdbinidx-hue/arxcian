import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACTION_TOOLS, NAV_TARGETS } from './assistant/actions.ts'
import { oracleUiInstructions } from './oracleUiProtocol.ts'

const WRITE_TOOL_NAMES = ['create_note', 'create_goal', 'complete_habit_today', 'create_alert']

test('Oracle-ohje sisältää nykyiset navigointi- ja kirjoitustyökalut', () => {
  const instructions = oracleUiInstructions()

  assert.match(instructions, /<arxcian-ui>/)
  for (const target of NAV_TARGETS) assert.match(instructions, new RegExp(`\\b${target.id}\\b`))
  for (const name of WRITE_TOOL_NAMES) assert.match(instructions, new RegExp(`\\b${name}\\b`))
  assert.equal(ACTION_TOOLS[0]?.name, 'navigate')
})

test('Oracle-ohje säilyttää kirjoitukset vahvistettavina ehdotuksina', () => {
  const instructions = oracleUiInstructions()
  assert.match(instructions, /Älä suorita näitä neljää kirjoitusta suoraan/i)
  assert.match(instructions, /proposal/i)
  assert.match(instructions, /vain jos käyttäjä pyytää/i)
})
