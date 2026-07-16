@AGENTS.md

# Shira App — sistema interno de Librería Shira

Librería católica en Guatemala (biblias, libros litúrgicos, artículos religiosos).
App web interna (no pública) para registrar ventas en mostrador, controlar inventario,
recordatorios/fechas litúrgicas y seguimientos de pedidos.

## Stack
- **Next.js 16 (App Router) + React 19 + TypeScript** — ⚠️ ver `AGENTS.md`: hay cambios de ruptura vs. versiones previas.
- **Tailwind v4 + shadcn/ui** (componentes en `src/components/ui`).
- **Supabase** (Postgres + Auth + RLS) vía `@supabase/ssr` y `@supabase/supabase-js`.
- **TanStack Query** para estado del servidor en el cliente.

## Convenciones del proyecto
- **Todo en español.** Moneda siempre `Q 1,234.00` con `formatQ()` de `src/lib/format.ts`.
- **Zona horaria `America/Guatemala`** para todo cálculo de "hoy" (`hoyGT`, `fecha*GT`).
- **Mobile-first**: los vendedores usan celular; botones grandes, pocos taps.
- Sin operaciones destructivas sin confirmación; anulaciones con motivo y auditoría.

## Reglas de negocio (críticas)
- **El stock NUNCA se edita directo.** Se deriva de `movimientos_inventario` por trigger.
  - Ventas → función `registrar_venta` (transaccional, precios tomados del servidor).
  - Entradas/ajustes/mermas → función `registrar_movimiento` (solo admin, nota obligatoria en ajuste/merma).
  - Anular venta → función `anular_venta` (solo admin, con motivo; devuelve stock).
- Los precios se **congelan** en `venta_items` al momento de vender.
- Roles: `admin` (socios, todo), `vendedor` (vende, consulta), `contador` (solo lectura).

## Acceso con usuario simple (sin correo)
Los vendedores entran escribiendo solo su usuario. Supabase Auth siempre necesita
un correo, así que el login traduce con `aCorreoDeAcceso()` (`src/lib/usuarios.ts`):
`juan` → `juan@usuarios.libreriashira.com`. Si el texto lleva `@`, se usa tal cual
(los socios entran con su correo real). El dominio interno **no recibe correo**:
es solo un identificador. Para crear un vendedor, el admin lo da de alta en
Supabase con ese correo sintético y *Auto Confirm* activado.

## Next.js 16 — recordatorios al escribir código
- `cookies()`, `headers()`, `params`, `searchParams` son **asíncronos** (`await`).
- El antiguo `middleware` es ahora **`src/proxy.ts`** (función `proxy`, runtime nodejs, sin edge).
- Turbopack por defecto (no usar flags `--turbopack`).
- Clientes Supabase: `src/lib/supabase/client.ts` (navegador) y `server.ts` (servidor).

## Base de datos (aplicar en orden)
En el **SQL Editor** de Supabase, o con la CLI, correr:
1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_stock_and_sales.sql`
3. `supabase/migrations/0003_rls.sql`
4. `supabase/seed.sql` (inventario inicial 17/06/2026 + fechas litúrgicas; es idempotente)

Regenerar tipos cuando cambie el esquema:
`npx supabase gen types typescript --project-id TU_REF > src/lib/database.types.ts`

## Variables de entorno
Copiar `.env.example` a `.env.local` y pegar `NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (Settings → API en Supabase).

## Estado de construcción
- [x] Fase 1 · Fundamentos: scaffold, esquema SQL + triggers + RLS, seed, clientes Supabase, helpers, PWA.
- [ ] Fase 1 · Login y roles.
- [ ] Fase 1 · POS (`/ventas/nueva`) + historial.
- [ ] Fase 1 · Inventario (lectura + entradas/ajustes + import/export CSV).
- [ ] Fase 2 · Recordatorios/calendario, seguimientos (kanban), dashboard y reportes.
- [ ] Fase 3 · Automatizaciones N8N.
