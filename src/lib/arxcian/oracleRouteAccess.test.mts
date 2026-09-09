import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOracleBridgePath } from './oracleRouteAccess.ts'

test('vain täsmälliset Oracle bridge -reitit ohittavat selainistunnon', () => {
  assert.equal(isOracleBridgePath('/api/arxcian/oracle/bridge/claim'), true)
  assert.equal(isOracleBridgePath('/api/arxcian/oracle/bridge/approval-request'), true)
  assert.equal(isOracleBridgePath('/api/arxcian/oracle/bridge/approval-resolved'), true)
  assert.equal(isOracleBridgePath('/api/arxcian/oracle/bridge/cancelled'), true)
  assert.equal(isOracleBridgePath('/api/arxcian/oracle/bridge/event'), true)
  assert.equal(isOracleBridgePath('/api/arxcian/oracle/bridge/unknown'), false)
  assert.equal(isOracleBridgePath('/api/arxcian/oracle/messages'), false)
})
