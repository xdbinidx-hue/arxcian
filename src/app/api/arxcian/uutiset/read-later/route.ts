import { NextRequest, NextResponse } from 'next/server'
import { currentOwner } from '@/lib/session'
import { getReadLater, addReadLater, removeReadLater } from '@/lib/arxcian/news/readLater'
import type { Article } from '@/lib/arxcian/news/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })
  return NextResponse.json({ articles: await getReadLater(user) })
}

export async function POST(req: NextRequest) {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const body = (await req.json()) as { article?: Article }
  if (!body.article?.id || !body.article.link) {
    return NextResponse.json({ error: 'article puuttuu tai on virheellinen' }, { status: 400 })
  }

  const articles = await addReadLater(user, body.article)
  return NextResponse.json({ articles })
}

export async function DELETE(req: NextRequest) {
  const user = await currentOwner()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id puuttuu' }, { status: 400 })

  const articles = await removeReadLater(user, id)
  return NextResponse.json({ articles })
}
