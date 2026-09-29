import Link from 'next/link'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const RENTAL_PRICE = 200000

async function registerReceipt(formData: FormData) {
  'use server'

  const reservationId = String(formData.get('reservation_id') ?? '')
  const receiptPath = String(formData.get('receipt_path') ?? '').trim()
  if (!reservationId || !receiptPath) return

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const { data: reservation } = await supabase
    .from('salon_reservations')
    .select('id, resident_id, status')
    .eq('id', reservationId)
    .eq('resident_id', userId)
    .single()

  if (!reservation || reservation.status !== 'PAYMENT_PENDING') return

  const { error } = await supabase.from('salon_payments').insert({
    reservation_id: reservation.id,
    amount: RENTAL_PRICE,
    payment_status: 'RECEIPT_UPLOADED',
    receipt_file_path: receiptPath,
    uploaded_by: userId,
    uploaded_at: new Date().toISOString(),
  })

  if (!error) {
    await supabase
      .from('salon_reservations')
      .update({ status: 'PAYMENT_REVIEW' })
      .eq('id', reservation.id)
      .eq('resident_id', userId)
      .eq('status', 'PAYMENT_PENDING')
  }

  revalidatePath('/pagos')
  revalidatePath('/dashboard')
}

export default async function PaymentsPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const { data: profile } = await supabase
    .from('salon_profiles')
    .select('role, active')
    .eq('id', userId)
    .single()

  if (!profile?.active) redirect('/login')
  if (profile.role !== 'RESIDENTE') redirect('/dashboard')

  const [{ data: reservations }, { data: setting }] = await Promise.all([
    supabase
      .from('salon_reservations')
      .select('id, reservation_code, event_date, event_type, status')
      .eq('resident_id', userId)
      .in('status', ['PAYMENT_PENDING', 'PAYMENT_REVIEW'])
      .order('event_date'),
    supabase
      .from('salon_system_settings')
      .select('setting_value')
      .eq('setting_key', 'payment_instructions')
      .maybeSingle(),
  ])

  const instructions = typeof setting?.setting_value === 'string'
    ? setting.setting_value
    : 'Pendiente de configurar por Administración'

  return (
    <main>
      <p className="muted">Conjunto Residencial San Gabriel</p>
      <h1>Pago del Salón Social</h1>
      <p><Link href="/dashboard">← Volver al panel</Link></p>

      <div className="card" style={{ marginTop: 20 }}>
        <h2>Valor del alquiler: $200.000</h2>
        <p><strong>Instrucciones de pago:</strong> {instructions}</p>
        <p className="muted">El depósito de $100.000 se entrega en efectivo al momento de entrega/recibo del salón. No debe consignarse junto con el alquiler.</p>
      </div>

      {(reservations ?? []).length === 0 ? (
        <div className="card" style={{ marginTop: 20 }}>
          <p>No tienes reservas pendientes de pago o revisión.</p>
        </div>
      ) : (
        (reservations ?? []).map((reservation) => (
          <div className="card" style={{ marginTop: 20 }} key={reservation.id}>
            <h2>{reservation.reservation_code || 'Solicitud'} · {reservation.event_date}</h2>
            <p>{reservation.event_type}</p>
            {reservation.status === 'PAYMENT_REVIEW' ? (
              <p><strong>Comprobante enviado.</strong> Administración está revisando el pago.</p>
            ) : (
              <form action={registerReceipt}>
                <input type="hidden" name="reservation_id" value={reservation.id} />
                <label htmlFor={`receipt-${reservation.id}`}><strong>Referencia o ruta del comprobante</strong></label>
                <input
                  id={`receipt-${reservation.id}`}
                  name="receipt_path"
                  required
                  placeholder="Identificación del comprobante cargado"
                  style={{ width: '100%', margin: '8px 0 12px', padding: 10 }}
                />
                <button type="submit">Enviar comprobante a revisión</button>
              </form>
            )}
          </div>
        ))
      )}
    </main>
  )
}
