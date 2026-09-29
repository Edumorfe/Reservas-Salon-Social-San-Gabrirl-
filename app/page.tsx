import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <div className="card">
        <p className="muted">Conjunto Residencial San Gabriel</p>
        <h1>Reservas del Salón Social</h1>
        <p>Solicitud, validación, pago, entrega, recepción y cierre en un solo sistema.</p>
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <Link className="primary" href="/login">Ingresar</Link>
          <Link className="secondary" href="/reservas">Consultar disponibilidad</Link>
        </div>
      </div>
    </main>
  )
}
