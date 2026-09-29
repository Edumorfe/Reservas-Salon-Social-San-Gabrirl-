import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function ReservasPage() {
  const supabase = await createClient()
  const { data: blocked } = await supabase.from('salon_blocked_dates').select('blocked_date, reason').eq('active', true).order('blocked_date')
  const { data: reservations } = await supabase.from('salon_reservations').select('event_date,status').in('status', ['REQUESTED','VALIDATING','PAYMENT_PENDING','PAYMENT_REVIEW','APPROVED','DELIVERED','RETURN_PENDING','RETURNED'])
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  let canRequest = false
  if (userId) {
    const { data: profile } = await supabase.from('salon_profiles').select('role,active').eq('id', userId).single()
    canRequest = profile?.active === true && profile.role === 'RESIDENTE'
  }

  return (
    <main>
      <h1>Disponibilidad del Salón Social</h1>
      <p className="muted">Las fechas ocupadas o bloqueadas no pueden seleccionarse.</p>
      <div className="grid grid-3" style={{ marginTop: 20 }}>
        <div className="card"><strong>Tarifa</strong><p>$200.000</p></div>
        <div className="card"><strong>Depósito</strong><p>$100.000 en efectivo</p></div>
        <div className="card"><strong>Dotación</strong><p>44 sillas · 2 mesas</p></div>
      </div>
      <div className="card" style={{ marginTop: 20 }}>
        <h2>Fechas no disponibles</h2>
        {(reservations?.length ?? 0) === 0 && (blocked?.length ?? 0) === 0 ? <p className="muted">No hay fechas bloqueadas registradas.</p> : <ul>
          {(reservations ?? []).map((r, i) => <li key={`r-${i}`}>{r.event_date} · Reserva en proceso</li>)}
          {(blocked ?? []).map((b, i) => <li key={`b-${i}`}>{b.blocked_date} · {b.reason}</li>)}
        </ul>}
      </div>
      {canRequest && <div className="card" style={{ marginTop: 20 }}><strong>¿Encontraste una fecha disponible?</strong><p><Link href="/reservas/nueva">Solicitar reserva del salón →</Link></p></div>}
    </main>
  )
}
