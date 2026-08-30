import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@/lib/session'
import { haeBonusTavoitteet } from '@/lib/rjmobBonusTavoitteetDrive'
import { valitseTavoitteet } from '@/lib/rjmobBonusTavoitteet'

/**
 * Yhden kuukauden bonustavoitteet, niiden lukitustila ja muutoshistoria.
 *
 * **Ei välimuistia**: tavoitetaulukkoa muokkaa ihminen joka haluaa nähdä
 * muutoksen heti perään, eikä viiden minuutin CDN-välimuisti erottuisi
 * rikkinäisestä lukijasta.
 *
 * **Drive-virhe ei kaada sivua** vaan pudottaa lähteeksi lukitun kopion —
 * mutta virhe kerrotaan varoituksena eikä niellä hiljaa. Ilman sitä
 * rikkinäinen Drive-yhteys näyttäisi täsmälleen samalta kuin "taulukkoa ei ole
 * vielä tehty", ja vain jälkimmäinen on odotettu tila.
 *
 * Käyttäjä välitetään lukijalle, koska jäädytyksen jälkeen havaittuun
 * tavoitemuutokseen kirjataan kuka sen näki.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('kuukausi')
  const kuukausiOrder = Number(raw)
  if (!raw || !Number.isInteger(kuukausiOrder) || kuukausiOrder < 200001) {
    return NextResponse.json({ error: 'kuukausi puuttuu tai on virheellinen (odotettu esim. 202609)' }, { status: 400 })
  }

  const kuka = (await currentUser()) ?? 'tuntematon'

  try {
    return NextResponse.json(await haeBonusTavoitteet(kuukausiOrder, kuka), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const varakopio = valitseTavoitteet(kuukausiOrder, null)
    return NextResponse.json({
      ...varakopio,
      kuukausiOrder,
      tiedosto: null,
      jaadytetty: null,
      historia: [],
      varoitukset: [...varakopio.varoitukset, `Tavoitetaulukon haku Drivestä epäonnistui: ${msg}`],
    }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
