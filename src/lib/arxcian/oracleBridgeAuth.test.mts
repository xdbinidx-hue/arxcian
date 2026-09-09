import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bridgeSecretMatches } from './oracleBridgeAuth.ts'

test('bridge hyväksyy vain täsmälleen oikean salaisuuden', () => {
  assert.equal(bridgeSecretMatches('correct-secret-value', 'correct-secret-value'), true)
  assert.equal(bridgeSecretMatches('wrong', 'correct-secret-value'), false)
  assert.equal(bridgeSecretMatches(null, 'correct-secret-value'), false)
  assert.equal(bridgeSecretMatches('correct-secret-value', ''), false)
})
