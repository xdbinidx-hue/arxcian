import { createHash, timingSafeEqual } from 'node:crypto'

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

export function bridgeSecretMatches(presented: string | null, expected: string | undefined): boolean {
  if (!expected || !presented) return false
  return timingSafeEqual(digest(presented), digest(expected))
}
