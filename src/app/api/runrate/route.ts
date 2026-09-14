import { NextRequest, NextResponse } from 'next/server'
import { loadRunRate } from '@/lib/rjmobRunRate'

/** Ajantasaiset tavoitteet, toteutuneet päivät ja tulevat vuorot.
 * Lähdekorjauksia ei viivytetä HTTP-välimuistissa. */
export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get('fileId')
  if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 })

  try {
    return NextResponse.json(await loadRunRate(fileId), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
