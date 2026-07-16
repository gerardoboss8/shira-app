-- =====================================================================
-- Shira App · 0001_schema.sql
-- Tablas base del sistema interno de Librería Shira.
-- Convención: todo el stock se maneja por movimientos (ver 0002).
-- =====================================================================

-- Extensiones
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- Usuarios (perfil ligado a auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null,
  role       text not null default 'vendedor'
             check (role in ('admin','vendedor','contador')),
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'Perfil de cada usuario; el rol define permisos (RLS).';

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------
create table if not exists public.categorias (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique,
  prefijo text not null unique,        -- para SKU: BIB, LIT, OTR
  orden   int  not null default 0
);
comment on column public.categorias.prefijo is 'Prefijo de SKU, p.ej. BIB -> BIB-001.';

create table if not exists public.productos (
  id            uuid primary key default gen_random_uuid(),
  categoria_id  uuid not null references public.categorias(id) on delete restrict,
  nombre        text not null,
  sku           text not null unique,
  precio_venta  numeric(10,2) not null check (precio_venta >= 0),  -- IVA incluido
  costo         numeric(10,2) check (costo >= 0),                  -- opcional (hoy no se tiene)
  stock         int  not null default 0,      -- lo actualiza el trigger de movimientos
  stock_minimo  int  not null default 2,      -- umbral de alerta
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_productos_categoria on public.productos(categoria_id);
create index if not exists idx_productos_activo    on public.productos(activo);
comment on column public.productos.stock is 'NO editar directo: se deriva de movimientos_inventario vía trigger.';

-- ---------------------------------------------------------------------
-- Ventas
-- ---------------------------------------------------------------------
create table if not exists public.ventas (
  id             uuid primary key default gen_random_uuid(),
  folio          bigint generated always as identity,  -- correlativo visible V-0001
  fecha          timestamptz not null default now(),
  vendedor_id    uuid not null references public.profiles(id),
  cliente_nombre text,
  metodo_pago    text not null default 'efectivo'
                 check (metodo_pago in ('efectivo','tarjeta','transferencia','otro')),
  subtotal       numeric(10,2) not null check (subtotal >= 0),
  descuento      numeric(10,2) not null default 0 check (descuento >= 0),
  total          numeric(10,2) not null check (total >= 0),
  estado         text not null default 'completada'
                 check (estado in ('completada','anulada')),
  nota           text
);
create index if not exists idx_ventas_fecha    on public.ventas(fecha desc);
create index if not exists idx_ventas_vendedor on public.ventas(vendedor_id);
create unique index if not exists idx_ventas_folio on public.ventas(folio);

create table if not exists public.venta_items (
  id              uuid primary key default gen_random_uuid(),
  venta_id        uuid not null references public.ventas(id) on delete cascade,
  producto_id     uuid not null references public.productos(id),
  cantidad        int  not null check (cantidad > 0),
  precio_unitario numeric(10,2) not null check (precio_unitario >= 0), -- congelado al vender
  total_linea     numeric(10,2) not null check (total_linea >= 0)
);
create index if not exists idx_venta_items_venta    on public.venta_items(venta_id);
create index if not exists idx_venta_items_producto on public.venta_items(producto_id);

-- ---------------------------------------------------------------------
-- Movimientos de inventario (fuente de verdad del stock)
-- ---------------------------------------------------------------------
create table if not exists public.movimientos_inventario (
  id                uuid primary key default gen_random_uuid(),
  producto_id       uuid not null references public.productos(id),
  tipo              text not null
                    check (tipo in ('entrada','salida_venta','ajuste','devolucion','merma')),
  cantidad          int  not null check (cantidad <> 0),  -- + entra, - sale
  referencia_venta  uuid references public.ventas(id) on delete set null,
  nota              text,
  usuario_id        uuid references public.profiles(id),
  created_at        timestamptz not null default now()
);
create index if not exists idx_mov_producto on public.movimientos_inventario(producto_id, created_at desc);
create index if not exists idx_mov_venta    on public.movimientos_inventario(referencia_venta);
comment on table public.movimientos_inventario is 'Append-only. El signo de cantidad ajusta productos.stock por trigger.';

-- ---------------------------------------------------------------------
-- Recordatorios y fechas importantes
-- ---------------------------------------------------------------------
create table if not exists public.recordatorios (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  descripcion  text,
  tipo         text not null default 'aviso'
               check (tipo in ('aviso','tarea','fecha_importante')),
  fecha        date,                       -- fechas importantes / vencimientos
  recurrente   text check (recurrente in ('anual')),  -- NULL = única
  fijado       boolean not null default false,         -- fijar en inicio
  creado_por   uuid references public.profiles(id),
  visible_para text not null default 'todos' check (visible_para in ('todos','admins')),
  completado   boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists idx_recordatorios_fecha on public.recordatorios(fecha);

-- ---------------------------------------------------------------------
-- Seguimientos (pedidos de clientes, encargos a proveedores, pendientes)
-- ---------------------------------------------------------------------
create table if not exists public.seguimientos (
  id                uuid primary key default gen_random_uuid(),
  tipo              text not null
                    check (tipo in ('pedido_cliente','encargo_proveedor','tarea_interna')),
  titulo            text not null,
  detalle           text,
  contacto          text,                  -- teléfono/WhatsApp
  estado            text not null default 'pendiente'
                    check (estado in ('pendiente','en_proceso','listo_para_entrega','entregado','cancelado')),
  fecha_compromiso  date,
  asignado_a        uuid references public.profiles(id),
  anticipo          numeric(10,2) not null default 0 check (anticipo >= 0),
  creado_por        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_seguimientos_estado   on public.seguimientos(estado);
create index if not exists idx_seguimientos_asignado on public.seguimientos(asignado_a);

create table if not exists public.seguimiento_notas (
  id             uuid primary key default gen_random_uuid(),
  seguimiento_id uuid not null references public.seguimientos(id) on delete cascade,
  nota           text not null,
  usuario_id     uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);
create index if not exists idx_seg_notas on public.seguimiento_notas(seguimiento_id, created_at);
