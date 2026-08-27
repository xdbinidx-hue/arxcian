import { NextRequest, NextResponse } from 'next/server'
import { cachedJson } from '@/lib/apiCache'
import { haeBonusTavoitteet } from '@/lib/rjmobBonusTavoitteetDrive'
import { valitseTavoitteet } from '@/lib/rjmobBonusTavoitteet'

/**
 * Yhden kuukauden bonustavoitteet: Drive-taulukko jos sellainen on, muuten
 * lukittu koodikopio.
 *
 * **Drive-virhe ei kaada sivua** vaan pudottaa lähteeksi lukitun kopion —
 * mutta virhe kerrotaan varoituksena eikä niellä hiljaa. Ilman sitä
 * rikkinäinen Drive-yhteys näyttäisi täsmälleen samalta kuin "taulukkoa ei ole
 * vielä tehty", ja vain jälkimmäinen on odotettu tila.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('kuukausi')
  const kuukausiOrder = Number(raw)
  if (!raw || !Number.isInteger(kuukausiOrder) || kuukausiOrder < 200001) {
    return NextResponse.json({ error: 'kuukausi puuttuu tai on virheellinen (odotettu esim. 202609)' }, { status: 400 })
  }

  try {
    return cachedJson(await haeBonusTavoitteet(kuukausiOrder))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const varakopio = valitseTavoitteet(kuukausiOrder, null)
    return NextResponse.json({
      ...varakopio,
      kuukausiOrder,
      tiedosto: null,
      varoitukset: [...varakopio.varoitukset, `Tavoitetaulukon haku Drivestä epäonnistui: ${msg}`],
    })
  }
}
