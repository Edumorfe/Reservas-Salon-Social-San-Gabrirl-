import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

async function registrarEntrega(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('salon_profiles')
    .select('role,is_active')
    .eq('id', user.id)
    .single()

  if (!profile?.is_active || !['ADMIN', 'PORTERIA'].includes(profile.role)) {
    throw new Error('No autorizado')
  }

  const reservationId = String(formData.get('reservation_id') || '')
  const receivedByName = String(formData.get('received_by_name') || '').trim()
  const roomCondition = String(formData.get('room_condition') || '').trim()
  const cleanlinessCondition = String(formData.get('cleanliness_condition') || '').trim()
  const notes = String(formData.get('notes') || '').trim()

  if (!reservationId || !receivedByName) throw new Error('Faltan datos obligatorios')

  const { data: reservation } = await supabase
    .from('salon_reservations')
    .select('id,status')
    .eq('id', reservationId)
    .single()

  if (reservation?.status !== 'APPROVED') throw new Error('La reserva no está aprobada')

  const { data: existingDelivery } = await supabase
    .from('salon_deliveries')
    .select('id')
    .eq('reservation_id', reservationId)
    .maybeSingle()

  if (existingDelivery) throw new Error('La entrega ya fue registrada')

  const { data: existingDeposit } = await supabase
    .from('salon_deposits')
    .select('id,received')
    .eq('reservation_id', reservationId)
    .maybeSingle()

  if (existingDeposit?.received) throw new Error('El depósito ya fue recibido')

  const { error: depositError } = existingDeposit
    ? await supabase.from('salon_deposits').update({
        received: true,
        received_amount: 100000,
        received_by: user.id,
        received_at: new Date().toISOString(),
      }).eq('id', existingDeposit.id)
    : await supabase.from('salon_deposits').insert({
        reservation_id: reservationId,
        expected_amount: 100000,
        received: true,
        received_amount: 100000,
        received_by: user.id,
        received_at: new Date().toISOString(),
      })

  if (depositError) throw new Error(depositError.message)

  const { error: deliveryError } = await supabase.from('salon_deliveries').insert({
    reservation_id: reservationId,
    delivered_by: user.id,
    received_by_name: receivedByName,
    chairs_delivered: 44,
    tables_delivered: 2,
    room_condition: roomCondition || null,
    cleanliness_condition: cleanlinessCondition || null,
    notes: notes || null,
  })

  if (deliveryError) throw new Error(deliveryError.message)
  revalidatePath('/porteria/entregas')
  revalidatePath('/dashboard')
}

export default async function EntregasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('salon_profiles')
    .select('role,is_active')
    .eq('id', user.id)
    .single()

  if (!profile?.is_active || !['ADMIN', 'PORTERIA'].includes(profile.role)) redirect('/dashboard')

  const { data: reservations } = await supabase
    .from('salon_reservations')
    .select('id,reservation_code,tower,apartment,event_date,event_type,status')
    .eq('status', 'APPROVED')
    .order('event_date', { ascending: true })

  return (
    <main className="container">
      <h1>Entrega del salón social</h1>
      <p>Registra la entrega únicamente para reservas aprobadas. El depósito es de $100.000 y se recibe en efectivo al momento de la entrega.</p>
      <p>Dotación estándar: 44 sillas y 2 mesas.</p>

      {!reservations?.length && <div className="card"><p>No hay reservas aprobadas pendientes de entrega.</p></div>}

      {reservations?.map((r) => (
        <section className="card" key={r.id} style={{ marginBottom: 16 }}>
          <h2>{r.reservation_code || 'Reserva'} · Torre {r.tower} Apto {r.apartment}</h2>
          <p>{r.event_date} · {r.event_type}</p>
          <form action={registrarEntrega}>
            <input type="hidden" name="reservation_id" value={r.id} />
            <label>Nombre de quien recibe el salón</label>
            <input name="received_by_name" required />
            <label>Estado del salón al entregar</label>
            <textarea name="room_condition" rows={2} />
            <label>Estado de limpieza</label>
            <textarea name="cleanliness_condition" rows={2} />
            <label>Observaciones</label>
            <textarea name="notes" rows={2} />
            <p><strong>Depósito en efectivo a recibir: $100.000</strong></p>
            <button type="submit">Confirmar depósito y entrega</button>
          </form>
        </section>
      ))}
    </main>
  )
}
