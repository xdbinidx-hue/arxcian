import { NextResponse } from 'next/server'
import { cachedJson } from '@/lib/apiCache'
import { listSeurantaFiles } from '@/lib/rjmobDrive'

/**
 * Myyntiseurannan tiedostot selaimelle.
 *
 * Listaus on kirjastossa (lib/rjmobDrive.ts), jotta myös ajastettu työ pääsee
 * siihen käsiksi ilman istuntoa. Tämä reitti on enää ohut kuori.
 */
export async function GET() {
  try {
    return cachedJson({ files: await listSeurantaFiles() })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
