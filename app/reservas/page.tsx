import { createClient } from '@/lib/supabase/server'

export default async function ReservasPage() {
  const supabase = await createClient()
  const { data: blocked } = await supabase.from('salon_blocked_dates').select('blocked_date, reason').eq('active', true).order('blocked_date')
  const { data: reservations } = await supabase.from('salon_reservations').select('event_date,status').in('status', ['APPROVED','DELIVERED','RETURN_PENDING'])

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
        <ul>
          {(reservations ?? []).map((r, i) => <li key={`r-${i}`}>{r.event_date} · Reserva</li>)}
          {(blocked ?? []).map((b, i) => <li key={`b-${i}`}>{b.blocked_date} · {b.reason}</li>)}
        </ul>
      </div>
    </main>
  )
}
