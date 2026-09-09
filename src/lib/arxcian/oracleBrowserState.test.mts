import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clearOracleBrowserState,
  isOracleQueueEnabled,
  oraclePendingStorageKey,
  oracleSubmissionStorageKey,
  parseOracleSubmissionDraft,
  shouldRestoreOracleWatch,
} from './oracleBrowserState.ts'

test('keskeneräinen Oracle-lähetys palautetaan vain kelvollisella avaimella', () => {
  assert.deepEqual(
    parseOracleSubmissionDraft(JSON.stringify({ prompt: 'Tee työ', idempotencyKey: 'request-abcdefgh' })),
    { prompt: 'Tee työ', idempotencyKey: 'request-abcdefgh' },
  )
  assert.equal(parseOracleSubmissionDraft('{"prompt":"","idempotencyKey":"short"}'), null)
  assert.equal(parseOracleSubmissionDraft('rikki'), null)
})

test('Oracle-jono voidaan palauttaa vanhaan assistenttiin ympäristölipulla', () => {
  assert.equal(isOracleQueueEnabled(undefined), true)
  assert.equal(isOracleQueueEnabled('true'), true)
  assert.equal(isOracleQueueEnabled('false'), false)
})

test('suljetun paletin seuranta palautuu vasta uudelleen avattaessa', () => {
  assert.equal(shouldRestoreOracleWatch(false, 'message-1', null), false)
  assert.equal(shouldRestoreOracleWatch(true, 'message-1', null), true)
  assert.equal(shouldRestoreOracleWatch(true, 'message-1', { aborted: false }), false)
  assert.equal(shouldRestoreOracleWatch(true, 'message-1', { aborted: true }), true)
  assert.equal(shouldRestoreOracleWatch(true, null, null), false)
})

test('uloskirjautuminen siivoaa Oracle-tunnisteet myös vanhasta pysyvästä tallennuksesta', () => {
  const localRemoved: string[] = []
  const sessionRemoved: string[] = []
  clearOracleBrowserState(
    'albin',
    { removeItem: key => localRemoved.push(key) },
    { removeItem: key => sessionRemoved.push(key) },
  )
  assert.deepEqual(localRemoved, [oraclePendingStorageKey('albin'), oracleSubmissionStorageKey('albin')])
  assert.deepEqual(sessionRemoved, [oracleSubmissionStorageKey('albin')])
})
