import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

async function registrarDevolucion(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('salon_profiles').select('role,active').eq('id', user.id).single()
  if (!profile?.active || !['ADMIN', 'PORTERIA'].includes(profile.role)) throw new Error('No autorizado')

  const reservationId = String(formData.get('reservation_id') || '')
  const residentName = String(formData.get('resident_name') || '').trim()
  const chairs = Number(formData.get('chairs_received') || 0)
  const tables = Number(formData.get('tables_received') || 0)
  const cleanliness = String(formData.get('cleanliness_status') || '').trim()
  const roomCondition = String(formData.get('room_condition') || '').trim()
  const notes = String(formData.get('notes') || '').trim()
  const incidentType = String(formData.get('incident_type') || '')
  const incidentDescription = String(formData.get('incident_description') || '').trim()
  const financialImpactRaw = String(formData.get('financial_impact') || '').trim()
  const financialImpact = financialImpactRaw ? Number(financialImpactRaw) : null
  const hasIncident = Boolean(incidentType)

  if (!reservationId || !residentName) throw new Error('Faltan datos obligatorios')
  if (chairs < 0 || tables < 0 || (financialImpact !== null && (!Number.isFinite(financialImpact) || financialImpact < 0))) throw new Error('Valores inválidos')
  if (hasIncident && !incidentDescription) throw new Error('Describe la novedad encontrada')

  const { data: reservation } = await supabase.from('salon_reservations').select('id,status').eq('id', reservationId).single()
  if (!reservation || !['DELIVERED', 'RETURN_PENDING'].includes(reservation.status)) throw new Error('La reserva no está pendiente de devolución')

  const { data: existingReturn } = await supabase.from('salon_returns').select('id').eq('reservation_id', reservationId).maybeSingle()
  if (existingReturn) throw new Error('La devolución ya fue registrada')

  const { error: returnError } = await supabase.from('salon_returns').insert({
    reservation_id: reservationId,
    received_by: user.id,
    resident_name: residentName,
    chairs_received: chairs,
    tables_received: tables,
    cleanliness_status: cleanliness || null,
    room_condition: roomCondition || null,
    has_incidents: hasIncident,
    notes: notes || null,
  })
  if (returnError) throw new Error(returnError.message)

  if (hasIncident) {
    const { error: incidentError } = await supabase.from('salon_incidents').insert({
      reservation_id: reservationId,
      incident_type: incidentType,
      description: incidentDescription,
      financial_impact: financialImpact,
      created_by: user.id,
    })
    if (incidentError) throw new Error(incidentError.message)
  }

  const { error: statusError } = await supabase.from('salon_reservations').update({ status: 'RETURNED' }).eq('id', reservationId)
  if (statusError) throw new Error(statusError.message)

  revalidatePath('/porteria/devoluciones')
  revalidatePath('/dashboard')
}

export default async function DevolucionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('salon_profiles').select('role,active').eq('id', user.id).single()
  if (!profile?.active || !['ADMIN', 'PORTERIA'].includes(profile.role)) redirect('/dashboard')

  const { data: reservations } = await supabase
    .from('salon_reservations')
    .select('id,reservation_code,tower,apartment,event_date,event_type,status')
    .in('status', ['DELIVERED', 'RETURN_PENDING'])
    .order('event_date', { ascending: true })

  return (
    <main className="container">
      <h1>Devolución del salón social</h1>
      <p>Registra el estado en que se recibe el salón y su dotación. Si existe una novedad, quedará registrada para que Administración defina el tratamiento del depósito.</p>
      {!reservations?.length && <div className="card"><p>No hay reservas pendientes de devolución.</p></div>}
      {reservations?.map((r) => (
        <section className="card" key={r.id} style={{ marginBottom: 16 }}>
          <h2>{r.reservation_code || 'Reserva'} · Torre {r.tower} Apto {r.apartment}</h2>
          <p>{r.event_date} · {r.event_type}</p>
          <form action={registrarDevolucion}>
            <input type="hidden" name="reservation_id" value={r.id} />
            <label>Nombre del residente que entrega</label><input name="resident_name" required />
            <label>Sillas recibidas</label><input name="chairs_received" type="number" min="0" defaultValue="44" required />
            <label>Mesas recibidas</label><input name="tables_received" type="number" min="0" defaultValue="2" required />
            <label>Estado de limpieza</label><textarea name="cleanliness_status" rows={2} />
            <label>Estado general del salón</label><textarea name="room_condition" rows={2} />
            <label>Observaciones</label><textarea name="notes" rows={2} />
            <h3>Novedad o daño, si aplica</h3>
            <label>Tipo de novedad</label>
            <select name="incident_type" defaultValue="">
              <option value="">Sin novedades</option><option value="FURNITURE_DAMAGE">Daño de mobiliario</option><option value="MISSING_ITEM">Elemento faltante</option><option value="CLEANING">Limpieza</option><option value="LATE_RETURN">Entrega tardía</option><option value="INFRASTRUCTURE_DAMAGE">Daño de infraestructura</option><option value="NOISE">Ruido</option><option value="RULE_VIOLATION">Incumplimiento de reglas</option><option value="OTHER">Otra</option>
            </select>
            <label>Descripción de la novedad</label><textarea name="incident_description" rows={2} />
            <label>Impacto económico estimado, si se conoce</label><input name="financial_impact" type="number" min="0" step="1" />
            <button type="submit">Registrar devolución</button>
          </form>
        </section>
      ))}
    </main>
  )
}
