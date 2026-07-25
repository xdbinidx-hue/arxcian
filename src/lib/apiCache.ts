import { NextResponse } from 'next/server'

// Onnistuneet API-vastaukset saavat Vercelin reunaverkon cachettaa 5 minuutiksi — Drive-webhook
// (src/app/api/webhook/drive/route.ts) tyhjentää cachen revalidatePath():lla heti kun tiedosto
// muuttuu, joten 5 min on vain varmistava yläraja jos webhook-ilmoitus jostain syystä viivästyy.
export function cachedJson<T>(data: T, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status,
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate' },
  })
}
