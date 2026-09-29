import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

async function cerrarReserva(formData: FormData) {
  'use server'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('salon_profiles')
    .select('role,active')
    .eq('id', user.id)
    .single()

  if (!profile?.active || profile.role !== 'ADMIN') throw new Error('No autorizado')

  const reservationId = String(formData.get('reservation_id') || '')
  const returnedAmount = Number(formData.get('returned_amount') || 0)
  const retainedAmount = Number(formData.get('retained_amount') || 0)
  const retentionReason = String(formData.get('retention_reason') || '').trim()
  const closeNotes = String(formData.get('close_notes') || '').trim()

  if (!reservationId) throw new Error('Reserva inválida')
  if (!Number.isFinite(returnedAmount) || !Number.isFinite(retainedAmount) || returnedAmount < 0 || retainedAmount < 0) {
    throw new Error('Los valores del depósito son inválidos')
  }
  if (retainedAmount > 0 && !retentionReason) throw new Error('Debes indicar el motivo de la retención')

  const { error } = await supabase.rpc('salon_close_reservation', {
    p_reservation_id: reservationId,
    p_returned_amount: returnedAmount,
    p_retained_amount: retainedAmount,
    p_retention_reason: retentionReason || null,
    p_close_notes: closeNotes || null,
  })

  if (error) throw new Error(error.message)

  revalidatePath('/admin/cierres')
  revalidatePath('/dashboard')
}

export default async function CierresPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('salon_profiles')
    .select('role,active')
    .eq('id', user.id)
    .single()

  if (!profile?.active || profile.role !== 'ADMIN') redirect('/dashboard')

  const { data: reservations } = await supabase
    .from('salon_reservations')
    .select('id,reservation_code,tower,apartment,event_date,event_type,status')
    .eq('status', 'RETURNED')
    .order('event_date', { ascending: true })

  const ids = reservations?.map((reservation) => reservation.id) ?? []

  const [{ data: deposits }, { data: incidents }] = ids.length
    ? await Promise.all([
        supabase
          .from('salon_deposits')
          .select('reservation_id,expected_amount,received,received_amount,returned,returned_amount,retained_amount')
          .in('reservation_id', ids),
        supabase
          .from('salon_incidents')
          .select('id,reservation_id,incident_type,description,financial_impact,resolved')
          .in('reservation_id', ids)
          .order('created_at', { ascending: true }),
      ])
    : [{ data: [] }, { data: [] }]

  const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

  return (
    <main className="container">
      <p><Link href="/dashboard">← Volver al panel</Link></p>
      <h1>Liquidación de depósito y cierre</h1>
      <p>
        Administración define cuánto del depósito en efectivo se devuelve y cuánto se retiene. La reserva solo puede cerrarse
        después de registrar la devolución del salón.
      </p>

      {!reservations?.length && (
        <div className="card">
          <p>No hay reservas pendientes de liquidación y cierre.</p>
        </div>
      )}

      {reservations?.map((reservation) => {
        const deposit = deposits?.find((item) => item.reservation_id === reservation.id)
        const reservationIncidents = incidents?.filter((item) => item.reservation_id === reservation.id) ?? []
        const estimatedImpact = reservationIncidents.reduce((sum, item) => sum + Number(item.financial_impact || 0), 0)
        const receivedAmount = Number(deposit?.received_amount || 0)
        const canClose = Boolean(deposit?.received)

        return (
          <section className="card" key={reservation.id} style={{ marginBottom: 16 }}>
            <h2>{reservation.reservation_code || 'Reserva'} · Torre {reservation.tower} Apto {reservation.apartment}</h2>
            <p>{reservation.event_date} · {reservation.event_type}</p>

            <div className="grid grid-3" style={{ marginTop: 16 }}>
              <div><strong>Depósito recibido</strong><p>{money.format(receivedAmount)}</p></div>
              <div><strong>Novedades</strong><p>{reservationIncidents.length}</p></div>
              <div><strong>Impacto estimado</strong><p>{money.format(estimatedImpact)}</p></div>
            </div>

            {reservationIncidents.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h3>Novedades registradas</h3>
                {reservationIncidents.map((incident) => (
                  <p key={incident.id} className="muted">
                    {incident.incident_type}: {incident.description || 'Sin descripción'}
                    {incident.financial_impact !== null ? ` · ${money.format(Number(incident.financial_impact))}` : ''}
                  </p>
                ))}
              </div>
            )}

            {!canClose ? (
              <p><strong>No se puede cerrar:</strong> el depósito en efectivo no aparece registrado como recibido.</p>
            ) : (
              <form action={cerrarReserva} style={{ marginTop: 18 }}>
                <input type="hidden" name="reservation_id" value={reservation.id} />

                <label>Valor a devolver al residente</label>
                <input name="returned_amount" type="number" min="0" step="1" defaultValue={receivedAmount} required />

                <label>Valor a retener</label>
                <input name="retained_amount" type="number" min="0" step="1" defaultValue="0" required />

                <p className="muted">
                  La suma entre devolución y retención debe ser exactamente {money.format(receivedAmount)}.
                </p>

                <label>Motivo de la retención, si aplica</label>
                <textarea name="retention_reason" rows={2} />

                <label>Observaciones de cierre</label>
                <textarea name="close_notes" rows={3} />

                <button type="submit">Liquidar depósito y cerrar reserva</button>
              </form>
            )}
          </section>
        )
      })}
    </main>
  )
}
