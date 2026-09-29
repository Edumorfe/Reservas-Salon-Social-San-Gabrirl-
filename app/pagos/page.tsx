import Link from 'next/link'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const RENTAL_PRICE = 200000
const CONDITIONS_TEXT = 'Acepto las condiciones de uso del salón social, confirmo que el depósito de garantía de $100.000 se entrega únicamente en efectivo al momento de recibir el salón y que no debe consignarse, transferirse ni pagarse por AV Villas o Jelpit.'

async function registerReceipt(formData: FormData) {
  'use server'

  const reservationId = String(formData.get('reservation_id') ?? '')
  const receiptPath = String(formData.get('receipt_path') ?? '').trim()
  const accepted = formData.get('conditions_accepted') === 'on'
  if (!reservationId || !receiptPath || !accepted) throw new Error('Debes cargar el comprobante y aceptar las condiciones')

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const { data: reservation } = await supabase
    .from('salon_reservations')
    .select('id,resident_id,status,good_standing_status')
    .eq('id', reservationId)
    .eq('resident_id', userId)
    .single()

  if (!reservation || reservation.status !== 'PAYMENT_PENDING' || reservation.good_standing_status !== 'COMPLIES') {
    throw new Error('La reserva no está habilitada para pago')
  }

  const { data: existingPayment } = await supabase
    .from('salon_payments')
    .select('id,payment_status')
    .eq('reservation_id', reservation.id)
    .in('payment_status', ['RECEIPT_UPLOADED', 'UNDER_REVIEW', 'APPROVED'])
    .maybeSingle()
  if (existingPayment) throw new Error('Ya existe un comprobante pendiente o aprobado para esta reserva')

  const { error: acceptanceError } = await supabase.from('salon_condition_acceptances').insert({
    reservation_id: reservation.id,
    resident_id: userId,
    conditions_text: CONDITIONS_TEXT,
  })
  if (acceptanceError && acceptanceError.code !== '23505') throw new Error(acceptanceError.message)

  const { error: paymentError } = await supabase.from('salon_payments').insert({
    reservation_id: reservation.id,
    amount: RENTAL_PRICE,
    payment_status: 'RECEIPT_UPLOADED',
    receipt_file_path: receiptPath,
    uploaded_by: userId,
    uploaded_at: new Date().toISOString(),
  })
  if (paymentError) throw new Error(paymentError.message)

  revalidatePath('/pagos')
  revalidatePath('/admin/pagos')
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
      .select('id,reservation_code,event_date,event_type,status,good_standing_status')
      .eq('resident_id', userId)
      .eq('status', 'PAYMENT_PENDING')
      .order('event_date'),
    supabase
      .from('salon_system_settings')
      .select('setting_value')
      .eq('setting_key', 'payment_instructions')
      .maybeSingle(),
  ])

  const ids = (reservations ?? []).map((r) => r.id)
  const { data: payments } = ids.length
    ? await supabase.from('salon_payments').select('reservation_id,payment_status,uploaded_at').in('reservation_id', ids).in('payment_status', ['RECEIPT_UPLOADED', 'UNDER_REVIEW', 'APPROVED']).order('uploaded_at', { ascending: false })
    : { data: [] }

  const instructions = typeof setting?.setting_value === 'string' ? setting.setting_value : ''

  return (
    <main>
      <p className="muted">Conjunto Residencial San Gabriel</p>
      <h1>Pago del Salón Social</h1>
      <p><Link href="/dashboard">← Volver al panel</Link></p>

      <div className="card" style={{ marginTop: 20 }}>
        <h2>Valor del alquiler: $200.000</h2>
        <p>Equivalente a 3 SMDLV según la última Asamblea.</p>
        <p><strong>Opciones de pago:</strong></p>
        <ol>
          <li><a href="https://www.avalpaycenter.com/wps/portal/portal-de-pagos/web/pagos-aval/resultado-busqueda/realizar-pago?idConv=00014219&origin=buscar" target="_blank" rel="noreferrer">AV Villas · AvalPay Center</a></li>
          <li><a href="https://web-conjuntos.jelpit.com/pagar-mi-administracion#/" target="_blank" rel="noreferrer">Jelpit</a></li>
        </ol>
        {instructions && <p className="muted">{instructions}</p>}
        <div className="card" style={{ marginTop: 14 }}>
          <strong>Depósito de garantía: $100.000 en efectivo</strong>
          <p>No se consigna, no se transfiere y no se paga por AV Villas ni por Jelpit. Se entrega en efectivo al momento de recibir el salón social.</p>
        </div>
      </div>

      {(reservations ?? []).length === 0 ? (
        <div className="card" style={{ marginTop: 20 }}><p>No tienes reservas pendientes de pago.</p></div>
      ) : (
        (reservations ?? []).map((reservation) => {
          const payment = (payments ?? []).find((p) => p.reservation_id === reservation.id)
          return (
            <div className="card" style={{ marginTop: 20 }} key={reservation.id}>
              <h2>{reservation.reservation_code || 'Solicitud'} · {reservation.event_date}</h2>
              <p>{reservation.event_type}</p>
              {payment ? (
                <p><strong>Comprobante enviado.</strong> Administración debe verificar el pago, el paz y salvo y la aceptación electrónica antes de autorizar la reserva.</p>
              ) : (
                <form action={registerReceipt}>
                  <input type="hidden" name="reservation_id" value={reservation.id} />
                  <label htmlFor={`receipt-${reservation.id}`}><strong>Referencia o ruta del comprobante</strong></label>
                  <input id={`receipt-${reservation.id}`} name="receipt_path" required placeholder="Identificación del comprobante cargado" style={{ width: '100%', margin: '8px 0 12px', padding: 10 }} />
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 14 }}>
                    <input type="checkbox" name="conditions_accepted" required />
                    <span>{CONDITIONS_TEXT}</span>
                  </label>
                  <button type="submit">Enviar comprobante a revisión</button>
                </form>
              )}
            </div>
          )
        })
      )}
    </main>
  )
}
