import { readCached, writeCached } from '../cache'
import type { Article } from './types'
import type { UserId } from '@/lib/session'

const TTL_SECONDS = 90 * 24 * 60 * 60 // 90 vrk, ei sidottu uutissyötteen TTL:ään
const MAX_ITEMS = 200

function keyFor(user: UserId): string {
  return `readlater:${user}`
}

export async function getReadLater(user: UserId): Promise<Article[]> {
  const cached = await readCached<Article[]>(keyFor(user))
  return cached?.data ?? []
}

/** Tallentaa artikkelin sellaisenaan (snapshot) — pysyy listassa vaikka uutissyöte vanhenisi. */
export async function addReadLater(user: UserId, article: Article): Promise<Article[]> {
  const current = await getReadLater(user)
  if (current.some(a => a.id === article.id)) return current

  const updated = [article, ...current].slice(0, MAX_ITEMS)
  await writeCached(keyFor(user), updated, TTL_SECONDS, 0)
  return updated
}

export async function removeReadLater(user: UserId, articleId: string): Promise<Article[]> {
  const current = await getReadLater(user)
  const updated = current.filter(a => a.id !== articleId)
  await writeCached(keyFor(user), updated, TTL_SECONDS, 0)
  return updated
}
