'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [mode, setMode] = useState<'choose'|'login'|'guest'>('choose')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (isGuest = false) => {
    setLoading(true)
    setError('')
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: isGuest ? 'guest' : user, password: isGuest ? '0626' : pass }),
    })
    const data = await res.json()
    if (res.ok) { router.push('/tuotto'); router.refresh() }
    else setError(data.error ?? 'Väärä salasana')
    setLoading(false)
  }

  const btn = (text: string, onClick: () => void, primary = false) => (
    <button onClick={onClick} style={{width:'100%',padding:'11px',borderRadius:9,background:primary?'#185FA5':'white',color:primary?'white':'#666',border:primary?'none':'0.5px solid #ddd',fontSize:14,fontWeight:primary?500:400,cursor:'pointer',marginBottom:8}}>
      {text}
    </button>
  )

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f8f8f6'}}>
      <div style={{background:'white',borderRadius:16,padding:'2rem',width:320,border:'0.5px solid #eee'}}>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:20,fontWeight:700}}>RJ-Mob</div>
          <div style={{fontSize:12,color:'#888',marginTop:4}}>Command Center</div>
        </div>
        {mode === 'choose' && <>
          {btn('Kirjaudu sisään', () => setMode('login'), true)}
          {btn('Jatka vieraana', () => setMode('guest'))}
        </>}
        {mode === 'login' && <>
          <input type="text" placeholder="Käyttäjätunnus" value={user} onChange={e => setUser(e.target.value)}
            style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'0.5px solid #ddd',fontSize:14,outline:'none',boxSizing:'border-box',marginBottom:10}} />
          <input type="password" placeholder="Salasana" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key==='Enter'&&handleLogin()}
            style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'0.5px solid #ddd',fontSize:14,outline:'none',boxSizing:'border-box',marginBottom:12}} />
          {error && <div style={{color:'#A32D2D',fontSize:12,marginBottom:10}}>{error}</div>}
          {btn(loading?'Kirjaudutaan...':'Kirjaudu', () => handleLogin(), true)}
          {btn('← Takaisin', () => { setMode('choose'); setError('') })}
        </>}
        {mode === 'guest' && <>
          <div style={{background:'#E6F1FB',borderRadius:9,padding:'11px 13px',fontSize:12,color:'#185FA5',marginBottom:14}}>
            Vieraskäyttäjä · 1h sessio · max 5 kirjautumista
          </div>
          <input type="password" placeholder="Vieraan salasana" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key==='Enter'&&handleLogin(true)}
            style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'0.5px solid #ddd',fontSize:14,outline:'none',boxSizing:'border-box',marginBottom:12}} />
          {error && <div style={{color:'#A32D2D',fontSize:12,marginBottom:10}}>{error}</div>}
          {btn(loading?'Kirjaudutaan...':'Jatka vieraana', () => handleLogin(true), true)}
          {btn('← Takaisin', () => { setMode('choose'); setError(''); setPass('') })}
        </>}
      </div>
    </div>
  )
}
