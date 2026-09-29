'use client'

import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return setError('No fue posible iniciar sesión. Verifica tus datos.')
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main style={{ maxWidth: 520 }}>
      <form className="card" onSubmit={submit}>
        <p className="muted">Conjunto Residencial San Gabriel</p>
        <h1>Ingreso</h1>
        <div className="field"><label>Correo</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
        <div className="field"><label>Contraseña</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
        {error && <p>{error}</p>}
        <button className="primary" type="submit">Ingresar</button>
      </form>
    </main>
  )
}
