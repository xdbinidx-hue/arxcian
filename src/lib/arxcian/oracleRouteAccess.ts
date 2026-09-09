const ORACLE_BRIDGE_PATHS = new Set([
  '/api/arxcian/oracle/bridge/claim',
  '/api/arxcian/oracle/bridge/state',
  '/api/arxcian/oracle/bridge/running',
  '/api/arxcian/oracle/bridge/complete',
  '/api/arxcian/oracle/bridge/fail',
  '/api/arxcian/oracle/bridge/approval-request',
  '/api/arxcian/oracle/bridge/approval-resolved',
  '/api/arxcian/oracle/bridge/cancelled',
  '/api/arxcian/oracle/bridge/event',
])

export function isOracleBridgePath(pathname: string): boolean {
  return ORACLE_BRIDGE_PATHS.has(pathname)
}
