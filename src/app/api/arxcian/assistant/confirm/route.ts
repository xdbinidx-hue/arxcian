import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@/lib/session'
import { deleteProposal, executeProposal, loadProposal } from '@/lib/arxcian/assistant/proposals'
import { appendAudit } from '@/lib/arxcian/assistant/audit'

/**
 * Avustajan ehdotuksen vahvistus ja peruutus.
 *
 * Tämä on ainoa paikka jossa avustajan ehdottama kirjoitus tapahtuu. Pyyntö
 * viittaa pelkkään tunnisteeseen: argumentit luetaan palvelimelle tallennetusta
 * ehdotuksesta, joten niitä ei voi muokata ehdotuksen ja suorituksen välissä.
 */

export const dynamic = 'force-dynamic'

/** Ehdotuksen tunniste pyynnön rungosta. */
async function readId(req: NextRequest): Promise<string | null> {
  try {
    const { id } = (await req.json()) as { id?: unknown }
    return typeof id === 'string' && id ? id : null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const id = await readId(req)
  if (!id) return NextResponse.json({ error: 'id vaaditaan' }, { status: 400 })

  const found = await loadProposal(user, id)
  if (found.status === 'forbidden') {
    return NextResponse.json({ error: 'Ehdotus kuuluu toiselle käyttäjälle' }, { status: 403 })
  }
  if (found.status === 'not-found') {
    return NextResponse.json(
      { error: 'Ehdotusta ei löytynyt tai se on vanhentunut. Pyydä avustajaa ehdottamaan uudelleen.' },
      { status: 404 },
    )
  }

  const { proposal } = found

  // Ehdotus poistetaan ennen suoritusta, ei sen jälkeen: kaksoisnapautus tai
  // vahingossa toistettu pyyntö ei saa luoda samaa tietuetta kahdesti. Poisto
  // tehdään myös epäonnistuneen suorituksen jälkeen — ehdotus on kertakäyttöinen,
  // ja uudelleenyritys kulkee mallin kautta jotta käyttäjä näkee mitä hyväksyy.
  await deleteProposal(user, id)

  try {
    await executeProposal(proposal)
  } catch (error) {
    console.error('[api/arxcian/assistant/confirm] suoritus epäonnistui', error)
    await appendAudit({
      at: Date.now(),
      user,
      tool: proposal.tool,
      summary: proposal.summary,
      ok: false,
    })
    // Syy kerrotaan käyttäjälle: se on oman datan tilasta johtuva ("rutiini oli
    // jo merkitty"), ei palvelimen sisäinen virhe.
    const reason = error instanceof Error ? error.message : 'Tuntematon virhe'
    return NextResponse.json({ error: `Toimen suoritus epäonnistui: ${reason}` }, { status: 500 })
  }

  await appendAudit({
    at: Date.now(),
    user,
    tool: proposal.tool,
    summary: proposal.summary,
    ok: true,
  })

  return NextResponse.json({ ok: true, summary: proposal.summary })
}

/**
 * Peruutus. Ehdotus poistetaan heti eikä jätetä roikkumaan vanhenemiseen asti,
 * jottei kymmenen minuutin päästä voi vahvistaa jotain jo hylättyä. Peruutusta
 * ei kirjata auditiin, koska mitään ei suoritettu.
 */
export async function DELETE(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Kirjautuminen vaaditaan' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id puuttuu' }, { status: 400 })

  // Poisto on idempotentti: jo vanhentuneen ehdotuksen peruutus onnistuu
  // hiljaisesti, koska lopputila on sama kummassakin tapauksessa.
  await deleteProposal(user, id)
  return NextResponse.json({ ok: true })
}
