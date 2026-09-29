import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const { data: profile } = await supabase
    .from('salon_profiles')
    .select('full_name, role, tower, apartment, active')
    .eq('id', userId)
    .single()

  if (!profile?.active) redirect('/login')

  const role = profile.role ?? 'RESIDENTE'
  const isStaff = role === 'ADMIN' || role === 'PORTERIA'

  let pendingQuery = supabase
    .from('salon_reservations')
    .select('id', { count: 'exact', head: true })
    .in('status', ['REQUESTED', 'VALIDATING', 'PAYMENT_REVIEW'])

  let upcomingQuery = supabase
    .from('salon_reservations')
    .select('id', { count: 'exact', head: true })
    .in('status', ['APPROVED', 'DELIVERED', 'RETURN_PENDING'])
    .gte('event_date', new Date().toISOString().slice(0, 10))

  let actionsQuery = supabase
    .from('salon_reservations')
    .select('id', { count: 'exact', head: true })
    .in('status', ['PAYMENT_PENDING', 'PAYMENT_REVIEW', 'DELIVERED', 'RETURN_PENDING', 'RETURNED'])

  if (!isStaff) {
    pendingQuery = pendingQuery.eq('resident_id', userId)
    upcomingQuery = upcomingQuery.eq('resident_id', userId)
    actionsQuery = actionsQuery.eq('resident_id', userId)
  }

  const [pending, upcoming, actions] = await Promise.all([
    pendingQuery,
    upcomingQuery,
    actionsQuery,
  ])

  return (
    <main>
      <p className="muted">Conjunto Residencial San Gabriel</p>
      <h1>Panel del Salón Social</h1>
      <p>
        {profile.full_name || 'Usuario'} · {role}
        {profile.tower && profile.apartment ? ` · Torre ${profile.tower} · Apto ${profile.apartment}` : ''}
      </p>

      <div className="grid grid-3" style={{ marginTop: 24 }}>
        <div className="card">
          <strong>Solicitudes pendientes</strong>
          <p style={{ fontSize: 32, margin: '10px 0' }}>{pending.count ?? 0}</p>
          <p className="muted">{isStaff ? 'Reservas por revisar' : 'Tus solicitudes en revisión'}</p>
        </div>
        <div className="card">
          <strong>Próximos eventos</strong>
          <p style={{ fontSize: 32, margin: '10px 0' }}>{upcoming.count ?? 0}</p>
          <p className="muted">Reservas aprobadas o en operación</p>
        </div>
        <div className="card">
          <strong>Acciones pendientes</strong>
          <p style={{ fontSize: 32, margin: '10px 0' }}>{actions.count ?? 0}</p>
          <p className="muted">Pago, entrega, devolución o cierre</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2>Accesos</h2>
        <p><Link href="/reservas">Consultar disponibilidad del salón</Link></p>
        {role === 'RESIDENTE' && <p className="muted">Las reservas y su seguimiento se mostrarán únicamente para tu apartamento.</p>}
        {isStaff && <p className="muted">Administración y Portería visualizan la operación general según los permisos definidos en Supabase.</p>}
      </div>
    </main>
  )
}
