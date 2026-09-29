import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

async function reviewPayment(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const { data: profile } = await supabase.from('salon_profiles').select('role,active').eq('id', userId).single()
  if (!profile?.active || profile.role !== 'ADMIN') throw new Error('No autorizado')

  const paymentId = String(formData.get('payment_id') ?? '')
  const reservationId = String(formData.get('reservation_id') ?? '')
  const decision = String(formData.get('decision') ?? '')
  const notes = String(formData.get('notes') ?? '').trim()
  if (!paymentId || !reservationId || !['APPROVED', 'REJECTED'].includes(decision)) throw new Error('Datos inválidos')

  const [{ data: reservation }, { data: acceptance }] = await Promise.all([
    supabase
      .from('salon_reservations')
      .select('id,status,good_standing_status')
      .eq('id', reservationId)
      .single(),
    supabase
      .from('salon_condition_acceptances')
      .select('id,accepted_at')
      .eq('reservation_id', reservationId)
      .maybeSingle(),
  ])

  if (!reservation || reservation.status !== 'PAYMENT_PENDING' || reservation.good_standing_status !== 'COMPLIES') {
    throw new Error('La reserva no cumple las condiciones para revisión')
  }
  if (!acceptance) throw new Error('Falta la aceptación electrónica de las condiciones')

  const now = new Date().toISOString()
  const approved = decision === 'APPROVED'
  const { error: paymentError } = await supabase
    .from('salon_payments')
    .update({
      payment_status: decision,
      reviewed_by: userId,
      reviewed_at: now,
      rejection_reason: approved ? null : (notes || 'Comprobante no aprobado'),
      notes: notes || null,
    })
    .eq('id', paymentId)
    .eq('reservation_id', reservationId)
    .in('payment_status', ['RECEIPT_UPLOADED', 'UNDER_REVIEW'])

  if (paymentError) throw new Error(paymentError.message)

  if (approved) {
    const { error: reservationError } = await supabase
      .from('salon_reservations')
      .update({ status: 'APPROVED', approved_at: now, approved_by: userId, admin_notes: notes || null })
      .eq('id', reservationId)
      .eq('status', 'PAYMENT_PENDING')
    if (reservationError) throw new Error(reservationError.message)
  }

  revalidatePath('/admin/pagos')
  revalidatePath('/dashboard')
  revalidatePath('/pagos')
}

export default async function AdminPaymentsPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const { data: profile } = await supabase.from('salon_profiles').select('role,active').eq('id', userId).single()
  if (!profile?.active || profile.role !== 'ADMIN') redirect('/dashboard')

  const { data: reservations } = await supabase
    .from('salon_reservations')
    .select('id,reservation_code,tower,apartment,event_date,event_type,status,good_standing_status')
    .eq('status', 'PAYMENT_PENDING')
    .eq('good_standing_status', 'COMPLIES')
    .order('event_date', { ascending: true })

  const ids = (reservations ?? []).map((r) => r.id)
  const [{ data: payments }, { data: acceptances }] = ids.length
    ? await Promise.all([
        supabase.from('salon_payments').select('id,reservation_id,amount,payment_status,receipt_file_path,uploaded_at').in('reservation_id', ids).in('payment_status', ['RECEIPT_UPLOADED', 'UNDER_REVIEW']).order('uploaded_at', { ascending: false }),
        supabase.from('salon_condition_acceptances').select('reservation_id,accepted_at').in('reservation_id', ids),
      ])
    : [{ data: [] }, { data: [] }]

  const pendingReservations = (reservations ?? []).filter((r) => (payments ?? []).some((p) => p.reservation_id === r.id))

  return (
    <main>
      <div className="card">
        <p className="muted">Administración · Salón Social</p>
        <h1>Revisión de pagos</h1>
        <p>Antes de autorizar, verifica: pago de $200.000, paz y salvo del apartamento y aceptación electrónica de las condiciones.</p>
        <p><Link href="/dashboard">← Volver al panel</Link></p>
      </div>

      {pendingReservations.length === 0 && <div className="card" style={{ marginTop: 20 }}><p>No hay comprobantes pendientes de revisión.</p></div>}

      {pendingReservations.map((r) => {
        const payment = (payments ?? []).find((p) => p.reservation_id === r.id)
        const acceptance = (acceptances ?? []).find((a) => a.reservation_id === r.id)
        if (!payment) return null
        return (
          <div className="card" style={{ marginTop: 20 }} key={r.id}>
            <h2>{r.reservation_code || 'Solicitud'} · Torre {r.tower} Apto {r.apartment}</h2>
            <p><strong>Fecha:</strong> {r.event_date} · <strong>Evento:</strong> {r.event_type}</p>
            <p><strong>Paz y salvo:</strong> {r.good_standing_status === 'COMPLIES' ? 'Verificado' : 'Pendiente'}</p>
            <p><strong>Aceptación electrónica:</strong> {acceptance ? `Registrada · ${new Date(acceptance.accepted_at).toLocaleString('es-CO')}` : 'No registrada'}</p>
            <p><strong>Valor reportado:</strong> ${Number(payment.amount).toLocaleString('es-CO')}</p>
            <p><strong>Comprobante:</strong> {payment.receipt_file_path}</p>
            <form action={reviewPayment}>
              <input type="hidden" name="payment_id" value={payment.id} />
              <input type="hidden" name="reservation_id" value={r.id} />
              <label htmlFor={`notes-${r.id}`}>Observaciones de Administración</label>
              <textarea id={`notes-${r.id}`} name="notes" rows={3} style={{ width: '100%', margin: '8px 0 12px' }} />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="submit" name="decision" value="APPROVED" disabled={!acceptance}>Aprobar pago y reserva</button>
                <button type="submit" name="decision" value="REJECTED">Rechazar comprobante</button>
              </div>
            </form>
          </div>
        )
      })}
    </main>
  )
}
