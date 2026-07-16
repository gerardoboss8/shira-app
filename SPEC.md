# Shira App — Sistema interno de Librería Shira

> Spec para construir con Claude Code. Este documento define la estructura completa: stack, modelo de datos, módulos, roles y plan de construcción por fases. Puede usarse directamente como `CLAUDE.md` / `SPEC.md` en la raíz del proyecto.

---

## 1. Contexto del negocio

- Librería católica en Guatemala: biblias, libros litúrgicos y artículos religiosos (rosarios, camisas, etc.).
- Operada por dos socios + trabajadores de mostrador.
- Moneda: **Quetzal (GTQ, "Q")**. Precios de venta con IVA incluido.
- Inventario actual real (punto de partida para el seed): 28 renglones, 828 unidades, Q 83,705.00 a precio de venta, en 3 categorías: **Biblias**, **Libros litúrgicos**, **Otros artículos**.

## 2. Objetivo

App web interna (no pública) para que los trabajadores puedan:
1. Registrar **ventas** en segundos desde el mostrador (celular o computadora).
2. Consultar y ajustar **inventario** (descuenta automático con cada venta).
3. Ver **recordatorios** de la empresa y **fechas importantes** (litúrgicas y comerciales).
4. Dar **seguimiento** a pedidos de clientes, encargos a proveedores y tareas pendientes.
5. Que los socios vean un **dashboard** con ventas del día/mes, stock bajo y valor de inventario.

## 3. Stack técnico

| Capa | Tecnología | Nota |
|---|---|---|
| Frontend | **Next.js 14+ (App Router) + TypeScript + Tailwind + shadcn/ui** | PWA instalable en los celulares de los trabajadores |
| Backend / DB | **Supabase** (Postgres + Auth + RLS + Storage) | Ya disponible en la infraestructura actual |
| Auth | Supabase Auth — email/contraseña + roles vía tabla `profiles` | Sin registro público: los usuarios los crea el admin |
| Deploy | Docker en **VPS Hostinger con EasyPanel** | Un solo contenedor Next.js standalone |
| Automatizaciones | **N8N** (webhooks desde Supabase) | Fase 3: alertas de stock bajo a WhatsApp, resumen diario de ventas |
| Estado | React Query (TanStack) sobre supabase-js | Realtime en ventas e inventario |

## 4. Roles y permisos

| Rol | Permisos |
|---|---|
| `admin` (socios) | Todo: usuarios, precios, ajustes de inventario, anular ventas, reportes, configuración |
| `vendedor` | Registrar ventas, consultar inventario (sin editar precios), ver recordatorios/fechas, gestionar seguimientos asignados |
| `contador` (opcional, solo lectura) | Reportes de ventas e inventario valuado, exportar CSV/PDF |

Implementar con **RLS en Supabase**: cada tabla con policies por rol leído desde `profiles.role`.

## 5. Modelo de datos (Postgres / Supabase)

```sql
-- Usuarios
profiles (
  id uuid PK -> auth.users,
  nombre text,
  role text CHECK (role IN ('admin','vendedor','contador')),
  activo boolean DEFAULT true,
  created_at timestamptz
)

-- Catálogo
categorias (
  id uuid PK,
  nombre text,            -- Biblias, Libros litúrgicos, Otros artículos
  orden int
)

productos (
  id uuid PK,
  categoria_id uuid FK,
  nombre text,            -- p.ej. "Latino Letra Grande"
  sku text UNIQUE,        -- generado: BIB-001, LIT-001, OTR-001
  precio_venta numeric(10,2),   -- IVA incluido
  costo numeric(10,2) NULL,     -- opcional; hoy no se tiene, dejar campo listo
  stock int DEFAULT 0,
  stock_minimo int DEFAULT 2,   -- umbral de alerta
  activo boolean DEFAULT true,
  created_at timestamptz, updated_at timestamptz
)

-- Movimientos de inventario (fuente de verdad del stock)
movimientos_inventario (
  id uuid PK,
  producto_id uuid FK,
  tipo text CHECK (tipo IN ('entrada','salida_venta','ajuste','devolucion','merma')),
  cantidad int,             -- positivo entrada, negativo salida
  referencia_venta uuid NULL FK -> ventas,
  nota text,
  usuario_id uuid FK,
  created_at timestamptz
)
-- El stock de productos se actualiza por trigger sobre esta tabla.

-- Ventas
ventas (
  id uuid PK,
  folio serial,             -- número correlativo visible: V-0001
  fecha timestamptz DEFAULT now(),
  vendedor_id uuid FK,
  cliente_nombre text NULL,
  metodo_pago text CHECK (metodo_pago IN ('efectivo','tarjeta','transferencia','otro')),
  subtotal numeric(10,2),
  descuento numeric(10,2) DEFAULT 0,
  total numeric(10,2),
  estado text CHECK (estado IN ('completada','anulada')) DEFAULT 'completada',
  nota text
)

venta_items (
  id uuid PK,
  venta_id uuid FK,
  producto_id uuid FK,
  cantidad int,
  precio_unitario numeric(10,2),  -- congelado al momento de la venta
  total_linea numeric(10,2)
)

-- Recordatorios y fechas importantes
recordatorios (
  id uuid PK,
  titulo text,
  descripcion text,
  tipo text CHECK (tipo IN ('aviso','tarea','fecha_importante')),
  fecha date NULL,               -- para fechas importantes / vencimientos
  recurrente text NULL,          -- 'anual' para fechas litúrgicas, NULL si única
  fijado boolean DEFAULT false,  -- fijar en la pantalla principal
  creado_por uuid FK,
  visible_para text DEFAULT 'todos',  -- 'todos' | 'admins'
  completado boolean DEFAULT false,
  created_at timestamptz
)

-- Seguimientos (pedidos de clientes, encargos a proveedores, pendientes)
seguimientos (
  id uuid PK,
  tipo text CHECK (tipo IN ('pedido_cliente','encargo_proveedor','tarea_interna')),
  titulo text,                  -- "Biblia Jerusalén para Sra. López"
  detalle text,
  contacto text NULL,           -- teléfono/WhatsApp del cliente o proveedor
  estado text CHECK (estado IN ('pendiente','en_proceso','listo_para_entrega','entregado','cancelado')) DEFAULT 'pendiente',
  fecha_compromiso date NULL,
  asignado_a uuid FK NULL,
  anticipo numeric(10,2) DEFAULT 0,
  creado_por uuid FK,
  created_at timestamptz, updated_at timestamptz
)

seguimiento_notas (
  id uuid PK,
  seguimiento_id uuid FK,
  nota text,
  usuario_id uuid FK,
  created_at timestamptz
)
```

**Reglas de negocio clave:**
- El stock **nunca se edita directo**: todo pasa por `movimientos_inventario` (trigger actualiza `productos.stock`). Así queda auditoría completa de quién movió qué.
- Una venta anulada genera movimientos de `devolucion` que regresan el stock.
- `precio_unitario` se congela en `venta_items` (los cambios de precio no alteran ventas pasadas).
- Venta con stock insuficiente: bloquear, o permitir con confirmación de admin (configurable).

## 6. Módulos y pantallas

### 6.1 `/login`
- Email + contraseña. Sin registro público. Sesión persistente (los trabajadores no deben loguearse cada día).

### 6.2 `/` — Inicio (pantalla del trabajador)
- Saludo + fecha.
- **Recordatorios fijados** arriba (avisos de la empresa).
- Próximas **fechas importantes** (7–14 días).
- **Seguimientos** asignados al usuario con estado pendiente.
- Botón grande: **“+ Nueva venta”**.
- Para admin: mini-resumen de ventas del día.

### 6.3 `/ventas/nueva` — Punto de venta (la pantalla más importante)
- Buscador de productos con autocompletado (por nombre o SKU) + acceso rápido por categoría.
- Carrito: cantidad, precio, total en vivo. Descuento opcional (solo admin o con PIN).
- Método de pago y nombre de cliente opcional.
- Confirmar → descuenta stock, genera folio, muestra pantalla de éxito con opción “nueva venta”.
- **Optimizada para celular**: botones grandes, máximo 3 taps para una venta simple.

### 6.4 `/ventas` — Historial
- Lista con filtros: hoy / semana / mes, vendedor, método de pago.
- Detalle de venta; anular (solo admin, pide motivo).
- Totales del período visibles arriba.

### 6.5 `/inventario`
- Tabla por categoría: producto, SKU, stock, precio, valor (stock × precio).
- Badge rojo cuando `stock <= stock_minimo`.
- Acciones: entrada de mercadería, ajuste (con nota obligatoria), historial de movimientos por producto.
- Solo admin: crear/editar productos y precios.
- Exportar a CSV (para el contador).

### 6.6 `/recordatorios`
- Dos pestañas: **Avisos/tareas** y **Calendario** (vista mensual).
- Fechas importantes precargadas y recurrentes anuales (ver seed §8).
- Crear recordatorio: cualquier usuario puede crear tareas; avisos de empresa solo admin.

### 6.7 `/seguimientos`
- Tablero tipo kanban simple por estado: Pendiente → En proceso → Listo → Entregado.
- Tarjeta: título, cliente/contacto, fecha compromiso, anticipo, asignado.
- Al marcar "Listo para entrega": sugerir avisar al cliente (link `wa.me` con mensaje prellenado).

### 6.8 `/reportes` (solo admin/contador)
- Ventas por día/semana/mes, por categoría, por vendedor, por método de pago.
- Productos más vendidos y sin movimiento.
- Valor del inventario (a precio de venta; al costo cuando exista la columna).
- Exportar CSV y PDF.

### 6.9 `/configuracion` (solo admin)
- Usuarios (crear vendedor, desactivar).
- Categorías, umbrales de stock mínimo por defecto.
- Datos del negocio (nombre, logo para tickets futuros).

## 7. Estructura de carpetas sugerida

```
shira-app/
├── CLAUDE.md                  # este spec
├── docker-compose.yml         # para EasyPanel
├── supabase/
│   ├── migrations/            # SQL: tablas, triggers, RLS
│   └── seed.sql               # inventario inicial + fechas importantes
├── src/
│   ├── app/
│   │   ├── login/
│   │   ├── (protected)/
│   │   │   ├── page.tsx               # inicio
│   │   │   ├── ventas/ (nueva/, [id]/)
│   │   │   ├── inventario/
│   │   │   ├── recordatorios/
│   │   │   ├── seguimientos/
│   │   │   ├── reportes/
│   │   │   └── configuracion/
│   ├── components/            # ui/ (shadcn), pos/, inventario/, etc.
│   ├── lib/                   # supabase client, helpers de moneda (Q), fechas
│   └── hooks/                 # useVentas, useInventario, useRealtime...
└── public/manifest.json       # PWA
```

## 8. Datos semilla (seed)

1. **Categorías:** Biblias, Libros litúrgicos, Otros artículos.
2. **Productos:** cargar los 28 renglones del inventario del 17/06/2026 (archivo `inventario_libreria_shira.html`) con sus cantidades y precios de venta. Ejemplos: Latino Letra Grande (127 u, Q185), Latino con Uñero (20 u, Q250), Rosario (500 u, Q5), Jerusalén Pasta Suave (17 u, Q375)…
3. **Movimiento inicial:** una `entrada` tipo "inventario inicial" por producto (así el stock nace auditado).
4. **Fechas importantes recurrentes (anual):** Cuaresma/Semana Santa (temporada alta de litúrgicos — la fecha varía, cargar la del año), Mes de la Biblia (septiembre), Adviento y Navidad, Día de la Virgen de Guadalupe (12 dic), Corpus Christi, temporadas de Primera Comunión y Confirmación (mayo–octubre). Añadir también: fechas de pago de impuestos/IVA como recordatorio tipo `admins`.

## 9. Plan de construcción por fases (para Claude Code)

**Fase 1 — Base (MVP usable en mostrador):**
1. Proyecto Next.js + Supabase, migraciones (tablas + triggers de stock + RLS), seed del inventario.
2. Login y roles.
3. POS (`/ventas/nueva`) + historial de ventas.
4. Inventario en lectura + entradas/ajustes.
5. Deploy en EasyPanel.

**Fase 2 — Operación completa:**
6. Recordatorios + calendario con fechas precargadas.
7. Seguimientos (kanban) + notas + link WhatsApp.
8. Dashboard de inicio y reportes básicos con export CSV.

**Fase 3 — Automatización (N8N):**
9. Webhook de stock bajo → WhatsApp de los socios.
10. Resumen diario de ventas (8pm) → WhatsApp/email.
11. Recordatorio automático de seguimientos vencidos.

## 10. Criterios de calidad

- **Mobile-first**: los trabajadores lo usarán desde el celular; PWA instalable.
- Todo en **español**, moneda formateada `Q 1,234.00`.
- Zona horaria `America/Guatemala` en todos los cálculos de "hoy".
- Sin operación destructiva sin confirmación; anulaciones siempre con motivo y auditoría.
- Interfaz limpia y rápida: registrar una venta simple debe tomar < 15 segundos.
