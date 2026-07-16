-- =====================================================================
-- Shira App · setup_completo.sql
-- Corre TODO de una vez en el SQL Editor de Supabase (orden correcto):
-- schema -> triggers/funciones -> RLS -> seed (inventario + fechas).
-- Es seguro correrlo más de una vez (idempotente).
-- =====================================================================

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


-- =====================================================================
-- Shira App · 0002_stock_and_sales.sql
-- Triggers de stock + funciones transaccionales de venta/anulación.
-- =====================================================================

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.productos;
create trigger set_updated_at before update on public.productos
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.seguimientos;
create trigger set_updated_at before update on public.seguimientos
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- Stock derivado de movimientos_inventario (append-only)
-- El signo de cantidad ajusta el stock. Movimientos no se editan/borran.
-- ---------------------------------------------------------------------
create or replace function public.tg_aplicar_movimiento()
returns trigger language plpgsql as $$
begin
  update public.productos
     set stock = stock + new.cantidad
   where id = new.producto_id;
  return new;
end;
$$;

drop trigger if exists aplicar_movimiento on public.movimientos_inventario;
create trigger aplicar_movimiento after insert on public.movimientos_inventario
  for each row execute function public.tg_aplicar_movimiento();

-- Blindaje: los movimientos son inmutables (auditoría)
create or replace function public.tg_movimiento_inmutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Los movimientos de inventario son inmutables (no se editan ni borran).';
end;
$$;

drop trigger if exists movimiento_no_update on public.movimientos_inventario;
create trigger movimiento_no_update before update or delete on public.movimientos_inventario
  for each row execute function public.tg_movimiento_inmutable();

-- ---------------------------------------------------------------------
-- Alta de perfil al crear usuario en auth (sin registro público).
-- role y nombre vienen del metadata que pone el admin al invitar.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nombre, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'vendedor')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Helpers de rol para RLS (security definer evita recursión en policies)
-- ---------------------------------------------------------------------
create or replace function public.rol_actual()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.rol_actual() = 'admin', false);
$$;

-- ---------------------------------------------------------------------
-- REGISTRAR VENTA (transaccional): crea venta + items + movimientos.
-- Los precios se toman del servidor (no del cliente) para evitar fraude.
-- p_items: jsonb [{ "producto_id": uuid, "cantidad": int }, ...]
-- ---------------------------------------------------------------------
create or replace function public.registrar_venta(
  p_items          jsonb,
  p_metodo_pago    text default 'efectivo',
  p_cliente_nombre text default null,
  p_descuento      numeric default 0,
  p_nota           text default null,
  p_permitir_stock_negativo boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_venta_id  uuid;
  v_folio     bigint;
  v_subtotal  numeric(10,2) := 0;
  v_total     numeric(10,2);
  v_item      jsonb;
  v_prod      public.productos%rowtype;
  v_cant      int;
  v_linea     numeric(10,2);
begin
  if v_uid is null then
    raise exception 'No autenticado.';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos.';
  end if;
  if coalesce(p_descuento, 0) > 0 and not public.es_admin() then
    raise exception 'Solo un administrador puede aplicar descuento.';
  end if;

  -- Crea la cabecera (subtotal/total se completan al final)
  insert into public.ventas (vendedor_id, cliente_nombre, metodo_pago, subtotal, descuento, total)
  values (v_uid, nullif(trim(p_cliente_nombre), ''), coalesce(p_metodo_pago,'efectivo'), 0, coalesce(p_descuento,0), 0)
  returning id, folio into v_venta_id, v_folio;

  -- Recorre los items
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_cant := (v_item->>'cantidad')::int;
    if v_cant is null or v_cant <= 0 then
      raise exception 'Cantidad inválida en un producto.';
    end if;

    select * into v_prod from public.productos
      where id = (v_item->>'producto_id')::uuid and activo = true
      for update;
    if not found then
      raise exception 'Producto no encontrado o inactivo.';
    end if;

    if v_prod.stock < v_cant and not (p_permitir_stock_negativo and public.es_admin()) then
      raise exception 'Stock insuficiente de "%": disponible %, solicitado %.',
        v_prod.nombre, v_prod.stock, v_cant;
    end if;

    v_linea := round(v_prod.precio_venta * v_cant, 2);
    v_subtotal := v_subtotal + v_linea;

    insert into public.venta_items (venta_id, producto_id, cantidad, precio_unitario, total_linea)
    values (v_venta_id, v_prod.id, v_cant, v_prod.precio_venta, v_linea);

    insert into public.movimientos_inventario (producto_id, tipo, cantidad, referencia_venta, usuario_id, nota)
    values (v_prod.id, 'salida_venta', -v_cant, v_venta_id, v_uid, 'Venta V-' || lpad(v_folio::text, 4, '0'));
  end loop;

  v_total := greatest(v_subtotal - coalesce(p_descuento, 0), 0);

  update public.ventas
     set subtotal = v_subtotal, total = v_total
   where id = v_venta_id;

  return jsonb_build_object('venta_id', v_venta_id, 'folio', v_folio, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------------
-- ANULAR VENTA (solo admin): marca anulada y devuelve el stock.
-- ---------------------------------------------------------------------
create or replace function public.anular_venta(p_venta_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_estado text;
  v_folio  bigint;
  v_it     record;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede anular ventas.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Debe indicar el motivo de la anulación.';
  end if;

  select estado, folio into v_estado, v_folio from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'Venta no encontrada.';
  end if;
  if v_estado = 'anulada' then
    raise exception 'La venta ya está anulada.';
  end if;

  update public.ventas
     set estado = 'anulada',
         nota   = trim(coalesce(nota,'') || ' [ANULADA: ' || p_motivo || ']')
   where id = p_venta_id;

  -- Devuelve el stock con movimientos de devolución
  for v_it in select producto_id, cantidad from public.venta_items where venta_id = p_venta_id
  loop
    insert into public.movimientos_inventario (producto_id, tipo, cantidad, referencia_venta, usuario_id, nota)
    values (v_it.producto_id, 'devolucion', v_it.cantidad, p_venta_id, v_uid,
            'Anulación V-' || lpad(v_folio::text, 4, '0') || ': ' || p_motivo);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- ENTRADA / AJUSTE de inventario (registro auditado de un movimiento).
-- Vendedores no ajustan stock; el app lo restringe a admin (y RLS).
-- ---------------------------------------------------------------------
create or replace function public.registrar_movimiento(
  p_producto_id uuid,
  p_tipo        text,     -- 'entrada' | 'ajuste' | 'merma' | 'devolucion'
  p_cantidad    int,      -- con signo (+ entra, - sale)
  p_nota        text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede mover inventario manualmente.';
  end if;
  if p_tipo = 'salida_venta' then
    raise exception 'Las salidas por venta se registran desde el punto de venta.';
  end if;
  if p_tipo in ('ajuste','merma') and coalesce(trim(p_nota),'') = '' then
    raise exception 'Los ajustes y mermas requieren una nota.';
  end if;

  insert into public.movimientos_inventario (producto_id, tipo, cantidad, usuario_id, nota)
  values (p_producto_id, p_tipo, p_cantidad, v_uid, nullif(trim(p_nota),''))
  returning id into v_id;

  return v_id;
end;
$$;


-- =====================================================================
-- Shira App · 0003_rls.sql
-- Row Level Security. Roles: admin, vendedor, contador (solo lectura).
-- Las funciones registrar_venta/anular_venta/registrar_movimiento son
-- SECURITY DEFINER: hacen las escrituras controladas de forma segura.
-- =====================================================================

alter table public.profiles               enable row level security;
alter table public.categorias             enable row level security;
alter table public.productos              enable row level security;
alter table public.ventas                 enable row level security;
alter table public.venta_items            enable row level security;
alter table public.movimientos_inventario enable row level security;
alter table public.recordatorios          enable row level security;
alter table public.seguimientos           enable row level security;
alter table public.seguimiento_notas      enable row level security;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.es_admin());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = public.rol_actual());

-- ---------------------------------------------------------------------
-- categorias  (lectura para todos; escritura admin)
-- ---------------------------------------------------------------------
drop policy if exists categorias_read on public.categorias;
create policy categorias_read on public.categorias
  for select to authenticated using (true);

drop policy if exists categorias_admin on public.categorias;
create policy categorias_admin on public.categorias
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------------------------------------------------------------------
-- productos  (lectura para todos; crear/editar solo admin)
-- ---------------------------------------------------------------------
drop policy if exists productos_read on public.productos;
create policy productos_read on public.productos
  for select to authenticated using (true);

drop policy if exists productos_admin on public.productos;
create policy productos_admin on public.productos
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------------------------------------------------------------------
-- ventas / venta_items  (lectura todos; escritura vía RPC. Sin insert/update directo)
-- ---------------------------------------------------------------------
drop policy if exists ventas_read on public.ventas;
create policy ventas_read on public.ventas
  for select to authenticated using (true);

drop policy if exists venta_items_read on public.venta_items;
create policy venta_items_read on public.venta_items
  for select to authenticated using (true);
-- (no hay policies de insert/update/delete: solo las funciones SECURITY DEFINER escriben)

-- ---------------------------------------------------------------------
-- movimientos_inventario  (lectura todos; insert directo solo admin)
-- ---------------------------------------------------------------------
drop policy if exists mov_read on public.movimientos_inventario;
create policy mov_read on public.movimientos_inventario
  for select to authenticated using (true);

drop policy if exists mov_admin_insert on public.movimientos_inventario;
create policy mov_admin_insert on public.movimientos_inventario
  for insert to authenticated with check (public.es_admin());

-- ---------------------------------------------------------------------
-- recordatorios
--   lectura: 'todos' para cualquiera; 'admins' solo admin
--   crear/editar: el creador o admin (avisos de empresa: el app restringe a admin)
-- ---------------------------------------------------------------------
drop policy if exists recordatorios_read on public.recordatorios;
create policy recordatorios_read on public.recordatorios
  for select to authenticated
  using (visible_para = 'todos' or public.es_admin());

drop policy if exists recordatorios_insert on public.recordatorios;
create policy recordatorios_insert on public.recordatorios
  for insert to authenticated
  with check (public.rol_actual() in ('admin','vendedor') and creado_por = auth.uid());

drop policy if exists recordatorios_update on public.recordatorios;
create policy recordatorios_update on public.recordatorios
  for update to authenticated
  using (creado_por = auth.uid() or public.es_admin());

drop policy if exists recordatorios_delete on public.recordatorios;
create policy recordatorios_delete on public.recordatorios
  for delete to authenticated
  using (creado_por = auth.uid() or public.es_admin());

-- ---------------------------------------------------------------------
-- seguimientos  (vendedor y admin gestionan; contador solo lee)
-- ---------------------------------------------------------------------
drop policy if exists seguimientos_read on public.seguimientos;
create policy seguimientos_read on public.seguimientos
  for select to authenticated using (true);

drop policy if exists seguimientos_write on public.seguimientos;
create policy seguimientos_write on public.seguimientos
  for all to authenticated
  using (public.rol_actual() in ('admin','vendedor'))
  with check (public.rol_actual() in ('admin','vendedor'));

drop policy if exists seg_notas_read on public.seguimiento_notas;
create policy seg_notas_read on public.seguimiento_notas
  for select to authenticated using (true);

drop policy if exists seg_notas_write on public.seguimiento_notas;
create policy seg_notas_write on public.seguimiento_notas
  for insert to authenticated
  with check (public.rol_actual() in ('admin','vendedor') and usuario_id = auth.uid());

-- ---------------------------------------------------------------------
-- Permisos de ejecución de las funciones RPC
-- ---------------------------------------------------------------------
grant execute on function public.registrar_venta(jsonb, text, text, numeric, text, boolean) to authenticated;
grant execute on function public.anular_venta(uuid, text)                                     to authenticated;
grant execute on function public.registrar_movimiento(uuid, text, int, text)                  to authenticated;


-- =====================================================================
-- Shira App · seed.sql
-- Inventario inicial confirmado (17/06/2026): 28 renglones, 828 u,
-- Q 83,705.00 a precio de venta. + fechas importantes litúrgicas.
-- Idempotente: se puede correr varias veces sin duplicar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Categorías
-- ---------------------------------------------------------------------
insert into public.categorias (nombre, prefijo, orden) values
  ('Biblias',            'BIB', 1),
  ('Libros litúrgicos',  'LIT', 2),
  ('Otros artículos',    'OTR', 3)
on conflict (prefijo) do nothing;

-- ---------------------------------------------------------------------
-- Productos (stock inicia en 0; lo fija el movimiento de entrada)
-- ---------------------------------------------------------------------
insert into public.productos (categoria_id, nombre, sku, precio_venta)
select c.id, d.nombre, d.sku, d.precio
from (values
  -- Biblias
  ('BIB','Latino Vinil',            'BIB-001', 200.00),
  ('BIB','Latino con Uñero',        'BIB-002', 250.00),
  ('BIB','Latino Letra Grande',     'BIB-003', 185.00),
  ('BIB','Latino Pequeña',          'BIB-004', 135.00),
  ('BIB','Jóvenes',                 'BIB-005', 250.00),
  ('BIB','Jóvenes Pasta Suave',     'BIB-006', 200.00),
  ('BIB','Jerusalén con Forro',     'BIB-007', 425.00),
  ('BIB','Familia Pasta Dura',      'BIB-008', 250.00),
  ('BIB','Familia Pasta Suave',     'BIB-009', 200.00),
  ('BIB','Jerusalén Pasta Suave',   'BIB-010', 375.00),
  ('BIB','Jerusalén Pasta Dura',    'BIB-011', 400.00),
  ('BIB','Jerusalén Latino',        'BIB-012', 250.00),
  ('BIB','Nuestro Pueblo Pequeña',  'BIB-013', 130.00),
  ('BIB','Nuestro Pueblo Grande',   'BIB-014', 190.00),
  ('BIB','Latino Normal',           'BIB-015', 160.00),
  -- Libros litúrgicos
  ('LIT','Leccionario',             'LIT-001', 1000.00),
  ('LIT','Bautismo de Niños',       'LIT-002', 470.00),
  ('LIT','Matrimonio',              'LIT-003', 460.00),
  ('LIT','Roguemos al Señor',       'LIT-004', 400.00),
  ('LIT','Oración de los Fieles',   'LIT-005', 900.00),
  ('LIT','Diurnal',                 'LIT-006', 875.00),
  ('LIT','Semana Santa',            'LIT-007', 470.00),
  ('LIT','Copón y Cáliz',           'LIT-008', 6000.00),
  ('LIT','Monaguillos',             'LIT-009', 75.00),
  -- Otros artículos
  ('OTR','Rosario',                 'OTR-001', 5.00),
  ('OTR','Camisa talla L',          'OTR-002', 175.00),
  ('OTR','Camisa talla XL',         'OTR-003', 200.00),
  ('OTR','Camisa talla M',          'OTR-004', 175.00)
) as d(prefijo, nombre, sku, precio)
join public.categorias c on c.prefijo = d.prefijo
on conflict (sku) do nothing;

-- ---------------------------------------------------------------------
-- Movimiento de entrada "Inventario inicial" por producto (auditado)
-- ---------------------------------------------------------------------
insert into public.movimientos_inventario (producto_id, tipo, cantidad, nota)
select p.id, 'entrada', d.cant, 'Inventario inicial 17/06/2026'
from (values
  ('BIB-001',6),('BIB-002',20),('BIB-003',127),('BIB-004',43),('BIB-005',28),
  ('BIB-006',1),('BIB-007',2),('BIB-008',2),('BIB-009',1),('BIB-010',17),
  ('BIB-011',8),('BIB-012',21),('BIB-013',7),('BIB-014',1),('BIB-015',1),
  ('LIT-001',1),('LIT-002',4),('LIT-003',5),('LIT-004',3),('LIT-005',1),
  ('LIT-006',1),('LIT-007',7),('LIT-008',1),('LIT-009',1),
  ('OTR-001',500),('OTR-002',12),('OTR-003',1),('OTR-004',6)
) as d(sku, cant)
join public.productos p on p.sku = d.sku
where not exists (
  select 1 from public.movimientos_inventario m
  where m.producto_id = p.id
    and m.tipo = 'entrada'
    and m.nota = 'Inventario inicial 17/06/2026'
);

-- ---------------------------------------------------------------------
-- Fechas importantes (litúrgicas y comerciales)
--   Fijas -> recurrente 'anual'.  Movibles -> se carga la del año 2026.
-- ---------------------------------------------------------------------
insert into public.recordatorios (titulo, descripcion, tipo, fecha, recurrente, visible_para)
select v.titulo, v.descripcion, 'fecha_importante', v.fecha::date, v.recurrente, v.visible_para
from (values
  ('Mes de la Biblia',              'Temporada de alta venta de biblias.',              '2026-09-01', 'anual', 'todos'),
  ('Día de la Virgen de Guadalupe', 'Alta demanda de artículos religiosos.',            '2026-12-12', 'anual', 'todos'),
  ('Navidad',                       'Temporada alta comercial.',                        '2026-12-25', 'anual', 'todos'),
  ('Inicio de Adviento',            'Comienza la temporada de Adviento (fecha 2026).',  '2026-11-29', null,    'todos'),
  ('Miércoles de Ceniza',           'Inicio de Cuaresma (fecha 2026, varía cada año).', '2026-02-18', null,    'todos'),
  ('Domingo de Ramos',              'Inicio de Semana Santa (fecha 2026).',             '2026-03-29', null,    'todos'),
  ('Semana Santa',                  'Temporada alta de libros litúrgicos (2026).',      '2026-04-02', null,    'todos'),
  ('Corpus Christi',                'Fecha litúrgica 2026 (varía cada año).',           '2026-06-07', null,    'todos'),
  ('Primeras Comuniones y Confirmaciones', 'Temporada mayo–octubre.',                   '2026-05-01', 'anual', 'todos'),
  ('Declaración y pago de IVA',     'Recordatorio mensual para los socios.',            '2026-07-31', null,    'admins')
) as v(titulo, descripcion, fecha, recurrente, visible_para)
where not exists (
  select 1 from public.recordatorios r
  where r.titulo = v.titulo and r.tipo = 'fecha_importante'
);
