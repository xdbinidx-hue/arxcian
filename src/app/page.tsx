'use client'

export default function Home() {
  return (
    <div style={{minHeight:'100vh', fontFamily:'system-ui,sans-serif', background:'#0a0a0a'}}>
      <div style={{position:'relative', height:'100vh', overflow:'hidden'}}>
        <img src="/hero.jpg" alt="RJ-Mob"
          style={{width:'100%', height:'100%', objectFit:'cover', objectPosition:'center', opacity:0.5}} />
        <div style={{position:'absolute', inset:0, background:'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.75) 100%)'}} />
        <div style={{position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'0 24px'}}>
          <div style={{fontSize:11, letterSpacing:'4px', color:'rgba(255,255,255,0.5)', textTransform:'uppercase', marginBottom:16}}>Command Center</div>
          <div style={{fontSize:64, fontWeight:700, color:'white', letterSpacing:'-2px', lineHeight:1, marginBottom:16}}>RJ-Mob</div>
          <div style={{fontSize:15, color:'rgba(255,255,255,0.55)', maxWidth:420, lineHeight:1.7, marginBottom:48}}>
            Reaaliaikainen johtamisjärjestelmä — myynti, kannattavuus ja kassavirta yhdessä näkymässä.
          </div>
          <a href="/rj-mob/tuotto" style={{
            padding:'16px 48px',
            background:'white',
            borderRadius:14,
            textDecoration:'none',
            fontSize:15,
            fontWeight:600,
            color:'#0a0a0a',
            letterSpacing:'0.5px',
          }}>
            💰 Check the bag
          </a>
        </div>
      </div>
    </div>
  )
}
