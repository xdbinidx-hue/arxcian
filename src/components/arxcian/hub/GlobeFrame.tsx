import type { ReactNode } from 'react'

/**
 * HUD-kehykset maapallon ympärille: ulkorenkaat, projektorin rengas ja
 * valojuova sen alla. Puhtaasti koristeellinen kerros — maapallo itse on
 * WebGL-kohtaus (ks. globe/GlobeScene.tsx) eikä tämä kosketa sen dataa.
 *
 * Jokainen kerros on pointer-events-none. Pallo on raahattava ja zoomattava,
 * joten yksikin osoittimen nappaava koristeelementti rikkoisi vuorovaikutuksen
 * — juuri siksi GlobeHudkin palauttaa pointer-eventsin vain painikkeilleen.
 *
 * Renkaat on sijoitettu prosentteina neliömäiseen laatikkoon, jotta ne
 * skaalautuvat pallon mukana ilman erillisiä murtumakohtia.
 */
export function GlobeFrame({ children }: { children: ReactNode }) {
  return (
    // Kapealla näytöllä pallo on yksin omalla rivillään ja neliömäisenä yhtä
    // korkea kuin leveä — täysleveänä se täyttäisi koko ruudun eikä yhtäkään
    // paneelia näkyisi ilman vieritystä. Kolmen sarakkeen taitossa (xl) tilaa
    // on, joten siellä se saa olla iso.
    <div className="relative mx-auto w-full max-w-[520px] xl:max-w-[820px]">
      {/* Ympäröivä hehku. Erillään pallon omasta ilmakehästä: tämä valaisee
          taustan, ilmakehä valaisee siluetin. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[88%] w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ax-accent/5 blur-3xl"
      />

      <div className="relative aspect-square w-full">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-[2%] rounded-full border border-ax-line/20 shadow-[0_0_80px_rgb(var(--ax-accent)/0.08)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-[6%] rounded-full border border-ax-line/25"
        />

        {/* Pallo täyttää renkaiden sisuksen. */}
        <div className="absolute inset-[7%]">{children}</div>

        {/* Projektorin rengas ja sen valojuova: saavat pallon näyttämään
            siltä että se on heijastettu pöydälle eikä leiju tyhjässä. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[1%] left-1/2 h-[9%] w-[52%] -translate-x-1/2 rounded-[50%] border border-ax-accent/40 bg-ax-accent/5 shadow-[0_0_30px_rgb(var(--ax-accent)/0.35),inset_0_0_25px_rgb(var(--ax-accent)/0.2)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[5%] left-1/2 h-px w-[32%] -translate-x-1/2 bg-gradient-to-r from-transparent via-ax-accent to-transparent shadow-[0_0_15px_rgb(var(--ax-accent)/0.8)]"
        />
      </div>
    </div>
  )
}
