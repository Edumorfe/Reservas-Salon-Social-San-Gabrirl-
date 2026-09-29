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

  const { data: reservation } = await supabase
    .from('salon_reservations')
    .select('id,status,good_standing_status')
    .eq('id', reservationId)
    .single()

  if (!reservation || reservation.status !== 'PAYMENT_REVIEW' || reservation.good_standing_status !== 'APPROVED') {
    throw new Error('La reserva no está disponible para revisión de pago')
  }

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

  const { error: reservationError } = await supabase
    .from('salon_reservations')
    .update(approved
      ? { status: 'APPROVED', approved_at: now, approved_by: userId, admin_notes: notes || null }
      : { status: 'PAYMENT_PENDING', admin_notes: notes || 'Comprobante rechazado; debe enviarse nuevamente.' })
    .eq('id', reservationId)
    .eq('status', 'PAYMENT_REVIEW')

  if (reservationError) throw new Error(reservationError.message)
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
    .select('id,reservation_code,tower,apartment,event_date,event_type,status')
    .eq('status', 'PAYMENT_REVIEW')
    .order('event_date', { ascending: true })

  const ids = (reservations ?? []).map((r) => r.id)
  const { data: payments } = ids.length
    ? await supabase.from('salon_payments').select('id,reservation_id,amount,payment_status,receipt_file_path,uploaded_at').in('reservation_id', ids).in('payment_status', ['RECEIPT_UPLOADED', 'UNDER_REVIEW']).order('uploaded_at', { ascending: false })
    : { data: [] }

  return (
    <main>
      <div className="card">
        <p className="muted">Administración · Salón Social</p>
        <h1>Revisión de pagos</h1>
        <p>Aprueba el comprobante para confirmar la reserva. Si se rechaza, el residente deberá presentar uno nuevo.</p>
        <p><Link href="/dashboard">← Volver al panel</Link></p>
      </div>

      {(reservations ?? []).length === 0 && <div className="card" style={{ marginTop: 20 }}><p>No hay comprobantes pendientes de revisión.</p></div>}

      {(reservations ?? []).map((r) => {
        const payment = (payments ?? []).find((p) => p.reservation_id === r.id)
        return (
          <div className="card" style={{ marginTop: 20 }} key={r.id}>
            <h2>{r.reservation_code || 'Solicitud'} · Torre {r.tower} Apto {r.apartment}</h2>
            <p><strong>Fecha:</strong> {r.event_date} · <strong>Evento:</strong> {r.event_type}</p>
            {!payment ? <p>No se encontró un comprobante pendiente asociado.</p> : (
              <>
                <p><strong>Valor reportado:</strong> ${Number(payment.amount).toLocaleString('es-CO')}</p>
                <p><strong>Comprobante:</strong> {payment.receipt_file_path}</p>
                <form action={reviewPayment}>
                  <input type="hidden" name="payment_id" value={payment.id} />
                  <input type="hidden" name="reservation_id" value={r.id} />
                  <label htmlFor={`notes-${r.id}`}>Observaciones de Administración</label>
                  <textarea id={`notes-${r.id}`} name="notes" rows={3} style={{ width: '100%', margin: '8px 0 12px' }} />
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="submit" name="decision" value="APPROVED">Aprobar pago y reserva</button>
                    <button type="submit" name="decision" value="REJECTED">Rechazar comprobante</button>
                  </div>
                </form>
              </>
            )}
          </div>
        )
      })}
    </main>
  )
}
