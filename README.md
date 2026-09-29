# Salón Social · Conjunto Residencial San Gabriel

MVP del software de reservas del Salón Social.

## Arquitectura
- Next.js App Router
- Supabase Auth + PostgreSQL + Storage + RLS
- GitHub para control de versiones
- Vercel para despliegue

## Alcance MVP
Solicitud → validación de paz y salvo → pago/comprobante → aprobación → entrega → recepción → novedades → depósito → cierre.

## Variables
Copiar `.env.example` a `.env.local` y configurar:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

## Seguridad
No usar `service_role` ni claves secretas en el navegador. Todas las tablas públicas del proyecto deben tener RLS.

## Despliegue
Proyecto conectado a Vercel mediante GitHub. Los cambios enviados a `main` deben activar un nuevo deployment automáticamente.
