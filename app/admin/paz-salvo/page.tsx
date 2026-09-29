import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

async function validarPazSalvo(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const { data: profile } = await supabase.from('salon_profiles').select('role,active').eq('id', userId).single()
  if (!profile?.active || profile.role !== 'ADMIN') throw new Error('No autorizado')

  const reservationId = String(formData.get('reservation_id') ?? '')
  const decision = String(formData.get('decision') ?? '')
  const notes = String(formData.get('notes') ?? '').trim()
  if (!reservationId || !['COMPLIES', 'DOES_NOT_COMPLY'].includes(decision)) throw new Error('Datos inválidos')

  const approved = decision === 'COMPLIES'
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('salon_reservations')
    .update({
      good_standing_status: decision,
      good_standing_validated_by: userId,
      good_standing_validated_at: now,
      good_standing_notes: notes || null,
      status: approved ? 'PAYMENT_PENDING' : 'REJECTED',
      ...(approved ? {} : { rejected_at: now, rejected_by: userId, rejection_reason: notes || 'No se encuentra a paz y salvo' }),
    })
    .eq('id', reservationId)
    .in('status', ['REQUESTED', 'VALIDATING'])

  if (error) throw new Error(error.message)
  revalidatePath('/admin/paz-salvo')
  revalidatePath('/dashboard')
  revalidatePath('/pagos')
}

export default async function PazSalvoPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const { data: profile } = await supabase.from('salon_profiles').select('role,active').eq('id', userId).single()
  if (!profile?.active || profile.role !== 'ADMIN') redirect('/dashboard')

  const { data: reservations } = await supabase
    .from('salon_reservations')
    .select('id,reservation_code,tower,apartment,event_date,event_type,estimated_guests,resident_notes,status,good_standing_status,created_at')
    .in('status', ['REQUESTED', 'VALIDATING'])
    .eq('good_standing_status', 'PENDING')
    .order('created_at', { ascending: true })

  return (
    <main>
      <div className="card">
        <p className="muted">Administración · Salón Social</p>
        <h1>Validación de paz y salvo</h1>
        <p>La reserva solo puede continuar al pago después de esta validación.</p>
      </div>

      {(reservations ?? []).length === 0 && <div className="card" style={{ marginTop: 20 }}><p>No hay solicitudes pendientes de validación.</p></div>}

      {(reservations ?? []).map((r) => (
        <div className="card" style={{ marginTop: 20 }} key={r.id}>
          <h2>{r.reservation_code || 'Solicitud pendiente'} · Torre {r.tower} Apto {r.apartment}</h2>
          <p><strong>Fecha:</strong> {r.event_date} · <strong>Evento:</strong> {r.event_type}</p>
          <p><strong>Asistentes estimados:</strong> {r.estimated_guests ?? 'No informado'}</p>
          {r.resident_notes && <p><strong>Observaciones del residente:</strong> {r.resident_notes}</p>}
          <form action={validarPazSalvo}>
            <input type="hidden" name="reservation_id" value={r.id} />
            <label htmlFor={`notes-${r.id}`}>Observaciones de Administración</label>
            <textarea id={`notes-${r.id}`} name="notes" rows={3} style={{ width: '100%', marginTop: 8, marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="submit" name="decision" value="COMPLIES">Aprobar paz y salvo</button>
              <button type="submit" name="decision" value="DOES_NOT_COMPLY">Rechazar solicitud</button>
            </div>
          </form>
        </div>
      ))}
    </main>
  )
}
