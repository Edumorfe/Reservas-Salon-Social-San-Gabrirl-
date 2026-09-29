import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Salón Social · San Gabriel',
  description: 'Reservas del Salón Social del Conjunto Residencial San Gabriel',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>
}
