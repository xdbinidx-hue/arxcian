#!/usr/bin/env node
import { processOneOracleMessage } from './oracle-bridge-lib.mjs'

const required = ['ARXCIAN_ORIGIN', 'ORACLE_BRIDGE_SECRET', 'API_SERVER_KEY']
const missing = required.filter(name => !process.env[name])
if (missing.length > 0) {
  console.error(`Oracle-silta ei käynnisty: puuttuvat asetukset ${missing.join(', ')}`)
  process.exit(1)
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
let stopping = false
process.once('SIGTERM', () => { stopping = true })
process.once('SIGINT', () => { stopping = true })

while (!stopping) {
  try {
    const result = await processOneOracleMessage({
      appBaseUrl: process.env.ARXCIAN_ORIGIN,
      bridgeSecret: process.env.ORACLE_BRIDGE_SECRET,
      hermesBaseUrl: process.env.HERMES_API_URL || 'http://127.0.0.1:8642/p/oracle',
      hermesApiKey: process.env.API_SERVER_KEY,
      forwardEvents: true,
      onEventError: error => console.error(`[oracle-bridge-events] ${error instanceof Error ? error.message : 'Tuntematon virhe'}`),
    })
    await sleep(result.processed ? 100 : 1_000)
  } catch (error) {
    console.error(`[oracle-bridge] ${error instanceof Error ? error.message : 'Tuntematon virhe'}`)
    await sleep(5_000)
  }
}
