import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const { data: profile } = await supabase
    .from('salon_profiles')
    .select('full_name, role, tower, apartment')
    .eq('id', userId)
    .single()

  const role = profile?.role ?? 'RESIDENTE'

  return (
    <main>
      <p className="muted">Conjunto Residencial San Gabriel</p>
      <h1>Panel del Salón Social</h1>
      <p>{profile?.full_name ?? 'Usuario'} · {role}</p>
      <div className="grid grid-3" style={{ marginTop: 24 }}>
        <div className="card"><strong>Solicitudes pendientes</strong><p className="muted">Reservas por revisar</p></div>
        <div className="card"><strong>Próximos eventos</strong><p className="muted">Reservas aprobadas</p></div>
        <div className="card"><strong>Acciones pendientes</strong><p className="muted">Pago, entrega o cierre</p></div>
      </div>
    </main>
  )
}
