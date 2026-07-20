'use client'
import { useState } from 'react'

function fmt(n: number, dec = 0) {
  return n.toLocaleString('fi-FI', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function Slider({ label, value, min, max, step = 1, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string
  onChange: (v: number) => void
}) {
  return (
    <div style={{marginBottom: 16}}>
      <div style={{display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:6}}>
        <span style={{color:'#555'}}>{label}</span>
        <span style={{fontWeight:600, color:'#111'}}>{fmt(value, step < 1 ? 2 : 0)} {unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{width:'100%', accentColor:'#185FA5'}} />
      <div style={{display:'flex', justifyContent:'space-between', fontSize:10, color:'#aaa', marginTop:2}}>
        <span>{min} {unit}</span><span>{max} {unit}</span>
      </div>
    </div>
  )
}

function TopBar() {
  return (
    <div style={{background:'white', borderBottom:'0.5px solid #eee', padding:'0 16px', display:'flex', alignItems:'center', height:48, position:'sticky', top:0, zIndex:10, gap:0}}>
      <a href="/" style={{fontWeight:700, fontSize:15, color:'#111', marginRight:24, whiteSpace:'nowrap', textDecoration:'none'}}>RJ-Mob</a>
      {[
        {label:'Tuottoseuranta', href:'/tuotto'},
        {label:'Trendit', href:'/trendit'},
        {label:'Myyntiseuranta', href:'/etela'},
        {label:'Tavoitteet ja Run Rate', href:'/tavoitteet'},
        {label:'Laskuri', href:'/laskuri'},
        {label:'Työvuorot', href:'/tyovuoro'},
      ].map(item => (
        <a key={item.href} href={item.href} style={{
          fontSize:13, fontWeight: item.href === '/laskuri' ? 500 : 400,
          color: item.href === '/laskuri' ? '#185FA5' : '#666',
          textDecoration:'none', padding:'0 14px', height:48,
          display:'flex', alignItems:'center',
          borderBottom: item.href === '/laskuri' ? '2px solid #185FA5' : '2px solid transparent',
          whiteSpace:'nowrap'
        }}>{item.label}</a>
      ))}
    </div>
  )
}

const LIITT_BONUS = [
  {min:0, max:8.99, bonus:0},
  {min:9, max:9.99, bonus:100},
  {min:10, max:10.99, bonus:150},
  {min:11, max:11.99, bonus:225},
  {min:12, max:12.99, bonus:300},
  {min:13, max:13.99, bonus:375},
  {min:14, max:999, bonus:450},
]

const FSEC_TABLE = [
  {min:0, max:29, label:'Alle 30 kpl', effect:-0.30, delta:0},
  {min:30, max:44, label:'30–44 kpl', effect:0, delta:0},
  {min:45, max:74, label:'45–74 kpl', effect:0, delta:75},
  {min:75, max:99, label:'75–99 kpl', effect:0, delta:125},
  {min:100, max:999, label:'100+ kpl', effect:0, delta:175},
]

function getLiittBonus(teho: number) {
  return LIITT_BONUS.find(r => teho >= r.min && teho <= r.max)?.bonus ?? 0
}

function getFsecRow(kpl: number) {
  return FSEC_TABLE.find(r => kpl >= r.min && kpl <= r.max) ?? FSEC_TABLE[1]
}

function applyFsec(liittBonus: number, fsecRow: typeof FSEC_TABLE[0]) {
  if (fsecRow.effect < 0) return liittBonus + liittBonus * fsecRow.effect
  return liittBonus + fsecRow.delta
}

export default function LaskuriPage() {
  const [tunnit, setTunnit] = useState(355)
  const [tuntipalkka, setTuntipalkka] = useState(13)
  const [sivukulut, setSivukulut] = useState(1.25)
  const [liittEurBrutto, setLiittEurBrutto] = useState(3550)
  const [kassakate, setKassakate] = useState(3000)
  const [fsecKpl, setFsecKpl] = useState(42)
  const [vastuulisa, setVastuulisa] = useState(200)
  const [fsecPassiiviKpl, setFsecPassiiviKpl] = useState(50)

  const LAPIMENO = 0.65
  const liittEurNetto = liittEurBrutto * LAPIMENO
  const liittTeho = tunnit > 0 ? liittEurBrutto / tunnit : 0

  const rjmobLiitt = liittEurNetto * 5
  const rjmobKassa = kassakate * 0.5
  const rjmobTuotto = rjmobLiitt + rjmobKassa

  const pohjapalkka = tunnit * tuntipalkka
  const myyjaProv = liittEurNetto
  const myyjäKassaProv = kassakate * 0.1
  const liittBonus = getLiittBonus(liittTeho)
  const fsecRow = getFsecRow(fsecKpl)
  const liittBonusFsec = applyFsec(liittBonus, fsecRow)
  const bonukset = vastuulisa + liittBonusFsec
  const sivukulupohja = pohjapalkka + myyjaProv + myyjäKassaProv + bonukset
  const myyjienKulu = sivukulupohja * sivukulut
  const nettokate = rjmobTuotto - myyjienKulu
  const kateProsentti = rjmobTuotto > 0 ? (nettokate / rjmobTuotto) * 100 : 0

  const fsecKuukausitulo = fsecPassiiviKpl * 1.5

  return (
    <div style={{minHeight:'100vh', background:'#f8f8f6', fontFamily:'system-ui,sans-serif'}}>
      <TopBar />
      <div style={{maxWidth:1000, margin:'0 auto', padding:'20px 16px'}}>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>

          <div>
            <div style={{fontSize:11, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'#888', marginBottom:10}}>Myymälän suoritustiedot</div>
            <div style={{background:'white', border:'0.5px solid #eee', borderRadius:12, padding:'16px 18px', marginBottom:16}}>
              <Slider label="Liittymät brutto €" value={liittEurBrutto} min={0} max={8000} step={50} unit="€" onChange={setLiittEurBrutto} />
              <Slider label="Kokonaistunnit / kk" value={tunnit} min={0} max={500} step={5} unit="h" onChange={setTunnit} />
              <Slider label="F-Secure myyty / kk" value={fsecKpl} min={0} max={150} step={1} unit="kpl" onChange={setFsecKpl} />
              <Slider label="Kassakate (10× arvo)" value={kassakate} min={0} max={4000} step={50} unit="€" onChange={setKassakate} />
              <div style={{display:'flex', gap:8, flexWrap:'wrap' as const}}>
                {[2000,3000,4000].map(v => (
                  <button key={v} onClick={() => setKassakate(v)} style={{padding:'5px 14px', borderRadius:8, fontSize:12, border:'0.5px solid #ddd', background: kassakate===v ? '#185FA5' : 'white', color: kassakate===v ? 'white' : '#555', cursor:'pointer'}}>{v/1000}k</button>
                ))}
              </div>
            </div>

            <div style={{fontSize:11, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'#888', marginBottom:10}}>Kustannusparametrit</div>
            <div style={{background:'white', border:'0.5px solid #eee', borderRadius:12, padding:'16px 18px', marginBottom:16}}>
              <Slider label="Tuntipalkka" value={tuntipalkka} min={10} max={18} step={0.5} unit="€/h" onChange={setTuntipalkka} />
              <Slider label="Sivukulukerroin" value={sivukulut} min={1.2} max={1.5} step={0.01} unit="×" onChange={setSivukulut} />
              <Slider label="Vastuulisä" value={vastuulisa} min={0} max={300} step={25} unit="€" onChange={setVastuulisa} />
            </div>

            <div style={{fontSize:11, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'#888', marginBottom:10}}>F-Secure portaat</div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:16}}>
              {FSEC_TABLE.map(r => {
                const active = fsecKpl >= r.min && fsecKpl <= r.max
                return (
                  <div key={r.label} style={{padding:'10px 12px', borderRadius:10, background: active ? '#185FA5' : 'white', border: active ? 'none' : '0.5px solid #eee', color: active ? 'white' : '#555'}}>
                    <div style={{fontSize:12, fontWeight:500}}>{r.label}</div>
                    <div style={{fontSize:11, marginTop:2, opacity:.8}}>{r.effect < 0 ? '−30% bonuksesta' : r.delta > 0 ? `+${r.delta} €` : 'perus'}</div>
                    {active && <div style={{fontSize:10, marginTop:2, opacity:.7}}>← nykyinen</div>}
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <div style={{fontSize:11, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'#888', marginBottom:10}}>Kannattavuus</div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12}}>
              {[
                {l:'Liittymä€ brutto', v:`${fmt(liittEurBrutto)} €`},
                {l:'RJ-Mob tuotto', v:`${fmt(rjmobTuotto)} €`, c:'#185FA5'},
                {l:'Myyjien kustannus', v:`${fmt(myyjienKulu)} €`},
                {l:'Nettokate', v:`${fmt(nettokate)} €`, c: nettokate>=0?'#3B6D11':'#A32D2D'},
              ].map((k,i) => (
                <div key={i} style={{background:'#f8f8f6', borderRadius:10, padding:'12px 14px'}}>
                  <div style={{fontSize:11, color:'#888', marginBottom:3}}>{k.l}</div>
                  <div style={{fontSize:19, fontWeight:600, color: k.c??'#111'}}>{k.v}</div>
                </div>
              ))}
            </div>
            <div style={{background:'#f8f8f6', borderRadius:10, padding:'11px 16px', marginBottom:16}}>
              <div style={{fontSize:11, color:'#888', marginBottom:2}}>Kate-% · Liittymäteho: {fmt(liittTeho,1)} €/h</div>
              <div style={{fontSize:28, fontWeight:700, color: kateProsentti>=15?'#3B6D11':kateProsentti>=5?'#854F0B':'#A32D2D'}}>{fmt(kateProsentti,1)}%</div>
            </div>

            <div style={{fontSize:11, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'#888', marginBottom:10}}>Myymäläpäällikön bonus</div>
            <div style={{background:'white', border:'0.5px solid #eee', borderRadius:12, overflow:'hidden', marginBottom:16}}>
              {[
                {l:'Vastuulisä (kiinteä)', v:`${fmt(vastuulisa)} €`},
                {l:`Liittymäbonus (teho ${fmt(liittTeho,1)} €/h)`, v:`${fmt(liittBonus)} €`},
                {l:`F-Secure kerroin (${fsecKpl} kpl → ${fsecRow.label})`, v: fsecRow.effect<0?'×0.7 (−30%)':fsecRow.delta>0?`+${fsecRow.delta} €`:'×1.0'},
                {l:'Liittymäbonus F-Securen jälkeen', v:`${fmt(liittBonusFsec)} €`, bold:true},
              ].map((r,i) => (
                <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'10px 14px', borderBottom:'0.5px solid #f5f5f5', fontSize:13}}>
                  <span style={{color:'#555'}}>{r.l}</span>
                  <span style={{fontWeight: r.bold?600:400}}>{r.v}</span>
                </div>
              ))}
              <div style={{display:'flex', justifyContent:'space-between', padding:'12px 14px', background:'#f0f7ff', fontSize:14, fontWeight:700}}>
                <span>Kokonaisbonus + vastuulisä</span>
                <span style={{color:'#185FA5'}}>{fmt(bonukset)} €</span>
              </div>
            </div>

            <div style={{fontSize:11, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'#888', marginBottom:10}}>Bonusmatriisi</div>
            <div style={{background:'white', border:'0.5px solid #eee', borderRadius:12, overflow:'hidden'}}>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
                  <thead>
                    <tr style={{background:'#f8f8f6', borderBottom:'0.5px solid #eee'}}>
                      {['Teho','Liittymä€','RJ-Mob','Kulu','Netto','Bonus'].map(h => (
                        <th key={h} style={{padding:'7px 8px', textAlign:'right', fontWeight:500, color:'#888', fontSize:11}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({length:33},(_,i)=>4+i*0.5).map(teho => {
                      const lEur = teho * tunnit
                      const lN = lEur * LAPIMENO
                      const rj = lN * 5 + kassakate * 0.5
                      const bon = vastuulisa + applyFsec(getLiittBonus(teho), fsecRow)
                      const kulu = (tunnit * tuntipalkka + lN + kassakate * 0.1 + bon) * sivukulut
                      const nk = rj - kulu
                      const isActive = Math.abs(teho - liittTeho) < 0.26
                      return (
                        <tr key={teho} style={{background: isActive?'#EBF4FF':'white', borderBottom:'0.5px solid #f5f5f5'}}>
                          <td style={{padding:'5px 8px', textAlign:'right', fontWeight: isActive?700:400, color: isActive?'#185FA5':'#333'}}>{fmt(teho,1)}{isActive?' ←':''}</td>
                          <td style={{padding:'5px 8px', textAlign:'right'}}>{fmt(lEur)} €</td>
                          <td style={{padding:'5px 8px', textAlign:'right', color:'#185FA5'}}>{fmt(rj)} €</td>
                          <td style={{padding:'5px 8px', textAlign:'right', color:'#888'}}>{fmt(kulu)} €</td>
                          <td style={{padding:'5px 8px', textAlign:'right', fontWeight:500, color: nk>=0?'#3B6D11':'#A32D2D'}}>{fmt(nk)} €</td>
                          <td style={{padding:'5px 8px', textAlign:'right', fontWeight:500}}>{fmt(bon)} €</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div style={{marginTop:24}}>
          <div style={{fontSize:11, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'#888', marginBottom:10}}>F-Secure passiivitulo laskuri</div>
          <div style={{background:'white', border:'0.5px solid #eee', borderRadius:12, padding:'16px 18px'}}>
            <Slider label="F-Secure aktiiviset asiakkuudet" value={fsecPassiiviKpl} min={1} max={150} step={1} unit="kpl" onChange={setFsecPassiiviKpl} />
            <div style={{display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' as const}}>
              {[10,30,50,75,100,150].map(v => (
                <button key={v} onClick={() => setFsecPassiiviKpl(v)} style={{padding:'5px 14px', borderRadius:8, fontSize:12, border:'0.5px solid #ddd', background: fsecPassiiviKpl===v?'#0F6E56':'white', color: fsecPassiiviKpl===v?'white':'#555', cursor:'pointer'}}>{v} kpl</button>
              ))}
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:8, marginBottom:16}}>
              {[1,3,6,12].map(kk => (
                <div key={kk} style={{background:'#E1F5EE', borderRadius:10, padding:'11px 14px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <div style={{fontSize:12, color:'#0F6E56'}}>{kk} kk</div>
                  <div style={{fontSize:18, fontWeight:700, color:'#0F6E56'}}>{fmt(fsecKuukausitulo * kk)} €</div>
                </div>
              ))}
            </div>
            <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
              <thead>
                <tr style={{borderBottom:'0.5px solid #eee'}}>
                  <th style={{textAlign:'left', padding:'6px 8px', color:'#888', fontWeight:500}}>Kuukausi</th>
                  <th style={{textAlign:'right', padding:'6px 8px', color:'#888', fontWeight:500}}>Kuukausitulo</th>
                  <th style={{textAlign:'right', padding:'6px 8px', color:'#888', fontWeight:500}}>Passiivitulo</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({length:12},(_,i)=>i+1).map(kk => (
                  <tr key={kk} style={{borderBottom:'0.5px solid #f5f5f5'}}>
                    <td style={{padding:'6px 8px'}}>{kk} kk</td>
                    <td style={{padding:'6px 8px', textAlign:'right', color:'#888'}}>{fmt(fsecKuukausitulo)} €/kk</td>
                    <td style={{padding:'6px 8px', textAlign:'right', fontWeight:500, color:'#0F6E56'}}>{fmt(fsecKuukausitulo * kk)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
