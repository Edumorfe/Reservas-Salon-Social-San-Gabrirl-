import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

async function createReservation(formData: FormData) {
  'use server'

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const { data: profile } = await supabase
    .from('salon_profiles')
    .select('role,tower,apartment,active')
    .eq('id', userId)
    .single()

  if (!profile?.active || profile.role !== 'RESIDENTE' || !profile.tower || !profile.apartment) {
    redirect('/dashboard')
  }

  const eventDate = String(formData.get('event_date') ?? '')
  const eventType = String(formData.get('event_type') ?? '').trim()
  const guestsRaw = String(formData.get('estimated_guests') ?? '').trim()
  const residentNotes = String(formData.get('resident_notes') ?? '').trim()
  const estimatedGuests = guestsRaw ? Number(guestsRaw) : null

  if (!eventDate || !eventType || (estimatedGuests !== null && (!Number.isInteger(estimatedGuests) || estimatedGuests <= 0))) {
    redirect('/reservas/nueva?error=datos')
  }

  const today = new Date().toISOString().slice(0, 10)
  if (eventDate < today) redirect('/reservas/nueva?error=fecha')

  const [{ data: blocked }, { data: occupied }] = await Promise.all([
    supabase.from('salon_blocked_dates').select('id').eq('blocked_date', eventDate).eq('active', true).limit(1),
    supabase.from('salon_reservations').select('id').eq('event_date', eventDate).in('status', ['REQUESTED','VALIDATING','PAYMENT_PENDING','PAYMENT_REVIEW','APPROVED','DELIVERED','RETURN_PENDING','RETURNED']).limit(1),
  ])

  if ((blocked?.length ?? 0) > 0 || (occupied?.length ?? 0) > 0) {
    redirect('/reservas/nueva?error=no-disponible')
  }

  const { error } = await supabase.from('salon_reservations').insert({
    resident_id: userId,
    tower: profile.tower,
    apartment: profile.apartment,
    event_date: eventDate,
    event_type: eventType,
    estimated_guests: estimatedGuests,
    resident_notes: residentNotes || null,
    status: 'REQUESTED',
    good_standing_status: 'PENDING',
  })

  if (error) redirect('/reservas/nueva?error=guardar')
  redirect('/dashboard?solicitud=creada')
}

export default async function NuevaReservaPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const { data: profile } = await supabase
    .from('salon_profiles')
    .select('full_name,role,tower,apartment,active')
    .eq('id', userId)
    .single()

  if (!profile?.active || profile.role !== 'RESIDENTE') redirect('/dashboard')
  const params = await searchParams
  const messages: Record<string, string> = {
    datos: 'Revisa los datos de la solicitud.',
    fecha: 'La fecha del evento debe ser de hoy en adelante.',
    'no-disponible': 'La fecha seleccionada ya no está disponible. Consulta otra fecha.',
    guardar: 'No fue posible guardar la solicitud. Intenta nuevamente.',
  }

  return (
    <main>
      <p className="muted">Conjunto Residencial San Gabriel</p>
      <h1>Solicitar reserva del Salón Social</h1>
      <p>{profile.full_name} · Torre {profile.tower} · Apto {profile.apartment}</p>
      <p className="muted">La solicitud queda pendiente de validación de paz y salvo por Administración.</p>

      {params.error && <div className="card" style={{ marginTop: 18 }}><strong>{messages[params.error] ?? 'No fue posible procesar la solicitud.'}</strong></div>}

      <form action={createReservation} className="card" style={{ marginTop: 20 }}>
        <label>Fecha del evento<br /><input name="event_date" type="date" required /></label>
        <br /><br />
        <label>Tipo de evento<br /><input name="event_type" type="text" required maxLength={100} placeholder="Ej. cumpleaños familiar" /></label>
        <br /><br />
        <label>Número estimado de asistentes<br /><input name="estimated_guests" type="number" min="1" step="1" /></label>
        <br /><br />
        <label>Observaciones<br /><textarea name="resident_notes" rows={4} maxLength={1000} /></label>
        <br /><br />
        <button type="submit">Enviar solicitud</button>
      </form>

      <div className="card" style={{ marginTop: 20 }}>
        <strong>Condiciones principales</strong>
        <p>Tarifa: $200.000 · Depósito: $100.000 en efectivo al entregar/recibir.</p>
        <p>Dotación: 44 sillas y 2 mesas. El salón debe entregarse y recibirse limpio.</p>
      </div>
      <p><Link href="/reservas">← Consultar disponibilidad</Link></p>
    </main>
  )
}
